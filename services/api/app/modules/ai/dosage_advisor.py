"""Dosage advisor — AI ảo gợi ý liều THAM CHIẾU theo hồ sơ người bệnh.

An toàn:
- Chỉ gợi ý khi có ví dụ liều trong data/ai_knowledge/dosing_examples.json.
- Chỉ dùng dữ liệu hồ sơ của chính người bệnh đang chat.
- Thiếu dữ liệu quyết định (CrCl, cân nặng trẻ em…) → trả "insufficient_data",
  KHÔNG đoán.
- Không bao giờ thay thế quyết định của bác sĩ.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.modules.ai.knowledge import AIBrain, DoseExample, PatientContext, get_brain


@dataclass
class DoseSuggestion:
    status: str  # ok | insufficient_data | not_in_knowledge
    drug: str = ""
    dose: str = ""
    max_daily: str = ""
    schedule: str = ""
    reasoning: str = ""
    doctor_note: str = ""
    example_id: str = ""
    source_file: str = "ai_knowledge/dosing_examples.json"
    missing: list[str] = field(default_factory=list)
    alternatives: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "drug": self.drug,
            "dose": self.dose,
            "max_daily": self.max_daily,
            "schedule": self.schedule,
            "reasoning": self.reasoning,
            "doctor_note": self.doctor_note,
            "example_id": self.example_id,
            "source_file": self.source_file,
            "missing": self.missing,
            "alternatives": self.alternatives,
        }


def _crcl_value(patient: PatientContext) -> float | None:
    for k, v in patient.labs.items():
        if "crcl" in k.lower() and v:
            try:
                return float(str(v).replace(",", "."))
            except ValueError:
                continue
    return None


def _renality(crcl: float | None) -> str:
    if crcl is None:
        return "unknown"
    if crcl >= 60:
        return "normal"
    if crcl >= 30:
        return "crcl_30_60"
    return "crcl_lt_30"


def suggest_dose(
    brain: AIBrain,
    drug_query: str,
    patient: PatientContext | None,
) -> DoseSuggestion:
    """Gợi ý liều tham chiếu cho một thuốc theo bối cảnh bệnh nhân."""
    examples = brain.find_drug_examples(drug_query)
    if not examples:
        return DoseSuggestion(status="not_in_knowledge", drug=drug_query)

    best = brain.best_example_for(examples, patient)
    assert best is not None

    missing: list[str] = []
    ctx = best.patient_context
    crcl = _crcl_value(patient) if patient else None
    renal_ctx = ctx.get("renal_function")

    # Kiểm tra dữ liệu bắt buộc theo bối cảnh ví dụ
    if renal_ctx == "crcl_30_60" and crcl is None:
        missing.append("CrCl (cần xét nghiệm để chọn đúng mức liều thận)")
    age_group = ctx.get("age_group")
    if age_group == "child" and (patient is None or patient.age is None):
        missing.append("tuổi/cân nặng trẻ em (liều tính theo mg/kg)")

    # Chọn ví dụ thay thế nếu thiếu dữ liệu nhưng có ví dụ chuẩn khác
    alternatives = [
        {"id": ex.id, "dose": ex.dose, "context": ex.patient_context}
        for ex in examples
        if ex.id != best.id
    ]

    if missing:
        return DoseSuggestion(
            status="insufficient_data",
            drug=best.drug,
            missing=missing,
            alternatives=alternatives,
        )

    schedule = best.dose
    return DoseSuggestion(
        status="ok",
        drug=best.drug,
        dose=best.dose,
        max_daily=best.max_daily,
        schedule=f"Đường dùng: {best.route}. " + schedule,
        reasoning=best.reasoning,
        doctor_note=best.doctor_note,
        example_id=best.id,
        alternatives=alternatives,
    )


def build_dose_answer(
    brain: AIBrain,
    drug_query: str,
    patient: PatientContext | None,
) -> tuple[str, DoseSuggestion]:
    """Soạn câu trả lời trò chuyện kèm gợi ý liều + nguồn + disclaimer."""
    sug = suggest_dose(brain, drug_query, patient)
    name = patient.full_name if patient else "bạn"

    if sug.status == "not_in_knowledge":
        text = (
            f"Hmm, mình chưa có ví dụ chia liều cho “{drug_query}” trong kho kiến thức của mình "
            "(data/ai_knowledge) 😅 Mình không muốn đoán bừa về liều đâu — giống cách bác sĩ không kê liều khi chưa có căn cứ. "
            "Bạn hỏi mình về thuốc khác có trong kho nhé, còn thuốc này thì trao đổi với bác sĩ phụ trách nha."
        )
        return text, sug

    if sug.status == "insufficient_data":
        lines = [
            f"Với {name}, mình cần thêm dữ liệu trước khi tham chiếu liều {sug.drug}:",
        ]
        lines += [f"- Thiếu: {m}" for m in sug.missing]
        lines.append(
            "Mình không đoán liều khi thiếu dữ liệu — giống cách bác sĩ không kê liều khi chưa có xét nghiệm. "
            "Bạn bổ sung kết quả xét nghiệm trong mục Cập nhật rồi quay lại hỏi mình tiếp nhé 😊"
        )
        return "\n".join(lines), sug

    patient_desc = patient.describe() if patient else ""
    lines = [
        f"Với {name}" + (f" ({patient_desc})" if patient_desc else "") + ", đây là cách bác sĩ thường chia liều:",
        "",
        f"💊 **{sug.drug}**: {sug.dose}",
        f"Trần tối đa: {sug.max_daily}",
        "",
        f"**Vì sao chia như vậy:** {sug.reasoning}",
    ]
    if sug.doctor_note:
        lines.append(f"**Lưu ý của bác sĩ:** {sug.doctor_note}")
    if sug.alternatives:
        alts = "; ".join(
            f"{a['dose']} (bối cảnh: {a['context'].get('age_group', '?')}/{a['context'].get('renal_function', 'normal')})"
            for a in sug.alternatives[:2]
        )
        lines.append(f"Các mức liều khác trong kho kiến thức: {alts}.")
    lines += [
        "",
        f"Nguồn: ai_knowledge/dosing_examples.json — ví dụ {sug.example_id}. "
        "Đây chỉ là tham chiếu cách bác sĩ chia liều cho bạn biết thôi — mình là AI nên không kê đơn hay đổi liều. "
        "Liều bạn đang dùng do bác sĩ phụ trách quyết định; muốn thay đổi thì bạn hẹn bác sĩ trong mục Lịch hẹn nhé 😊",
    ]
    return "\n".join(lines), sug
