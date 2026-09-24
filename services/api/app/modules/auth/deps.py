"""FastAPI dependencies: xác thực từ JWT và phân quyền theo từng hồ sơ.

Quyền được kiểm tra ở backend trên từng hồ sơ (CareAssignment/sở hữu),
không tin vai trò khai báo từ client.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.audit.models import AuditEvent
from app.modules.auth.security import decode_token
from app.modules.patients.models import CareAssignment, PatientProfile, User

bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser:
    def __init__(self, id: str, username: str, role: str):
        self.id = id
        self.username = username
        self.role = role


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chưa đăng nhập")
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token không hợp lệ")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không tồn tại hoặc đã bị khóa")
    return CurrentUser(id=user.id, username=user.username, role=user.role)


def require_roles(*roles: str):
    """Chỉ cho phép các vai trò chỉ định."""

    def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có quyền thực hiện thao tác này")
        return user

    return checker


def get_patient_profile_for_access(profile_id: str, user: CurrentUser, db: Session) -> PatientProfile:
    """Kiểm tra quyền truy cập hồ sơ: chính chủ, bác sĩ được phân công, điều dưỡng, dược sĩ.

    - leader: CHỈ xem số liệu tổng hợp — không truy cập hồ sơ lâm sàng.
    - admin: không tự động xem nội dung lâm sàng (tài liệu CHI TIẾT mục VI).
    """
    profile = db.get(PatientProfile, profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ")
    if user.role == "patient" and profile.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có quyền truy cập hồ sơ này")
    if user.role == "doctor" and profile.assigned_doctor_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ xem ca được phân công")
    if user.role not in ("patient", "doctor", "pharmacist", "nurse"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Vai trò không có quyền lâm sàng")
    return profile


def get_owned_patient_profile(profile_id: str, user: CurrentUser, db: Session) -> PatientProfile:
    """Chính chủ HOẶC người nhà được ủy quyền (caregiver_links active) — khai báo thay người bệnh."""
    profile = db.get(PatientProfile, profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ")
    if profile.user_id == user.id:
        return profile
    if user.role == "caregiver":
        link = db.execute(
            text("SELECT 1 FROM caregiver_links WHERE caregiver_user_id=:c AND patient_user_id=:p AND active"),
            {"c": user.id, "p": profile.user_id},
        ).first()
        if link is not None:
            return profile
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn chỉ có thể thao tác trên hồ sơ của mình hoặc người thân được ủy quyền")


def get_assigned_patient_profile(profile_id: str, user: CurrentUser, db: Session) -> PatientProfile:
    """Bác sĩ được phân công (hoặc dược sĩ/điều dưỡng rà soát) truy cập."""
    profile = db.get(PatientProfile, profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ")
    if user.role == "doctor" and profile.assigned_doctor_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ xem ca được phân công")
    if user.role not in ("doctor", "pharmacist", "nurse"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Vai trò không có quyền này")
    return profile


def audit_log(db: Session, user: CurrentUser | None, action: str, object_type: str, object_id: str | None = None, detail: str | None = None) -> None:
    """Ghi AuditEvent — không lưu dữ liệu nhạy cảm vào log."""
    db.add(
        AuditEvent(
            user_id=user.id if user else None,
            username=user.username if user else None,
            action=action,
            object_type=object_type,
            object_id=object_id,
            detail=detail,
        )
    )
