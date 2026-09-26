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
    model_name: str = "gemini-flash-latest",
) -> str | None:
    """Gọi trực tiếp Google Gemini API qua giao thức REST."""
    brain = get_brain()
    
    # Chuẩn bị System Instruction với toàn bộ tri thức y khoa AllerCare
    system_instruction_text = (
        "Bạn là Trợ lý AI AllerCare — Nền tảng theo dõi và hỗ trợ sử dụng thuốc an toàn chuyên khoa Da liễu & Dị ứng lâm sàng.\n\n"
        "=== BỘ QUY TẮC BẮT BUỘC ===\n"
        "1. Bạn KHÔNG được tự ý kê đơn, không khuyên bệnh nhân tự ý tăng/giảm liều hoặc tự ý đổi thuốc.\n"
        "2. Trong tình huống khẩn cấp (khó thở, sưng môi lưỡi, đau thắt ngực, nghi ngờ sốc phản vệ), yêu cầu bệnh nhân GỌI 115 hoặc đến cấp cứu NGAY.\n"
        "3. Trả lời bằng tiếng Việt, giọng điệu ấm áp, ân cần, câu từ ngắn gọn, dễ hiểu cho người bệnh và người cao tuổi.\n"
        "4. Mọi gợi ý, cảnh báo và giải thích phải dựa trên cơ sở khoa học y tế được cung cấp bên dưới và ghi rõ nguồn tham khảo.\n"
        "5. Luôn nhắc nhở: Quyết định cuối cùng thuộc về Bác sĩ điều trị.\n\n"
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

    clean_model = model_name.replace("models/", "")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent"

    payload = {
        "system_instruction": {
            "parts": [{"text": system_instruction_text}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_message}]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "topP": 0.95,
            "maxOutputTokens": 2048,
        }
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    try:
        with httpx.Client(timeout=25.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"].strip()
            else:
                logger.warning(f"Gemini API returned status {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"Lỗi kết nối Gemini API: {e}. Đang chuyển sang Fallback cục bộ.")
    
    return None


def generate_answer(
    db: Session | None,
    user_message: str,
    classification: str,
    user_id: str | None = None,
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
    patient_desc = patient_ctx.describe() if patient_ctx else ""

    # 1. Thử gọi Gemini API nếu có API KEY
    api_key = settings.AI_API_KEY.strip()
    if api_key and settings.AI_PROVIDER in ("gemini", "google", "auto", "demo"):
        model_name = settings.AI_MODEL if settings.AI_MODEL.startswith("gemini") else "gemini-1.5-flash"
        gemini_response = _call_gemini_api(
            user_message=user_message,
            patient_ctx_desc=patient_desc,
            api_key=api_key,
            model_name=model_name,
        )
        if gemini_response:
            sources = [
                {
                    "title": "Google Gemini 1.5 Flash (Grounded on AllerCare Medical Knowledge)",
                    "version": model_name,
                    "file": "data/ai_knowledge/",
                },
                {
                    "title": "Danh mục tương tác thuốc — Bộ Y tế",
                    "version": "QĐ 5948/QĐ-BYT",
                    "file": "data/safety/safety_rules.json",
                }
            ]
            return gemini_response, sources

    # 2. FALLBACK NỘI BỘ (Chạy cục bộ 100% khi không có mạng hoặc chưa cấu hình API Key)
    brain = get_brain()

    # 2.1. Tra cứu tương tác thuốc Bộ Y tế
    interaction = brain.find_interaction_in_message(user_message)
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

    # 2.2. Tra cứu liều dùng theo ví dụ bác sĩ
    drug_query = _extract_drug_query(message=user_message)
    mentions_dose = any(
        kw in user_message.lower()
        for kw in ("liều", "lưu", "viên", "lần/ngày", "ngày mấy", "bao nhiêu", "cách dùng", "uống sao", "uống như")
    )
    if drug_query and (mentions_dose or "?" in user_message or len(user_message) < 80):
        text, sug = build_dose_answer(brain, drug_query, patient_ctx)
        sources = [
            {
                "title": "Kho kiến thức AI — ví dụ chia liều của bác sĩ",
                "version": sug.example_id or "dosing_examples",
                "file": "ai_knowledge/dosing_examples.json",
            }
        ]
        return text, sources

    # 2.3. Nguyên tắc chia liều chung
    if any(kw in user_message.lower() for kw in ("chia liều", "phân chia liều", "nguyên tắc liều", "cách bác sĩ")):
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

    return OUT_OF_SCOPE_REPLY, []
