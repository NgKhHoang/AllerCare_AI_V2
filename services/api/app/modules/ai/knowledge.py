"""AI ảo (mock AI backend) — "bộ não" học từ data/ai_knowledge/.

Nguyên tắc kiến trúc:
- AI ảo KHÔNG gọi Internet, KHÔNG dùng LLM ngoài. Toàn bộ "hiểu biết" của nó
  đến từ duy nhất thư mục `data/ai_knowledge/` (nguyên tắc chia liều của bác sĩ,
  ví dụ liều, yếu tố bệnh nhân, phong cách hội thoại).
- Khi có dữ liệu thật: chỉ cần thay file trong data/ai_knowledge/ — AI tự dùng
  nội dung mới ở lần truy xuất kế tiếp (retrieval theo truy vấn, không hard-code).
- AI có thể đọc hồ sơ của NGƯỜI BỆNH ĐANG CHAT (được phép) để cá thể hóa câu
  trả lời; KHÔNG được truy cập hồ sơ người bệnh khác.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.data_loader import (
    AI_KNOWLEDGE_FILES,
    ai_knowledge_files_info,
    load_ai_knowledge_bundle,
    reload_ai_knowledge,
)


def _tokens(text: str) -> list[str]:
    return [t for t in re.split(r"\W+", text.lower(), flags=re.UNICODE) if len(t) >= 3]


def _age_years(dob: str | None) -> int | None:
    if not dob:
        return None
    try:
        from datetime import datetime

        dob_dt = datetime.strptime(dob, "%Y-%m-%d")
        today = datetime.now()
        return today.year - dob_dt.year - ((today.month, today.day) < (dob_dt.month, dob_dt.day))
    except ValueError:
        return None


@dataclass
class DoseExample:
    id: str
    drug: str
    brand_example: str
    dose: str
    max_daily: str
    route: str
    reasoning: str
    doctor_note: str
    patient_context: dict = field(default_factory=dict)

    @classmethod
    def from_dict(cls, raw: dict) -> "DoseExample":
        return cls(
            id=raw.get("id", "?"),
            drug=raw.get("drug", ""),
            brand_example=raw.get("brand_example", ""),
            dose=raw.get("dose", ""),
            max_daily=raw.get("max_daily", ""),
            route=raw.get("route", "uống"),
            reasoning=raw.get("reasoning", ""),
            doctor_note=raw.get("doctor_note", ""),
            patient_context=raw.get("patient_context") or {},
        )


@dataclass
class PatientContext:
    """Bối cảnh hồ sơ của chính người bệnh đang chat (duy nhất được phép dùng)."""

    full_name: str = ""
    age: int | None = None
    gender: str | None = None
    conditions: list[str] = field(default_factory=list)
    allergies: list[str] = field(default_factory=list)
    medications: list[dict] = field(default_factory=list)
    labs: dict[str, str] = field(default_factory=dict)

    def describe(self) -> str:
        parts = []
        if self.age is not None:
            parts.append(f"{self.age} tuổi")
        if self.gender:
            parts.append(self.gender.lower())
        if self.conditions:
            parts.append("bệnh: " + ", ".join(self.conditions))
        if self.allergies:
            parts.append("dị ứng: " + ", ".join(self.allergies))
        return "; ".join(parts) if parts else ""


class AIBrain:
    """Trí tuệ của AI ảo: truy xuất + tổng hợp từ data/ai_knowledge/.

    Đây là "backend AI ảo" chạy hoàn toàn cục bộ. Thay thế bằng LLM thật sau này
    bằng cách giữ nguyên interface (retrieve_context, compose_answer) và đổi
    phần sinh văn bản — dữ liệu học vẫn trong data/ai_knowledge/.
    """

    def __init__(self) -> None:
        self.reload()

    def reload(self) -> None:
        bundle = reload_ai_knowledge()
        self.principles_md: str = bundle["dosing_principles_md"]
        self.patient_factors_md: str = bundle["patient_factors_md"]
        self.style_md: str = bundle["conversation_style_md"]
        self.drug_interactions: list[dict] = bundle.get("drug_interactions", [])
        raw_examples = bundle["dosing_examples"]
        self.examples: list[DoseExample] = [
            DoseExample.from_dict(e) for e in raw_examples.get("examples", [])
        ]
        # Chỉ số tra cứu nhanh ví dụ liều
        self._by_drug: dict[str, list[DoseExample]] = {}
        for ex in self.examples:
            self._by_drug.setdefault(ex.drug.lower(), []).append(ex)

    # ------------------------------------------------------------------
    # Truy xuất kiến thức (RAG tối giản theo từ khóa)
    # ------------------------------------------------------------------

    def find_interaction_in_message(self, message: str) -> dict | None:
        """Tìm tương tác thuốc nếu câu hỏi nhắc đến 2 hoạt chất/thuốc có trong kho tương tác."""
        msg_lower = message.lower()
        candidates = []
        for item in self.drug_interactions:
            act1 = item.get("act1", "").lower()
            act2 = item.get("act2", "").lower()
            # Làm sạch tên (bỏ ngoặc đơn nếu có)
            pure1 = re.sub(r"\s*\(.*?\)", "", act1).strip()
            pure2 = re.sub(r"\s*\(.*?\)", "", act2).strip()
            if (pure1 in msg_lower and pure2 in msg_lower) or (act1 in msg_lower and act2 in msg_lower):
                candidates.append(item)
        if candidates:
            # Chọn tương tác khớp dài nhất
            return candidates[0]
        return None

    def find_drug_examples(self, message: str) -> list[DoseExample]:
        """Tìm ví dụ liều cho các thuốc được nhắc trong tin nhắn."""
        msg_lower = message.lower()
        hits: list[DoseExample] = []
        for drug_key, exs in self._by_drug.items():
            if drug_key and drug_key in msg_lower:
                hits.extend(exs)
        # Thử khớp theo brand_example (VD: "Glucophage 850mg")
        for ex in self.examples:
            brand = ex.brand_example.lower()
            if brand and brand in msg_lower and ex not in hits:
                hits.append(ex)
        return hits

    def retrieve_principles(self, message: str, limit: int = 6) -> list[str]:
        """Trích các dòng nguyên tắc liên quan từ dosing_principles.md."""
        tokens = _tokens(message)
        scored: list[tuple[int, str]] = []
        for line in self.principles_md.splitlines():
            line_clean = line.strip().lstrip("0123456789.-* ").strip()
            if len(line_clean) < 25 or line_clean.startswith(("|", ">", "#", "```")):
                continue
            line_lower = line_clean.lower()
            score = sum(1 for t in tokens if t in line_lower)
            if score > 0:
                scored.append((score, line_clean))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [text for _, text in scored[:limit]]

    def retrieve_factors(self, message: str, limit: int = 4) -> list[str]:
        """Trích các dòng yếu tố bệnh nhân liên quan."""
        tokens = _tokens(message)
        scored: list[tuple[int, str]] = []
        for line in self.patient_factors_md.splitlines():
            line_clean = line.strip().lstrip("|").strip()
            if len(line_clean) < 25 or line_clean.startswith((">", "#", "```", "-")):
                continue
            line_lower = line_clean.lower()
            score = sum(1 for t in tokens if t in line_lower)
            if score > 0:
                scored.append((score, line_clean))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [text for _, text in scored[:limit]]

    def knowledge_files(self) -> list[dict]:
        return ai_knowledge_files_info()

    def stats(self) -> dict[str, Any]:
        return {
            "examples": len(self.examples),
            "drugs": len(self._by_drug),
            "drug_interactions": len(self.drug_interactions),
            "principles_chars": len(self.principles_md),
            "factors_chars": len(self.patient_factors_md),
            "files": self.knowledge_files(),
        }

    # ------------------------------------------------------------------
    # Chọn ví dụ liều phù hợp bối cảnh bệnh nhân
    # ------------------------------------------------------------------

    def best_example_for(self, examples: list[DoseExample], patient: PatientContext | None) -> DoseExample | None:
        if not examples:
            return None
        if patient is None:
            return examples[0]

        def score(ex: DoseExample) -> int:
            s = 0
            ctx = ex.patient_context
            age_group = ctx.get("age_group")
            if patient.age is not None and age_group:
                if patient.age >= 65 and age_group == "elderly":
                    s += 4
                elif 18 <= patient.age < 65 and age_group == "adult":
                    s += 4
                elif patient.age < 18 and age_group == "child":
                    s += 4
                elif age_group == "adult":
                    s += 1
            renal = ctx.get("renal_function")
            if renal == "crcl_30_60" and any("crcl" in k or "52" in v for k, v in patient.labs.items()):
                s += 3
            if ctx.get("hepatic_function") == "normal":
                s += 1
            if patient.gender and "nữ" in patient.gender.lower() and ctx.get("pregnancy"):
                s += 1
            return s

        return max(examples, key=score)


# Singleton dùng chung cho toàn app
_brain: AIBrain | None = None


def get_brain() -> AIBrain:
    global _brain
    if _brain is None:
        _brain = AIBrain()
    return _brain
