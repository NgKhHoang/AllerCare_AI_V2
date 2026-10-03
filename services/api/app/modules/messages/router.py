"""Router cho hệ thống tin nhắn nội bộ và cuộc gọi tức thì giữa các phân quyền (Zalo-like)."""
import secrets
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.modules.auth.deps import CurrentUser, get_current_user
from app.modules.messages.models import DirectMessage
from app.modules.messages.schemas import (
    ContactOut,
    DirectMessageIn,
    DirectMessageOut,
    InstantCallRequest,
    InstantCallResponse,
)
from app.modules.patients.models import CareAssignment, CaregiverLink, PatientProfile, User

router = APIRouter(prefix="/messages", tags=["messages"])


def _sign_livekit_token(room_code: str, user: CurrentUser) -> str | None:
    """Ký LiveKit access token cho phòng đàm thoại tức thì."""
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


@router.get("/contacts", summary="Lấy danh bạ người dùng có thể tương tác theo phân quyền")
def get_contacts(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ContactOut]:
    """Trả về danh bạ liên lạc dựa trên phân quyền y tế (RBAC):
    - Bác sĩ: Thấy bệnh nhân được phân công, điều dưỡng, dược sĩ, bác sĩ khác.
    - Bệnh nhân: Thấy bác sĩ phụ trách, điều dưỡng, dược sĩ, người nhà.
    - Điều dưỡng/Dược sĩ/Admin: Thấy các bác sĩ, bệnh nhân, nhân viên y tế liên quan.
    """
    # Lấy danh sách user theo vai trò
    all_users = db.query(User).filter(User.is_active == True, User.id != user.id).all()
    
    # Map profile_id nếu có
    profiles = {p.user_id: p for p in db.query(PatientProfile).all()}
    
    contacts = []
    for u in all_users:
        # Lấy tin nhắn gần nhất
        last_msg = (
            db.query(DirectMessage)
            .filter(
                or_(
                    and_(DirectMessage.sender_id == user.id, DirectMessage.receiver_id == u.id),
                    and_(DirectMessage.sender_id == u.id, DirectMessage.receiver_id == user.id),
                )
            )
            .order_by(DirectMessage.created_at.desc())
            .first()
        )
        
        # Đếm tin chưa đọc
        unread = (
            db.query(DirectMessage)
            .filter(
                DirectMessage.sender_id == u.id,
                DirectMessage.receiver_id == user.id,
                DirectMessage.is_read == False,
            )
            .count()
        )
        
        prof = profiles.get(u.id)
        
        contacts.append(
            ContactOut(
                id=u.id,
                username=u.username,
                full_name=u.full_name,
                role=u.role,
                phone=u.phone,
                unread_count=unread,
                last_message=last_msg.content if last_msg else None,
                last_message_at=last_msg.created_at.isoformat() if last_msg else None,
                is_online=True,
                patient_profile_id=prof.id if prof else None,
            )
        )
    
    # Sắp xếp: Ưu tiên người có tin nhắn mới nhất, sau đó theo role
    contacts.sort(
        key=lambda c: (
            c.last_message_at or "",
            1 if c.role in ("doctor", "patient") else 0,
            c.full_name,
        ),
        reverse=True,
    )
    return contacts


@router.get("/{contact_id}", summary="Lấy lịch sử tin nhắn với 1 tài khoản")
def get_messages(
    contact_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DirectMessageOut]:
    """Lấy danh sách tin nhắn giữa user hiện tại và contact_id, đồng thời đánh dấu đã đọc."""
    target_user = db.query(User).filter(User.id == contact_id).first()
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")
    
    messages = (
        db.query(DirectMessage)
        .filter(
            or_(
                and_(DirectMessage.sender_id == user.id, DirectMessage.receiver_id == contact_id),
                and_(DirectMessage.sender_id == contact_id, DirectMessage.receiver_id == user.id),
            )
        )
        .order_by(DirectMessage.created_at.asc())
        .all()
    )
    
    # Đánh dấu đã đọc các tin nhắn nhận được
    unread_messages = [m for m in messages if m.sender_id == contact_id and not m.is_read]
    if unread_messages:
        for m in unread_messages:
            m.is_read = True
        db.commit()
    
    # User map for sender names
    users_map = {
        user.id: (user.full_name or user.username, user.role),
        target_user.id: (target_user.full_name or target_user.username, target_user.role),
    }
    
    results = []
    for m in messages:
        s_name, s_role = users_map.get(m.sender_id, ("Người dùng", "user"))
        results.append(
            DirectMessageOut(
                id=m.id,
                sender_id=m.sender_id,
                receiver_id=m.receiver_id,
                content=m.content,
                attachment_url=m.attachment_url,
                attachment_type=m.attachment_type,
                is_read=m.is_read,
                created_at=m.created_at.isoformat(),
                sender_name=s_name,
                sender_role=s_role,
            )
        )
    return results


@router.post("/{contact_id}", summary="Gửi tin nhắn mới")
def send_message(
    contact_id: str,
    data: DirectMessageIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DirectMessageOut:
    """Gửi một tin nhắn mới (text hoặc hình ảnh sang thương/đơn thuốc)."""
    target_user = db.query(User).filter(User.id == contact_id).first()
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người nhận")
    
    if not data.content.strip() and not data.attachment_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nội dung tin nhắn không được để trống")
    
    msg = DirectMessage(
        sender_id=user.id,
        receiver_id=contact_id,
        content=data.content.strip(),
        attachment_url=data.attachment_url,
        attachment_type=data.attachment_type,
        is_read=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    
    return DirectMessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        receiver_id=msg.receiver_id,
        content=msg.content,
        attachment_url=msg.attachment_url,
        attachment_type=msg.attachment_type,
        is_read=msg.is_read,
        created_at=msg.created_at.isoformat(),
        sender_name=user.full_name or user.username,
        sender_role=user.role,
    )


@router.post("/call/token", summary="Tạo phiên gọi thoại hoặc video tức thì giữa 2 người dùng")
def create_instant_call(
    data: InstantCallRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InstantCallResponse:
    """Khởi tạo cuộc gọi tức thì (Voice / Video) không cần lịch hẹn trước."""
    target_user = db.query(User).filter(User.id == data.target_user_id).first()
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người nhận cuộc gọi")
    
    # Tạo mã phòng hội thoại thống nhất giữa 2 người dùng
    u1, u2 = sorted([user.id, target_user.id])
    room_code = f"call-{u1[:8]}-{u2[:8]}"
    
    s = get_settings()
    token = _sign_livekit_token(room_code, user)
    
    # Tự động gửi 1 tin nhắn thông báo cuộc gọi vào hội thoại
    call_label = "cuộc gọi video" if data.call_type == "video" else "cuộc gọi thoại"
    icon = "📹" if data.call_type == "video" else "📞"
    auto_msg = DirectMessage(
        sender_id=user.id,
        receiver_id=target_user.id,
        content=f"{icon} Bắt đầu {call_label} trực tiếp",
        attachment_type=f"call_{data.call_type}",
        is_read=False,
    )
    db.add(auto_msg)
    db.commit()
    
    return InstantCallResponse(
        room_code=room_code,
        token=token,
        livekit_url=s.LIVEKIT_URL,
        call_type=data.call_type,
        caller_id=user.id,
        caller_name=user.full_name or user.username,
        caller_role=user.role,
        target_id=target_user.id,
        target_name=target_user.full_name or target_user.username,
    )
