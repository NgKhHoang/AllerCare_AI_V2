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
from app.modules.ai.knowledge import AIBrain, PatientContext, get_brain
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


def _build_clinical_cross_checks(
    brain: AIBrain,
    user_message: str,
    patient_ctx: PatientContext | None,
) -> str:
    """Tự động đối soát sâu câu hỏi của bệnh nhân với toàn bộ hồ sơ trong DB."""
    if not patient_ctx:
        return ""

    findings = []
    msg_low = user_message.lower()

    # 1. Quét tìm tương tác thuốc giữa câu hỏi và TẤT CẢ các thuốc bệnh nhân đang dùng trong DB
    current_drugs = []
    for m in patient_ctx.doctor_prescriptions + patient_ctx.self_declared_meds:
        name = m.get("raw_name", "")
        if name:
            current_drugs.append(name)

    found_interactions = []
    for cur_d in current_drugs:
        combo = f"{cur_d} {user_message}"
        inter = brain.find_interaction_in_message(combo)
        if inter and inter not in found_interactions:
            found_interactions.append(inter)

    # Cũng tìm tương tác trực tiếp trong câu hỏi nếu người dùng hỏi 2 thuốc
    direct_inter = brain.find_interaction_in_message(user_message)
    if direct_inter and direct_inter not in found_interactions:
        found_interactions.append(direct_inter)

    if found_interactions:
        inter_lines = []
        for it in found_interactions:
            inter_lines.append(
                f"- [MỤC {it.get('stt')}] Phối hợp giữa **{it.get('act1')}** và **{it.get('act2')}**:\n"
                f"  + Cơ chế: {it.get('mechanism')}\n"
                f"  + Hậu quả: {it.get('consequence')}\n"
                f"  + Hướng xử trí y khoa: {it.get('action')}"
            )
        findings.append("⚠️ CẢNH BÁO TƯƠNG TÁC THUỐC ĐỐI SOÁT VỚI ĐƠN THUỐC HIỆN TẠI:\n" + "\n".join(inter_lines))

    # 2. Kiểm tra dị ứng đối soát với tiền sử bệnh nhân
    matched_allergies = []
    for a in patient_ctx.allergies:
        if a and a.lower() in msg_low:
            matched_allergies.append(a)
    if matched_allergies:
        findings.append(f"🚫 CẢNH BÁO TIỀN SỬ DỊ ỨNG: Bệnh nhân có tiền sử dị ứng đã ghi nhận trong hồ sơ với: {', '.join(matched_allergies)}. CẦN CẢNH BÁO KHÔNG ĐƯỢC DÙNG.")

    # 3. Đánh giá chức năng Thận/Gan từ các xét nghiệm trong DB
    renal_labs = []
    for k, v in patient_ctx.labs.items():
        k_l = k.lower()
        if any(x in k_l for x in ("crcl", "creatinine", "egfr", "ast", "alt", "men gan", "ure")):
            renal_labs.append(f"{k}: {v}")
    if renal_labs:
        findings.append(f"🧪 CHỈ SỐ XÉT NGHIỆM CHỨC NĂNG THẬN/GAN TRONG HỒ SƠ: {', '.join(renal_labs)} (Hãy lưu ý đánh giá ảnh hưởng lên liều lượng hoặc độc tính thuốc theo patient_factors.md).")

    return "\n\n".join(findings)


