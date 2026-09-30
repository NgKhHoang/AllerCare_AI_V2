"""Lấy bối cảnh hồ sơ CỦA CHÍNH NGƯỜI BỆNH ĐANG CHAT để AI cá thể hóa toàn diện.

Phạm vi quyền riêng tư:
- AI chỉ được thấy hồ sơ của user đang gọi API (qua user.id) — không ai khác.
- Dữ liệu lấy: Toàn bộ thông tin cá nhân, chẩn đoán, bác sĩ phụ trách, đơn thuốc bác sĩ kê,
  thuốc tự khai báo, tiền sử dị ứng, chỉ số xét nghiệm, triệu chứng lâm sàng, phân luồng cấp cứu, lịch hẹn.
- Không ghi dữ liệu hồ sơ vào log hay audit.
"""
from __future__ import annotations

from datetime import datetime
import json

from sqlalchemy.orm import Session

from app.modules.ai.knowledge import PatientContext
from app.modules.consultations.models import Appointment
from app.modules.patients.models import (
    AllergyRecord,
    CaregiverLink,
    ClinicalObservation,
    MedicationRecord,
    PatientProfile,
    User,
)
from app.modules.safety.check_models import Alert, SafetyCheck
from app.modules.triage.models import TriageAssessment


def load_patient_context(db: Session, user_id: str) -> PatientContext | None:
    try:
        profile = db.query(PatientProfile).filter(PatientProfile.user_id == user_id).first()
        if profile is None:
            return None

        ctx = PatientContext(
            full_name=profile.full_name,
            gender=profile.gender,
            dob=profile.dob,
            diagnosis=profile.diagnosis,
            admission_note=profile.admission_note,
            treatment_status=profile.treatment_status,
            treatment_start_date=profile.treatment_start_date,
            followup_date=profile.followup_date,
        )

        # Bác sĩ phụ trách
        if profile.assigned_doctor_id:
            try:
                doc = db.get(User, profile.assigned_doctor_id)
                if doc:
                    phone_str = f" - SĐT: {doc.phone}" if doc.phone else ""
                    ctx.assigned_doctor_name = f"BS. {doc.full_name or doc.username}{phone_str}"
            except Exception:
                pass

        # Người chăm sóc / Caregiver
        try:
            caregiver_link = (
                db.query(CaregiverLink, User)
                .join(User, User.id == CaregiverLink.caregiver_user_id)
                .filter(CaregiverLink.patient_user_id == user_id, CaregiverLink.active.is_(True))
                .first()
            )
            if caregiver_link:
                link, cg_user = caregiver_link
                ctx.caregiver_info = f"{cg_user.full_name or cg_user.username}" + (f" (SĐT: {cg_user.phone})" if cg_user.phone else "")
        except Exception:
            pass

        # Tuổi
        ctx.age = _age(profile.dob)

        # Bệnh mãn tính
        if profile.chronic_conditions:
            try:
                ctx.conditions = json.loads(profile.chronic_conditions)
            except Exception:
                ctx.conditions = []

        # Tiền sử dị ứng chi tiết
        try:
            allergies = db.query(AllergyRecord).filter(AllergyRecord.patient_profile_id == profile.id).all()
            ctx.allergies = [a.substance for a in allergies if a.substance]
            ctx.allergy_details = [
                {
                    "substance": a.substance,
                    "reaction": a.reaction,
                    "severity": a.severity,
                    "verification": a.verification,
                    "onset_date": a.onset_date,
                }
                for a in allergies
            ]
        except Exception:
            pass

        # Danh mục thuốc (Toàn bộ: Đơn BS kê, Tự khai, Đang dùng, Đã ngừng)
        try:
            meds = (
                db.query(MedicationRecord)
                .filter(MedicationRecord.patient_profile_id == profile.id)
                .order_by(MedicationRecord.created_at.desc())
                .all()
            )

            all_med_dicts = []
            doc_prescriptions = []
            self_declared = []
            stopped = []

            for m in meds:
                m_dict = {
                    "id": m.id,
                    "raw_name": m.raw_name,
                    "dose": m.dose,
                    "frequency": m.frequency,
                    "route": m.route,
                    "timing": m.timing,
                    "start_date": m.start_date,
                    "prescriber": m.prescriber,
                    "source_label": m.source_label,
                    "status": m.status,
                    "stop_reason": m.stop_reason,
                    "verification": m.verification,
                    "is_current": m.is_current,
                }
                if m.is_current and m.status != "stopped":
                    all_med_dicts.append(m_dict)
                    if m.verification == "verified" or (m.source_label and "Bệnh viện" in m.source_label):
                        doc_prescriptions.append(m_dict)
                    else:
                        self_declared.append(m_dict)
                elif m.status == "stopped":
                    stopped.append(m_dict)

            ctx.medications = all_med_dicts
            ctx.doctor_prescriptions = doc_prescriptions
            ctx.self_declared_meds = self_declared
            ctx.stopped_meds = stopped
        except Exception:
            pass

        # Xét nghiệm & Triệu chứng lâm sàng
        try:
            obs = (
                db.query(ClinicalObservation)
                .filter(ClinicalObservation.patient_profile_id == profile.id)
                .order_by(ClinicalObservation.occurred_at.desc())
                .limit(20)
                .all()
            )
            labs_dict = {}
            symptoms_list = []
            for o in obs:
                if o.kind == "lab":
                    unit_str = f" {o.unit}" if o.unit else ""
                    labs_dict[o.label] = f"{o.value or ''}{unit_str}"
                elif o.kind == "symptom":
                    symptoms_list.append({
                        "label": o.label,
                        "occurred_at": o.occurred_at,
                        "status": o.status,
                        "value": o.value,
                    })
            ctx.labs = labs_dict
            ctx.recent_symptoms = symptoms_list
        except Exception:
            pass

        # Lịch sử cảnh báo an toàn đối soát thuốc hệ thống ghi nhận
        try:
            safety_checks = (
                db.query(SafetyCheck)
                .filter(SafetyCheck.patient_profile_id == profile.id)
                .order_by(SafetyCheck.created_at.desc())
                .limit(3)
                .all()
            )
            alerts_list = []
            for sc in safety_checks:
                alerts = db.query(Alert).filter(Alert.safety_check_id == sc.id).all()
                for a in alerts:
                    alerts_list.append({
                        "severity": a.severity,
                        "rule_code": a.rule_code,
                        "message": a.message,
                        "source": f"{a.source_title} ({a.source_version})",
                    })
            ctx.safety_alerts = alerts_list
        except Exception:
            pass

        # Lịch sử phân luồng cấp cứu Triage
        try:
            triages = (
                db.query(TriageAssessment)
                .filter(TriageAssessment.patient_profile_id == profile.id)
                .order_by(TriageAssessment.created_at.desc())
                .limit(5)
                .all()
            )
            ctx.triage_history = [
                {
                    "level": t.level,
                    "message": t.message,
                    "reason": t.reason,
                    "created_at": t.created_at.isoformat() if t.created_at else "",
                }
                for t in triages
            ]
        except Exception:
            pass

        # Lịch hẹn khám
        try:
            appointments = (
                db.query(Appointment, User)
                .join(User, User.id == Appointment.doctor_user_id)
                .filter(Appointment.patient_user_id == user_id, Appointment.status.in_(["requested", "confirmed"]))
                .order_by(Appointment.scheduled_at.asc())
                .limit(3)
                .all()
            )
            ctx.appointments = [
                {
                    "scheduled_at": app.scheduled_at,
                    "doctor_name": f"BS. {doc.full_name or doc.username}",
                    "reason": app.reason,
                    "status": app.status,
                }
                for app, doc in appointments
            ]
        except Exception:
            pass

        return ctx
    except Exception:
        return None


def _age(dob: str | None) -> int | None:
    if not dob:
        return None
    try:
        dob_dt = datetime.strptime(dob, "%Y-%m-%d")
        today = datetime.now()
        return today.year - dob_dt.year - ((today.month, today.day) < (dob_dt.month, dob_dt.day))
    except ValueError:
        return None
