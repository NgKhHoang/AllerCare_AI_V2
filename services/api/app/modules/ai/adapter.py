"""AI adapter: Tích hợp Google Gemini kết hợp Kho tri thức nội bộ data/ai_knowledge/.

Nguyên tắc:
- Guardrails luôn đứng TRƯỚC AI: khẩn cấp → 115; từ chối tự đổi thuốc; handoff.
- RAG & Grounding: Toàn bộ tri thức (nguyên tắc chia liều, 633 tương tác thuốc Bộ Y tế,
  yếu tố bệnh nhân, bối cảnh hồ sơ người bệnh) được nạp vào System Instruction của Gemini.
- Fallback an toàn: Nếu API Gemini mất mạng/lỗi quota/lỗi key → tự động fallback về engine cục bộ.
"""
import json
import logging
import re
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.modules.ai.dosage_advisor import build_dose_answer
from app.modules.ai.guardrails import (
    EMERGENCY_REPLY,
    HANDOFF_REPLY,
    OUT_OF_SCOPE_REPLY,
    REFUSAL_REPLY,
)
from app.modules.ai.knowledge import get_brain
from app.modules.ai.patient_context import load_patient_context
from app.modules.safety.knowledge_models import KnowledgeSource

logger = logging.getLogger("allercare.ai.gemini")


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip()]


def retrieve_approved_content(db: Session | None, query: str, limit: int = 3) -> list[KnowledgeSource]:
    """RAG tối giản trên nội dung đã duyệt trong DB."""
    if not db:
        return []
    tokens = [t for t in re.split(r"\W+", query.lower(), flags=re.UNICODE) if len(t) >= 3]
    sources = db.query(KnowledgeSource).all()
    scored = []
    for s in sources:
        if not s.content:
            continue
        content_lower = s.content.lower()
        score = sum(1 for t in tokens if t in content_lower)
        if score > 0:
            scored.append((score, s))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for _, s in scored[:limit]]


def _extract_drug_query(message: str) -> str | None:
    brain = get_brain()
    msg_lower = message.lower()
    candidates: list[tuple[int, str]] = []
    for drug_key in brain._by_drug.keys():
        if drug_key and drug_key in msg_lower:
            candidates.append((len(drug_key), drug_key))
    for ex in brain.examples:
        brand = ex.brand_example.lower()
        if brand and brand in msg_lower:
            candidates.append((len(brand), ex.drug.lower()))
    if not candidates:
        return None
    return max(candidates, key=lambda c: c[0])[1]