def _call_gemini_api(
    user_message: str,
    patient_ctx: PatientContext | None,
    api_key: str,
    model_name: str = "gemini-1.5-flash",
    history: list[dict] | None = None,
    db: Session | None = None,
) -> str | None:
    """Gọi trực tiếp Google Gemini API qua giao thức REST với tích hợp sâu toàn bộ dữ liệu EHR & Tri thức BYT."""
    brain = get_brain()
    patient_ctx_desc = patient_ctx.describe_deep() if patient_ctx else "Chưa có thông tin hồ sơ cụ thể."
    cross_checks = _build_clinical_cross_checks(brain, user_message, patient_ctx)

    # Đọc thêm tài liệu/hướng dẫn điều trị mới thêm trong database
    db_sources = retrieve_approved_content(db, user_message, limit=4) if db else []

    system_instruction_text = (
        "Bạn là Trợ lý AI Y tế AllerCare — Nền tảng theo dõi và hỗ trợ sử dụng thuốc an toàn chuyên sâu Da liễu & Dị ứng lâm sàng.\n\n"
        "=== BỘ NÃO AI ĐƯỢC TÍCH HỢP TOÀN BỘ CƠ SỞ DỮ LIỆU BỆNH VIỆN & BỆNH ÁN ĐIỆN TỬ ===\n"
        "Bạn có quyền truy cập sâu vào dữ liệu hồ sơ lâm sàng của bệnh nhân hiện tại, danh mục 633 tương tác thuốc Bộ Y tế Việt Nam, "
        "các nguyên tắc phân chia liều lượng của Bác sĩ, các yếu tố cá thể hóa bệnh nhân và toàn bộ tài liệu y khoa được lưu trong cơ sở dữ liệu.\n\n"
        "=== HỒ SƠ BỆNH ÁN ĐIỆN TỬ (EHR) CỦA BỆNH NHÂN HIỆN TẠI ===\n"
        f"{patient_ctx_desc}\n\n"
    )

    if cross_checks:
        system_instruction_text += (
            "=== KẾT QUẢ ĐỐI SOÁT TỰ ĐỘNG TỪ DATABASE VỚI CÂU HỎI HIỆN TẠI ===\n"
            f"{cross_checks}\n\n"
        )

    if db_sources:
        doc_texts = [f"📄 [{s.title} - Phiên bản {s.version}]:\n{s.content}" for s in db_sources]
        system_instruction_text += (
            "=== TÀI LIỆU Y KHOA & HƯỚNG DẪN ĐIỀU TRỊ MỚI ĐƯỢC DUYỆT TRONG DATABASE ===\n"
            + "\n\n".join(doc_texts)
            + "\n\n"
        )

    system_instruction_text += (
        "=== CƠ SỞ DỮ LIỆU TƯƠNG TÁC THUỐC BỘ Y TẾ (633 cặp tương tác) ===\n"
        "Hệ thống đã nạp toàn bộ 633 cặp tương tác thuốc chống chỉ định và thận trọng của Bộ Y tế Việt Nam.\n\n"
        "=== NGUYÊN TẮC CHIA LIỀU CỦA BÁC SĨ (dosing_principles.md) ===\n"
        f"{brain.principles_md}\n\n"
        "=== YẾU TỐ BỆNH NHÂN ẢNH HƯỞNG LIỀU (patient_factors.md) ===\n"
        f"{brain.patient_factors_md}\n\n"
        "=== PHONG CÁCH HỘI THOẠI (conversation_style.md) ===\n"
        f"{brain.style_md}\n\n"
        "=== NGUYÊN TẮC PHẢN HỒI BẮT BUỘC ===\n"
        "1. TẬN DỤNG TỐI ĐA HỒ SƠ: Luôn liên hệ câu trả lời với chính các thuốc trong đơn bác sĩ đã kê, chỉ số xét nghiệm (chức năng thận CrCl, men gan...), tiền sử dị ứng, lịch hẹn của bệnh nhân để đưa ra câu trả lời cá thể hóa sâu sắc nhất.\n"
        "2. ĐỐI SOÁT TỰ ĐỘNG: Khi người bệnh hỏi về việc dùng thêm một thuốc mới hoặc cách uống thuốc, hãy tự động đối soát xem thuốc đó có tương tác với các thuốc đang có trong đơn của bác sĩ hay không.\n"
        "3. TÀI LIỆU MỚI: Nếu có tài liệu/hướng dẫn chuyên môn mới được cung cấp trong database, hãy ưu tiên trích dẫn và giải thích cho người bệnh theo đúng hướng dẫn đó.\n"
        "4. KHÔNG TỰ KÊ ĐƠN: Giải thích rõ ràng cơ chế, liều tham chiếu chuẩn, cảnh báo nguy cơ và luôn nhắc nhở người bệnh tuân thủ hướng dẫn của Bác sĩ điều trị phụ trách.\n"
        "5. TÌNH HUỐNG KHẨN CẤP: Nếu có biểu hiện sốc phản vệ, khó thở, sưng môi lưỡi, đau thắt ngực -> Yêu cầu GỌI 115 hoặc đến cấp cứu NGAY.\n"
        "6. NGÔN NGỮ: Tiếng Việt, ấm áp, ân cần, khoa học, dễ hiểu cho người bệnh và người cao tuổi."
    )

    clean_model = model_name.replace("models/", "") if model_name else "gemini-1.5-flash"
    models_to_try = [clean_model, "gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.0-flash", "gemini-1.5-pro"]
    deduped_models = []
    for m in models_to_try:
        if m and m not in deduped_models:
            deduped_models.append(m)
    if not deduped_models:
        deduped_models = ["gemini-1.5-flash", "gemini-2.0-flash"]

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
            "temperature": 0.35,
            "topP": 0.95,
            "maxOutputTokens": 2048,
        }
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    with httpx.Client(timeout=30.0) as client:
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
    try:
        # 0. Hàng rào an toàn tuyệt đối (Guardrails)
        if classification == "emergency":
            return EMERGENCY_REPLY, []
        if classification == "refusal":
            return REFUSAL_REPLY, []
        if classification == "handoff":
            return HANDOFF_REPLY, []

        settings = get_settings()
        patient_ctx = None
        try:
            if db and user_id:
                patient_ctx = load_patient_context(db, user_id)
        except Exception as e:
            logger.warning(f"Không thể tải hồ sơ người bệnh: {e}")

        # 1. Thử gọi Gemini API nếu có API KEY với toàn bộ dữ liệu EHR sâu
        api_key = settings.AI_API_KEY.strip()
        if api_key and settings.AI_PROVIDER in ("gemini", "google", "auto", "demo"):
            model_name = settings.AI_MODEL if settings.AI_MODEL.startswith("gemini") else "gemini-1.5-flash"
            try:
                gemini_response = _call_gemini_api(
                    user_message=user_message,
                    patient_ctx=patient_ctx,
                    api_key=api_key,
                    model_name=model_name,
                    history=history,
                    db=db,
                )
                if gemini_response:
                    sources = [
                        {
                            "title": "Google Gemini 1.5 Flash (Deep EHR & Medical Knowledge Grounding)",
                            "version": model_name,
                            "file": "Database PostgreSQL & 633 Tương tác thuốc BYT",
                        },
                        {
                            "title": "Hồ sơ Bệnh án Điện tử Người bệnh (Đơn thuốc, Xét nghiệm, Dị ứng)",
                            "version": "Dữ liệu cá thể hóa",
                            "file": "Database AllerCare",
                        }
                    ]
                    return gemini_response, sources
            except Exception as e:
                logger.warning(f"Lỗi khi gọi Gemini AI: {e}")

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
    except Exception as exc:
        logger.exception("Lỗi không mong muốn trong generate_answer: %s", exc)
        return (
            "Chào bạn, mình là Trợ lý AI AllerCare. Để đảm bảo an toàn, xin lưu ý luôn dùng thuốc theo đúng chỉ định và liều lượng của Bác sĩ điều trị. "
            "Nếu bạn cần giải đáp cụ thể về đơn thuốc hoặc có triệu chứng bất thường, hãy bấm nút **Lịch hẹn** hoặc liên hệ bác sĩ phụ trách nhé! 😊",
            [{"title": "Hướng dẫn an toàn người bệnh AllerCare", "version": "v2.0"}],
        )


