"""AI adapter: backend AI ảo chạy cục bộ, học từ data/ai_knowledge/.

Nguyên tắc:
- AI ảo KHÔNG gọi Internet, KHÔNG dùng LLM ngoài trong bản demo.
- "Hiểu biết" chia liều đến duy nhất từ data/ai_knowledge/ (nguyên tắc của bác sĩ,
  ví dụ liều, yếu tố bệnh nhân, phong cách hội thoại).
- Guardrails vẫn đứng TRƯỚC AI: khẩn cấp → 115; từ chối tự đổi thuốc; handoff.
- Nguồn truy xuất luôn là nguồn thật; KHÔNG chấp nhận nguồn do AI tự bịa.
"""
import json
import re

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


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip()]


def retrieve_approved_content(db: Session, query: str, limit: int = 3) -> list[KnowledgeSource]:
    """RAG tối giản trên nội dung đã duyệt trong DB (giữ cho câu hỏi tài liệu chung)."""
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
    """Thử tìm thuốc/hoạt chất/biệt dược trong câu hỏi để gợi ý liều.

    Khớp cả tên hoạt chất (Metformin) lẫn biệt dược (Glucophage, Zyrtec, Panadol…)
    có trong kho kiến thức data/ai_knowledge/dosing_examples.json.
    """
    brain = get_brain()
    msg_lower = message.lower()
    # Ưu tiên khớp dải dài nhất để tránh "Paracetamol" thắng "Panadol Extra 500mg"
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


def generate_answer(db: Session, user_message: str, classification: str, user_id: str | None = None) -> tuple[str, list[dict]]:
    """Sinh câu trả lời. Trả về (nội dung, danh sách nguồn thật)."""
    if classification == "emergency":
        return EMERGENCY_REPLY, []
    if classification == "refusal":
        return REFUSAL_REPLY, []
    if classification == "handoff":
        return HANDOFF_REPLY, []

    brain = get_brain()

    # 1) Câu hỏi về liều/cách dùng có nhắc thuốc trong kho kiến thức → dosage advisor
    drug_query = _extract_drug_query(message=user_message)
    mentions_dose = any(
        kw in user_message.lower()
        for kw in ("liều", "lưu", "viên", "lần/ngày", "ngày mấy", "bao nhiêu", "cách dùng", "uống sao", "uống như")
    )
    if drug_query and (mentions_dose or "?" in user_message or len(user_message) < 80):
        patient_ctx = load_patient_context(db, user_id) if user_id else None
        text, sug = build_dose_answer(brain, drug_query, patient_ctx)
        sources = [
            {
                "title": "Kho kiến thức AI — ví dụ chia liều của bác sĩ",
                "version": sug.example_id or "dosing_examples",
                "file": "ai_knowledge/dosing_examples.json",
            }
        ]
        return text, sources

    # 2) Nguyên tắc chia liều trong kho kiến thức AI (VD: "bác sĩ chia liều thế nào?")
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

    # 3) Fallback: tài liệu đã duyệt trong DB (hướng dẫn dùng thuốc chung)
    sources = retrieve_approved_content(db, user_message)
    if not sources:
        return OUT_OF_SCOPE_REPLY, []

    if get_settings().AI_PROVIDER in ("demo", "mock"):
        tokens = [t for t in re.split(r"\W+", user_message.lower(), flags=re.UNICODE) if len(t) >= 3]
        best = sources[0]
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

    # Provider thật: bổ sung adapter sau khi chốt nhà cung cấp; demo chỉ chạy AI ảo.
    raise NotImplementedError("Provider AI thực chưa được cấu hình cho MVP demo")