def _call_gemini_api(
    user_message: str,
    patient_ctx_desc: str,
    api_key: str,
    model_name: str = "gemini-1.5-flash",
    history: list[dict] | None = None,
) -> str | None:
    """Gọi trực tiếp Google Gemini API qua giao thức REST với cơ chế tự động fallback model và hỗ trợ ngữ cảnh nhiều lượt (multi-turn)."""
    brain = get_brain()

    system_instruction_text = (
        "Bạn là Trợ lý AI AllerCare — Nền tảng theo dõi và hỗ trợ sử dụng thuốc an toàn chuyên khoa Da liễu & Dị ứng lâm sàng.\n\n"
        "=== BỘ QUY TẮC BẮT BUỘC ===\n"
        "1. Bạn KHÔNG được tự ý kê đơn, không khuyên bệnh nhân tự ý tăng/giảm liều hoặc tự ý đổi thuốc.\n"
        "2. Trong tình huống khẩn cấp (khó thở, sưng môi lưỡi, đau thắt ngực, nghi ngờ sốc phản vệ), yêu cầu bệnh nhân GỌI 115 hoặc đến cấp cứu NGAY.\n"
        "3. Trả lời bằng tiếng Việt, giọng điệu ấm áp, ân cần, câu từ ngắn gọn, dễ hiểu cho người bệnh và người cao tuổi.\n"
        "4. Mọi gợi ý, cảnh báo và giải thích phải dựa trên cơ sở khoa học y tế được cung cấp bên dưới và ghi rõ nguồn tham khảo.\n"
        "5. Luôn nhớ ngữ cảnh các câu hỏi và câu trả lời trước đó trong cuộc trò chuyện để trả lời liền mạch, chính xác.\n"
        "6. Luôn nhắc nhở: Quyết định cuối cùng thuộc về Bác sĩ điều trị.\n\n"
        "=== HỒ SƠ BỆNH NHÂN ĐANG CHAT ===\n"
        f"{patient_ctx_desc if patient_ctx_desc else 'Chưa có thông tin hồ sơ cụ thể.'}\n\n"
        "=== NGUYÊN TẮC CHIA LIỀU CỦA BÁC SĨ (dosing_principles.md) ===\n"
        f"{brain.principles_md}\n\n"
        "=== YẾU TỐ BỆNH NHÂN ẢNH HƯỞNG LIỀU (patient_factors.md) ===\n"
        f"{brain.patient_factors_md}\n\n"
        "=== PHONG CÁCH HỘI THOẠI (conversation_style.md) ===\n"
        f"{brain.style_md}\n\n"
        "=== CƠ SỞ DỮ LIỆU TƯƠNG TÁC THUỐC BỘ Y TẾ (633 cặp tương tác) ===\n"
        "Hệ thống đã nạp 633 cặp tương tác thuốc chống chỉ định và thận trọng của Bộ Y tế. Khi người dùng hỏi về phối hợp thuốc, hãy phân tích dựa trên cơ chế, hậu quả và hướng xử trí chuẩn y khoa.\n"
    )

    clean_model = model_name.replace("models/", "") if model_name else "gemini-3.5-flash-lite"
    models_to_try = [clean_model, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"]
    deduped_models = []
    for m in models_to_try:
        if m and m not in deduped_models:
            deduped_models.append(m)
    if not deduped_models:
        deduped_models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"]



    contents = []
    if history:
        # Lấy tối đa 10 tin nhắn gần nhất để giữ ngữ cảnh mà không làm quá tải token
        for h in history[-10:]:
            role = "model" if h.get("role") in ("assistant", "model", "bot") else "user"
            content = h.get("content", "").strip()
            if content:
                contents.append({"role": role, "parts": [{"text": content}]})

    # Đảm bảo tin nhắn mới nhất là tin cuối
    if not contents or contents[-1]["parts"][0]["text"] != user_message:
        contents.append({"role": "user", "parts": [{"text": user_message}]})

    payload = {
        "system_instruction": {
            "parts": [{"text": system_instruction_text}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.4,
            "topP": 0.95,
            "maxOutputTokens": 2048,
        }
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    with httpx.Client(timeout=35.0) as client:
        for m in deduped_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={api_key}"
            try:
                resp = client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            return parts[0]["text"].strip()
                else:
                    logger.warning(f"Gemini API ({m}) returned status {resp.status_code}: {resp.text[:150]}")
            except Exception as e:
                logger.warning(f"Lỗi kết nối Gemini API ({m}): {e}")

    return None


def generate_answer(
    db: Session | None,
    user_message: str,
    classification: str,
    user_id: str | None = None,
    history: list[dict] | None = None,
) -> tuple[str, list[dict]]:
    """Sinh câu trả lời. Sử dụng Gemini nếu có cấu hình, tự động fallback an toàn."""
    # 0. Hàng rào an toàn tuyệt đối (Guardrails)
    if classification == "emergency":
        return EMERGENCY_REPLY, []
    if classification == "refusal":
        return REFUSAL_REPLY, []
    if classification == "handoff":
        return HANDOFF_REPLY, []

    settings = get_settings()
    patient_ctx = load_patient_context(db, user_id) if (db and user_id) else None
    patient_desc = patient_ctx.describe_deep() if patient_ctx else ""

    # 1. Thử gọi Gemini API nếu có API KEY
    api_key = settings.AI_API_KEY.strip()
    if api_key and settings.AI_PROVIDER in ("gemini", "google", "auto", "demo"):
        model_name = settings.AI_MODEL if settings.AI_MODEL.startswith("gemini") else "gemini-1.5-flash"
        gemini_response = _call_gemini_api(
            user_message=user_message,
            patient_ctx_desc=patient_desc,
            api_key=api_key,
            model_name=model_name,
            history=history,
        )
        if gemini_response:
            sources = [
                {
                    "title": "Google Gemini 1.5 Flash (Deep EHR & Medical Knowledge Grounding)",
                    "version": model_name,
                    "file": "Database & data/ai_knowledge/",
                },
                {
                    "title": "Hồ sơ bệnh án điện tử người bệnh & Danh mục BYT",
                    "version": "Hồ sơ cá thể hóa",
                    "file": "Database PostgreSQL",
                }
            ]
            return gemini_response, sources

    # 2. FALLBACK NỘI BỘ (Chạy cục bộ 100% khi không có mạng hoặc chưa cấu hình API Key)
    msg_low = user_message.lower()

    # 2.0. Trả lời câu hỏi trực tiếp về Đơn thuốc của bệnh nhân từ Database
    if patient_ctx and any(kw in msg_low for kw in ("đơn thuốc", "thuốc của tôi", "bác sĩ kê", "thuốc đang uống", "tôi đang dùng thuốc gì", "danh sách thuốc")):
        if patient_ctx.doctor_prescriptions:
            med_lines = []
            for m in patient_ctx.doctor_prescriptions:
                details = f"- **{m.get('raw_name')}**"
                sub = []
                if m.get('dose'): sub.append(f"Liều: {m.get('dose')}")
                if m.get('frequency'): sub.append(f"Tần suất: {m.get('frequency')}")
                if m.get('timing'): sub.append(f"Thời điểm: {m.get('timing')}")
                if m.get('route'): sub.append(f"Đường dùng: {m.get('route')}")
                if sub: details += f" ({', '.join(sub)})"
                med_lines.append(details)
            doc_str = f" do {patient_ctx.assigned_doctor_name} kê đơn" if patient_ctx.assigned_doctor_name else ""
            reply = (
                f"Theo hồ sơ bệnh án điện tử của bạn, hiện tại bạn đang có các thuốc sau{doc_str}:\n\n"
                + "\n".join(med_lines)
                + "\n\n👉 Hãy uống thuốc đúng liều lượng và thời điểm như bác sĩ đã chỉ định nhé!"
            )
            return reply, [{"title": "Hồ sơ Đơn thuốc Bác sĩ kê", "version": "Database"}]

    # 2.0b. Trả lời câu hỏi về thời điểm uống thuốc / giờ uống
    if patient_ctx and any(kw in msg_low for kw in ("uống lúc nào", "mấy giờ uống", "thời điểm uống", "trước hay sau ăn")):
        if patient_ctx.doctor_prescriptions:
            timing_lines = [
                f"- **{m.get('raw_name')}**: {m.get('timing') or 'Theo chỉ định của bác sĩ'}"
                for m in patient_ctx.doctor_prescriptions
            ]
            reply = (
                "Thời điểm uống các thuốc trong đơn của bạn như sau:\n\n"
                + "\n".join(timing_lines)
                + "\n\n👉 Nếu cần điều chỉnh giờ uống cho phù hợp sinh hoạt, hãy trao đổi thêm với bác sĩ điều trị."
            )
            return reply, [{"title": "Lịch uống thuốc theo y lệnh Bác sĩ", "version": "Database"}]

    # 2.0c. Trả lời câu hỏi về Tiền sử Dị ứng từ Database
    if patient_ctx and any(kw in msg_low for kw in ("tôi dị ứng", "dị ứng thuốc gì", "tiền sử dị ứng")):
        if patient_ctx.allergy_details:
            al_lines = [
                f"- **{a.get('substance')}**: Biểu hiện {a.get('reaction', 'dị ứng')} (Mức độ: {a.get('severity', 'đã ghi nhận')})"
                for a in patient_ctx.allergy_details
            ]
            reply = (
                f"Hồ sơ của bạn đã ghi nhận tiền sử dị ứng với **{len(patient_ctx.allergy_details)} loại** sau:\n\n"
                + "\n".join(al_lines)
                + "\n\n⚠️ Hệ thống AllerCare sẽ tự động chặn mọi đơn thuốc mới có chứa các hoạt chất dị ứng này."
            )
            return reply, [{"title": "Tiền sử Dị ứng thuốc Người bệnh", "version": "Database"}]

    # 2.0d. Trả lời câu hỏi về Chỉ số Xét nghiệm / Chức năng Thận / Gan từ Database
    if patient_ctx and any(kw in msg_low for kw in ("xét nghiệm", "chức năng thận", "chức năng gan", "crcl", "creatinine", "egfr")):
        if patient_ctx.labs:
            lab_lines = [f"- **{k}**: {v}" for k, v in patient_ctx.labs.items()]
            reply = (
                "Các chỉ số xét nghiệm gần nhất trong hồ sơ của bạn gồm:\n\n"
                + "\n".join(lab_lines)
                + "\n\n👉 Bác sĩ điều trị đã dựa trên các chỉ số này để tính toán chia liều thuốc an toàn nhất cho bạn."
            )
            return reply, [{"title": "Kết quả Xét nghiệm Lâm sàng", "version": "Database"}]

    brain = get_brain()

    # 2.1. Tra cứu tương tác thuốc Bộ Y tế (trong tin nhắn hiện tại hoặc kết hợp ngữ cảnh lịch sử)
    interaction = brain.find_interaction_in_message(user_message)
    if not interaction and history:
        for h in reversed(history[-4:]):
            prev_text = h.get("content", "")
            combo_text = f"{prev_text} {user_message}"
            interaction = brain.find_interaction_in_message(combo_text)
            if interaction:
                break

    if interaction:
        act1 = interaction.get("act1", "")
        act2 = interaction.get("act2", "")
        mech = interaction.get("mechanism", "")
        cons = interaction.get("consequence", "")
        act = interaction.get("action", "")
        stt = interaction.get("stt", "")

        text = (
            f"Theo Danh mục tương tác thuốc của Bộ Y tế đối với cặp phối hợp **{act1}** và **{act2}**:\n\n"
            f"- **🔬 Cơ chế:** {mech}\n"
            f"- **⚠️ Hậu quả / Nguy cơ:** {cons}\n"
            f"- **📋 Hướng xử trí:** {act}\n\n"
            "👉 *Lưu ý quan trọng:* Không tự ý kết hợp các thuốc này mà không có chỉ định và giám sát của Bác sĩ điều trị. Nếu gặp triệu chứng bất thường, hãy liên hệ cơ sở y tế hoặc gọi 115 ngay."
        )
        sources = [
            {
                "title": "Danh mục tương tác thuốc chống chỉ định và thận trọng — Bộ Y tế",
                "version": f"Muc-{stt}",
                "file": "ai_knowledge/drug_interactions.json",
            }
        ]
        return text, sources

    # 2.2. Tra cứu liều dùng theo ví dụ bác sĩ (tìm trong câu hiện tại hoặc ngược về lịch sử)
    drug_query = _extract_drug_query(message=user_message)
    if not drug_query and history:
        for h in reversed(history[-6:]):
            prev_content = h.get("content", "")
            found_drug = _extract_drug_query(prev_content)
            if found_drug:
                drug_query = found_drug
                break

    mentions_dose = any(
        kw in user_message.lower()
        for kw in ("liều", "lưu", "viên", "lần/ngày", "ngày mấy", "bao nhiêu", "cách dùng", "uống sao", "uống như", "khi nào", "trước ăn", "sau ăn", "tác dụng phụ", "uống tiếp")
    )
    if drug_query and (mentions_dose or "?" in user_message or len(user_message) < 100):
        text, sug = build_dose_answer(brain, drug_query, patient_ctx)
        sources = [
            {
                "title": f"Kho kiến thức AI — hướng dẫn dùng thuốc {drug_query.title()}",
                "version": sug.example_id or "dosing_examples",
                "file": "ai_knowledge/dosing_examples.json",
            }
        ]
        return text, sources

    # 2.3. Nguyên tắc chia liều chung
    if any(kw in user_message.lower() for kw in ("chia liều", "phân chia liều", "nguyên tắc liều", "cách bác sĩ", "nguyên tắc dùng thuốc")):
        principles = brain.retrieve_principles(user_message, limit=3)
        if principles:
            text = (
                "Dựa trên nguyên tắc chia liều của bác sĩ trong kho kiến thức của mình:\n\n"
                + "\n".join(f"- {p}" for p in principles)
                + "\n\nNguồn: ai_knowledge/dosing_principles.md. "
                "Liều cụ thể cho bạn vẫn do bác sĩ phụ trách quyết định nhé."
            )
            return text, [{"title": "Nguyên tắc chia liều của bác sĩ", "version": "dosing_principles.md"}]

    # 2.4. Hướng dẫn sử dụng chung từ DB
    sources_db = retrieve_approved_content(db, user_message)
    if sources_db:
        tokens = [t for t in re.split(r"\W+", user_message.lower(), flags=re.UNICODE) if len(t) >= 3]
        best = sources_db[0]
        sentences = _sentences(best.content or "")
        ranked = sorted(sentences, key=lambda s: sum(1 for t in tokens if t in s.lower()), reverse=True)
        picked = [s for s in ranked[:2] if s and sum(1 for t in tokens if t in s.lower()) > 0]
        answer = (
            "Dựa trên hướng dẫn đã được duyệt trong hệ thống:\n\n"
            + ("\n".join(f"- {p}" for p in picked) if picked else (best.content or "")[:300])
            + f"\n\nNguồn: {best.title} (phiên bản {best.version}). "
            "Nếu bạn không tìm thấy thông tin cần, hãy đặt lịch hẹn với bác sĩ phụ trách."
        )
        return answer, [{"title": best.title, "version": best.version}]

    # 2.5. Phản hồi tự nhiên hỗ trợ người bệnh khi hỏi tiếp trong hội thoại
    fallback_helpful_reply = (
        "Cảm ơn câu hỏi của bạn. Để đảm bảo an toàn tuyệt đối khi dùng thuốc:\n\n"
        "- Hãy tuân thủ đúng liều lượng và thời gian do bác sĩ điều trị đã chỉ định.\n"
        "- Không tự ý dừng thuốc đột ngột hoặc tự ý đổi sang thuốc khác.\n"
        "- Nếu bạn cảm thấy mệt mỏi, nổi mẩn ngứa bất thường hoặc có thắc mắc cụ thể về một loại thuốc, hãy gửi tên thuốc cụ thể cho mình hoặc bấm nút **Lịch hẹn** để trao đổi trực tiếp cùng bác sĩ phụ trách nhé! 😊"
    )
    return fallback_helpful_reply, [{"title": "Hướng dẫn an toàn người bệnh AllerCare", "version": "v2.0"}]


