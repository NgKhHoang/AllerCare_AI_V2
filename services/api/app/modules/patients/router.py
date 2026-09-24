"""API hồ sơ người bệnh — phân quyền theo từng hồ sơ, mọi khai báo gắn nhãn unverified."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.auth.deps import (
    CurrentUser,
    audit_log,
    get_current_user,
    get_owned_patient_profile,
)
from app.modules.patients.models import (
    AllergyRecord,
    ClinicalObservation,
    MedicationRecord,
    PatientProfile,
)
from app.modules.patients.schemas import (
    AllergyIn,
    AllergyOut,
    MedicationIn,
    MedicationOut,
    ObservationIn,
    ObservationOut,
    ProfileOut,
)

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("/me/profile", summary="Hồ sơ của người bệnh hiện tại")
def my_profile(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if profile is None:
        from fastapi import HTTPException, status

        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có hồ sơ người bệnh cho tài khoản này")
    return profile


@router.get("/{profile_id}", summary="Xem hồ sơ theo id (chính chủ hoặc bác sĩ được phân công)")
def get_profile(
    profile_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    from app.modules.auth.deps import get_patient_profile_for_access

    profile = get_patient_profile_for_access(profile_id, user, db)
    audit_log(db, user, "view_profile", "patient_profile", profile.id)
    db.commit()
    return profile


@router.get("/{profile_id}/medications", summary="Danh sách thuốc của hồ sơ")
def list_medications(
    profile_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MedicationOut]:
    from app.modules.auth.deps import get_patient_profile_for_access

    profile = get_patient_profile_for_access(profile_id, user, db)
    meds = (
        db.query(MedicationRecord)
        .filter(MedicationRecord.patient_profile_id == profile.id)
        .order_by(MedicationRecord.created_at.desc())
        .all()
    )
    return [MedicationOut.model_validate(m) for m in meds]


@router.post("/{profile_id}/medications", status_code=201, summary="Khai báo thuốc — mọi nguồn (WHO reconciliation)")
def add_medication(
    profile_id: str,
    data: MedicationIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MedicationOut:
    """Người bệnh (hoặc người nhà ủy quyền) khai thuốc từ MỌI nguồn: BV kê, BV khác,
    tự mua, OTC, TPCN, đông y — kèm ảnh toa/bao bì nếu có. Luôn vào hệ thống ở trạng thái
    "chưa xác minh" và chờ bác sĩ xác nhận trước khi vào danh sách chính thức."""
    profile = get_owned_patient_profile(profile_id, user, db)
    med = MedicationRecord(
        patient_profile_id=profile.id,
        raw_name=data.raw_name.strip(),
        is_current=data.is_current,
        is_planned=data.is_planned,
        dose=data.dose,
        route=data.route,
        frequency=data.frequency,
        timing=data.timing,
        start_date=data.start_date,
        prescriber=data.prescriber,
        status=data.status or ("active" if data.is_current else "stopped"),
        stop_reason=data.stop_reason,
        last_reaction=data.last_reaction,
        image_url=data.image_url,
        verification="unverified",
        reported_by_user_id=user.id,
        source_label=data.source_label or "Khai báo bởi người bệnh",
    )
    db.add(med)
    audit_log(db, user, "add_medication", "medication_record", None, f"profile={profile.id}")
    db.commit()
    db.refresh(med)
    return MedicationOut.model_validate(med)


@router.post("/{profile_id}/medications/{medication_id}/stop", summary="Ngừng một thuốc (ghi lý do)")
def stop_medication(
    profile_id: str,
    medication_id: str,
    reason: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    profile = get_owned_patient_profile(profile_id, user, db)
    med = db.get(MedicationRecord, medication_id)
    if med is None or med.patient_profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thuốc")
    med.is_current = False
    med.status = "stopped"
    med.stop_reason = (reason or "Ngừng theo ý người bệnh — chờ bác sĩ xác nhận")[:200]
    audit_log(db, user, "stop_medication", "medication_record", med.id, med.stop_reason)
    db.commit()
    return {"id": med.id, "status": med.status, "stop_reason": med.stop_reason}


@router.get("/{profile_id}/observations", summary="Dòng thời gian triệu chứng/xét nghiệm")
def list_observations(
    profile_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ObservationOut]:
    from app.modules.auth.deps import get_patient_profile_for_access

    profile = get_patient_profile_for_access(profile_id, user, db)
    obs = (
        db.query(ClinicalObservation)
        .filter(ClinicalObservation.patient_profile_id == profile.id)
        .order_by(ClinicalObservation.occurred_at.desc())
        .all()
    )
    return [ObservationOut.model_validate(o) for o in obs]


@router.post("/{profile_id}/observations", status_code=201, summary="Khai báo triệu chứng/xét nghiệm")
def add_observation(
    profile_id: str,
    data: ObservationIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ObservationOut:
    profile = get_owned_patient_profile(profile_id, user, db)
    obs = ClinicalObservation(
        patient_profile_id=profile.id,
        kind=data.kind,
        label=data.label.strip(),
        value=data.value,
        unit=data.unit,
        occurred_at=data.occurred_at,
        image_url=data.image_url,
        status="sent",
        verification="unverified",
        reported_by_user_id=user.id,
    )
    db.add(obs)
    audit_log(db, user, "add_observation", "clinical_observation", None, f"profile={profile.id}")
    db.commit()
    db.refresh(obs)
    return ObservationOut.model_validate(obs)


@router.get("/{profile_id}/allergies", summary="Tiền sử dị ứng của hồ sơ")
def list_allergies(
    profile_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AllergyOut]:
    from app.modules.auth.deps import get_patient_profile_for_access

    profile = get_patient_profile_for_access(profile_id, user, db)
    rows = (
        db.query(AllergyRecord)
        .filter(AllergyRecord.patient_profile_id == profile.id)
        .order_by(AllergyRecord.created_at.desc())
        .all()
    )
    return [AllergyOut.model_validate(a) for a in rows]


@router.post("/{profile_id}/allergies", status_code=201, summary="Khai báo tiền sử dị ứng")
def add_allergy(
    profile_id: str,
    data: AllergyIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AllergyOut:
    profile = get_owned_patient_profile(profile_id, user, db)
    allergy = AllergyRecord(
        patient_profile_id=profile.id,
        substance=data.substance.strip(),
        reaction=data.reaction,
        severity=data.severity,
        verification="unverified",
        reported_by_user_id=user.id,
        onset_date=data.onset_date,
    )
    db.add(allergy)
    audit_log(db, user, "add_allergy", "allergy_record", None, f"profile={profile.id}")
    db.commit()
    db.refresh(allergy)
    return AllergyOut.model_validate(allergy)
