"""API lịch hẹn + phòng video.

An toàn: room_code ngẫu nhiên, không chứa tên/mã người bệnh; /join kiểm tra
quyền theo appointment trước khi cấp thông tin phòng. Không ghi âm/ghi hình.
"""
import secrets
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.modules.auth.deps import CurrentUser, audit_log, get_current_user, require_roles
from app.modules.consultations.models import Appointment, ConsultationRoom
from app.modules.consultations.schemas import AppointmentIn, AppointmentOut
from app.modules.patients.models import CareAssignment, PatientProfile

router = APIRouter(prefix="/appointments", tags=["consultations"])


def _livekit_token(room_code: str, user: CurrentUser) -> str | None:
    """Ký LiveKit access token cho người tham gia cuộc hẹn.

    Token gắn với phòng theo lịch hẹn; identity là user id (không kèm tên/mã cá nhân
    vào room metadata). Trả None khi LiveKit chưa cấu hình — endpoint vẫn trả room
    info (chế độ demo cũ).
    """
    s = get_settings()
    if not (s.LIVEKIT_URL and s.LIVEKIT_API_KEY and s.LIVEKIT_API_SECRET):
        return None
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "iss": s.LIVEKIT_API_KEY,
        "sub": user.id,
        "iat": now,
        "exp": now + s.LIVEKIT_TOKEN_TTL_MINUTES * 60,
        "nbf": now - 5,
        "jti": secrets.token_hex(8),
        "video": {
            "roomJoin": True,
            "room": room_code,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
            "hidden": False,
            "recorder": False,
        },
        "name": user.username,
    }
    return jwt.encode(payload, s.LIVEKIT_API_SECRET, algorithm="HS256")


@router.post("", status_code=201, summary="Người bệnh tạo yêu cầu hẹn")
def create_appointment(
    data: AppointmentIn,
    user: CurrentUser = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
) -> AppointmentOut:
    # Người bệnh chỉ được đặt lịch với bác sĩ đang phụ trách mình
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if profile is None or profile.assigned_doctor_id != data.doctor_user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn chỉ được đặt lịch với bác sĩ đang phụ trách")
    try:
        dt = datetime.strptime(data.scheduled_at, "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Định dạng thời gian phải là YYYY-MM-DD HH:MM")
    if dt < datetime.now():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Không thể đặt lịch trong quá khứ")

    appt = Appointment(patient_user_id=user.id, doctor_user_id=data.doctor_user_id, scheduled_at=data.scheduled_at, reason=data.reason)
    db.add(appt)
    audit_log(db, user, "create_appointment", "appointment", None, f"doctor={data.doctor_user_id}")
    db.commit()
    db.refresh(appt)
    return AppointmentOut.model_validate(appt)


@router.get("", summary="Danh sách lịch hẹn của tài khoản hiện tại")
def list_appointments(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AppointmentOut]:
    q = db.query(Appointment)
    if user.role == "patient":
        q = q.filter(Appointment.patient_user_id == user.id)
    elif user.role == "doctor":
        q = q.filter(Appointment.doctor_user_id == user.id)
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Vai trò không có quyền xem lịch hẹn")
    rows = q.order_by(Appointment.scheduled_at.asc()).all()
    return [AppointmentOut.model_validate(a) for a in rows]


@router.post("/{appointment_id}/confirm", summary="Bác sĩ xác nhận lịch hẹn")
def confirm_appointment(
    appointment_id: str,
    user: CurrentUser = Depends(require_roles("doctor")),
    db: Session = Depends(get_db),
) -> AppointmentOut:
    appt = db.get(Appointment, appointment_id)
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lịch hẹn")
    if appt.doctor_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ bác sĩ của lịch hẹn mới xác nhận được")
    if appt.status != "requested":
        raise HTTPException(status.HTTP_409_CONFLICT, "Lịch hẹn không ở trạng thái chờ xác nhận")
    appt.status = "confirmed"
    room = ConsultationRoom(appointment_id=appt.id, room_code=secrets.token_urlsafe(16))
    db.add(room)
    audit_log(db, user, "confirm_appointment", "appointment", appt.id)
    db.commit()
    db.refresh(appt)
    return AppointmentOut.model_validate(appt)


@router.post("/{appointment_id}/cancel", summary="Hủy lịch hẹn (2 bên)")
def cancel_appointment(
    appointment_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AppointmentOut:
    appt = db.get(Appointment, appointment_id)
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lịch hẹn")
    if user.id not in (appt.patient_user_id, appt.doctor_user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không phải bên trong lịch hẹn này")
    appt.status = "cancelled"
    audit_log(db, user, "cancel_appointment", "appointment", appt.id)
    db.commit()
    db.refresh(appt)
    return AppointmentOut.model_validate(appt)


@router.post("/{appointment_id}/join", summary="Vào phòng video (kiểm tra quyền, cấp thông tin phòng)")
def join_room(
    appointment_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    appt = db.get(Appointment, appointment_id)
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lịch hẹn")
    if user.id not in (appt.patient_user_id, appt.doctor_user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không phải người tham gia cuộc hẹn này")
    if appt.status != "confirmed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Cuộc hẹn chưa được xác nhận hoặc đã hủy/hoàn tất")

    room = db.query(ConsultationRoom).filter(ConsultationRoom.appointment_id == appt.id).first()
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Phòng họ chưa được tạo")

    settings = get_settings()
    token = _livekit_token(room.room_code, user)
    audit_log(db, user, "join_room", "consultation_room", room.id)
    db.commit()
    return {
        "room_url": settings.LIVEKIT_URL or "",
        "room_code": room.room_code,
        "token": token,
        "recording_disabled": True,
        "note": "Cuộc gọi không được ghi âm/ghi hình. Không chia sẻ link phòng cho người khác.",
    }
