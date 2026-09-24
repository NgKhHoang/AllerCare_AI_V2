"""API MedSafe: chạy kiểm tra an toàn thuốc, xem kết quả có nguồn, ghi nhận đánh giá chuyên môn."""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.auth.deps import CurrentUser, audit_log, require_roles
from app.modules.patients.models import PatientProfile
from app.modules.safety.check_models import Alert, Review, SafetyCheck
from app.modules.safety.schemas import ReviewIn, SafetyCheckIn, SafetyCheckOut
from app.modules.safety.service import run_safety_check
from app.modules.auth.deps import get_assigned_patient_profile

router = APIRouter(prefix="/safety-checks", tags=["safety"])


@router.post("", status_code=201, summary="Chạy kiểm tra an toàn thuốc (bác sĩ/dược sĩ)")
def create_check(
    data: SafetyCheckIn,
    user: CurrentUser = Depends(require_roles("doctor", "pharmacist")),
    db: Session = Depends(get_db),
) -> SafetyCheckOut:
    profile = get_assigned_patient_profile(data.profile_id, user, db)
    check = run_safety_check(db, profile, user.id, data.medication_ids)
    audit_log(db, user, "safety_check", "safety_check", check.id, f"status={check.result_status}")
    db.commit()
    return _to_out(check)


@router.get("/{check_id}", summary="Xem kết quả kiểm tra (kèm nguồn, phạm vi)")
def get_check(
    check_id: str,
    user: CurrentUser = Depends(require_roles("doctor", "pharmacist", "patient")),
    db: Session = Depends(get_db),
) -> SafetyCheckOut:
    check = db.get(SafetyCheck, check_id)
    if check is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lần kiểm tra")
    profile = db.get(PatientProfile, check.patient_profile_id)
    allowed = (
        (user.role == "doctor" and profile.assigned_doctor_id == user.id)
        or (user.role == "patient" and profile.user_id == user.id)
        or user.role == "pharmacist"
    )
    if not allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có quyền xem kết quả này")
    audit_log(db, user, "view_safety_check", "safety_check", check.id)
    db.commit()
    return _to_out(check)


@router.post("/{check_id}/reviews", status_code=201, summary="Ghi nhận đánh giá chuyên môn cho một cảnh báo")
def review_alert(
    check_id: str,
    data: ReviewIn,
    user: CurrentUser = Depends(require_roles("doctor")),
    db: Session = Depends(get_db),
) -> dict:
    check = db.get(SafetyCheck, check_id)
    if check is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lần kiểm tra")
    profile = db.get(PatientProfile, check.patient_profile_id)
    if profile.assigned_doctor_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ bác sĩ được phân công mới ghi nhận quyết định")
    alert = (
        db.query(Alert)
        .filter(Alert.safety_check_id == check.id)
        .order_by(Alert.created_at.desc())
        .first()
    )
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có cảnh báo nào trong lần kiểm tra này")
    review = Review(alert_id=alert.id, reviewer_user_id=user.id, decision=data.decision, note=data.note)
    db.add(review)
    audit_log(db, user, "review_alert", "alert", alert.id, f"decision={data.decision}")
    db.commit()
    return {"id": review.id, "decision": review.decision, "alert_id": alert.id}


def _to_out(check: SafetyCheck) -> SafetyCheckOut:
    return SafetyCheckOut(
        id=check.id,
        profile_id=check.patient_profile_id,
        result_status=check.result_status,
        input_snapshot=json.loads(check.input_snapshot),
        result=json.loads(check.result_json),
        created_at=check.created_at.isoformat(),
    )
