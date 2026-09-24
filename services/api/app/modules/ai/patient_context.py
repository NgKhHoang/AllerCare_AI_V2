"""Lấy bối cảnh hồ sơ CỦA CHÍNH NGƯỜI BỆNH ĐANG CHAT để AI cá thể hóa.

Phạm vi quyền riêng tư:
- AI chỉ được thấy hồ sơ của user đang gọi API (qua user.id) — không ai khác.
- Dữ liệu lấy: tên, tuổi, giới, bệnh mãn tính, dị ứng, thuốc, xét nghiệm.
- Không ghi dữ liệu hồ sơ vào log hay audit.
"""
from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.modules.ai.knowledge import PatientContext
from app.modules.patients.models import (
    AllergyRecord,
    ClinicalObservation,
    MedicationRecord,
    PatientProfile,
)


def load_patient_context(db: Session, user_id: str) -> PatientContext | None:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user_id).first()
    if profile is None:
        return None

    ctx = PatientContext(
        full_name=profile.full_name,
        gender=profile.gender,
    )

    # Tuổi
    ctx.age = _age(profile.dob)

    # Bệnh mãn tính
    if profile.chronic_conditions:
        try:
            ctx.conditions = json.loads(profile.chronic_conditions)
        except json.JSONDecodeError:
            ctx.conditions = []

    # Dị ứng
    allergies = db.query(AllergyRecord).filter(AllergyRecord.patient_profile_id == profile.id).all()
    ctx.allergies = [a.substance for a in allergies]

    # Thuốc đang dùng
    meds = (
        db.query(MedicationRecord)
        .filter(MedicationRecord.patient_profile_id == profile.id, MedicationRecord.is_current.is_(True))
        .all()
    )
    ctx.medications = [
        {"raw_name": m.raw_name, "frequency": m.frequency, "verification": m.verification}
        for m in meds
    ]

    # Xét nghiệm
    labs = (
        db.query(ClinicalObservation)
        .filter(ClinicalObservation.patient_profile_id == profile.id, ClinicalObservation.kind == "lab")
        .all()
    )
    ctx.labs = {lab.label: lab.value or "" for lab in labs}

    return ctx


def _age(dob: str | None) -> int | None:
    if not dob:
        return None
    from datetime import datetime

    try:
        dob_dt = datetime.strptime(dob, "%Y-%m-%d")
        today = datetime.now()
        return today.year - dob_dt.year - ((today.month, today.day) < (dob_dt.month, dob_dt.day))
    except ValueError:
        return None
