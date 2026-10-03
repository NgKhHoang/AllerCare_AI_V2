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
    CallSignalIn,
    CallSignalOut,
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


def _seed_sample_messages_if_empty(db: Session) -> None:
    """Tự động tạo các tin nhắn mẫu ban đầu giữa bác sĩ, bệnh nhân, điều dưỡng, dược sĩ."""
    count = db.query(DirectMessage).count()
    if count > 0:
        return
    
    doc = db.query(User).filter(User.username == "doctor1").first()
    pat = db.query(User).filter(User.username == "patient1").first()
    nurse = db.query(User).filter(User.username == "nurse1").first()
    pharma = db.query(User).filter(User.username == "pharmacist1").first()
    
    if not (doc and pat):
        return
    
    samples = [
        DirectMessage(
            sender_id=doc.id,
            receiver_id=pat.id,
            content="Chào bạn Huy, tình trạng phát ban da liễu sau khi dùng thuốc hôm nay đỡ ngứa chưa?",
            is_read=True,
        ),
        DirectMessage(
            sender_id=pat.id,
            receiver_id=doc.id,
            content="Dạ chào Bác sĩ An, vùng da cẳng tay đỡ đỏ nhiều rồi ạ, nhưng thỉnh thoảng còn hơi châm chích nhẹ.",
            is_read=True,
        ),
        DirectMessage(
            sender_id=doc.id,
            receiver_id=pat.id,
            content="Tốt lắm. Bạn tiếp tục bôi thuốc mỡ đúng theo đơn nhé. Nếu có dấu hiệu nổi mày đay lan rộng hãy bấm gọi video cho tôi ngay.",
            is_read=True,
        ),
    ]
    if nurse:
        samples.append(
            DirectMessage(
                sender_id=nurse.id,
                receiver_id=pat.id,
                content="Nhắc nhở: Bạn nhớ uống thuốc dị ứng vào lúc 20h tối nay sau khi ăn no nhé.",
                is_read=False,
            )
        )
    if pharma:
        samples.append(
            DirectMessage(
                sender_id=pharma.id,
                receiver_id=doc.id,
                content="Bác sĩ An ơi, đơn thuốc của bệnh nhân Huy đã được rà soát MedSafe đạt chuẩn an toàn, không có tương tác chéo.",
                is_read=True,
            )
        )
    for s in samples:
        db.add(s)
    db.commit()


def _get_allowed_contact_ids(user: CurrentUser, db: Session) -> set[str] | None:
    """Xác định danh sách user ID mà người dùng hiện tại được phép liên lạc:
    - Bác sĩ, Lãnh đạo, Quản trị viên, Điều dưỡng, Dược sĩ: Liên lạc toàn bộ danh bạ y tế (None).
    - Người bệnh: CHỈ có thể liên lạc với Bác sĩ đang phụ trách điều trị.
    - Người nhà (Caregiver): Liên lạc với Bác sĩ phụ trách của bệnh nhân được ủy quyền.
    """
    if user.role in ("doctor", "leader", "admin", "nurse", "pharmacist"):
        return None

    if user.role == "patient":
        doc_ids = set()
        # 1. Từ phân công điều trị CareAssignment
        for ca in (
            db.query(CareAssignment)
            .filter(CareAssignment.patient_user_id == user.id, CareAssignment.active == True)
            .all()
        ):
            doc_ids.add(ca.doctor_id)

        # 2. Từ hồ sơ bệnh nhân PatientProfile.assigned_doctor_id
        prof = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
        if prof and prof.assigned_doctor_id:
            doc_ids.add(prof.assigned_doctor_id)

        # 3. Fallback an toàn cho tài khoản demo: Gán bác sĩ doctor1 (BS. Nguyễn Văn An)
        if not doc_ids:
            doc1 = db.query(User).filter(User.username == "doctor1", User.is_active == True).first()
            if doc1:
                doc_ids.add(doc1.id)
            else:
                first_doc = db.query(User).filter(User.role == "doctor", User.is_active == True).first()
                if first_doc:
                    doc_ids.add(first_doc.id)
        return doc_ids

    if user.role == "caregiver":
        patient_ids = [
            cl.patient_user_id
            for cl in db.query(CaregiverLink)
            .filter(CaregiverLink.caregiver_user_id == user.id, CaregiverLink.active == True)
            .all()
        ]
        doc_ids = set()
        for pid in patient_ids:
            for ca in (
                db.query(CareAssignment)
                .filter(CareAssignment.patient_user_id == pid, CareAssignment.active == True)
                .all()
            ):
                doc_ids.add(ca.doctor_id)
            prof = db.query(PatientProfile).filter(PatientProfile.user_id == pid).first()
            if prof and prof.assigned_doctor_id:
                doc_ids.add(prof.assigned_doctor_id)
        if not doc_ids:
            doc1 = db.query(User).filter(User.username == "doctor1", User.is_active == True).first()
            if doc1:
                doc_ids.add(doc1.id)
        return doc_ids

    return None


@router.get("/contacts", summary="Lấy danh bạ người dùng có thể tương tác theo phân quyền")
def get_contacts(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ContactOut]:
    """Trả về danh bạ liên lạc dựa trên phân quyền y tế (RBAC):
    - Người bệnh: Chỉ hiển thị Bác sĩ đang phụ trách.
    - Bác sĩ: Hiển thị toàn bộ người bệnh, bác sĩ, điều dưỡng, dược sĩ.
    """
    _seed_sample_messages_if_empty(db)

    allowed_ids = _get_allowed_contact_ids(user, db)

    # Lấy danh sách user theo vai trò & phạm vi phân quyền
    query = db.query(User).filter(User.is_active == True, User.id != user.id)
    if allowed_ids is not None:
        query = query.filter(User.id.in_(allowed_ids))
    all_users = query.all()
    
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

    allowed_ids = _get_allowed_contact_ids(user, db)
    if allowed_ids is not None and target_user.id not in allowed_ids:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Người bệnh chỉ có thể liên lạc với Bác sĩ đang phụ trách điều trị.",
        )
    
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

    allowed_ids = _get_allowed_contact_ids(user, db)
    if allowed_ids is not None and target_user.id not in allowed_ids:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Người bệnh chỉ có thể liên lạc với Bác sĩ đang phụ trách điều trị.",
        )
    
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


# In-memory signaling store for instant peer-to-peer WebRTC calls
_CALL_SESSIONS: dict[str, dict] = {}


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

    allowed_ids = _get_allowed_contact_ids(user, db)
    if allowed_ids is not None and target_user.id not in allowed_ids:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Người bệnh chỉ có thể liên lạc với Bác sĩ đang phụ trách điều trị.",
        )
    
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

    # Đăng ký phiên WebRTC Signaling
    import time
    _CALL_SESSIONS[room_code] = {
        "room_code": room_code,
        "status": "ringing",
        "caller_id": user.id,
        "caller_name": user.full_name or user.username,
        "caller_role": user.role,
        "target_id": target_user.id,
        "target_name": target_user.full_name or target_user.username,
        "call_type": data.call_type,
        "offer": None,
        "answer": None,
        "caller_candidates": [],
        "target_candidates": [],
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    
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


@router.get("/call/incoming", summary="Kiểm tra xem có cuộc gọi đến đang reo chuông cho tài khoản hiện tại")
def check_incoming_call(
    user: CurrentUser = Depends(get_current_user),
) -> CallSignalOut | None:
    """Kiểm tra xem có người gọi tới tài khoản hiện tại không (dùng để reo chuông thiết bị phía nhận)."""
    import time
    now = time.time()
    for room_code, s in list(_CALL_SESSIONS.items()):
        if now - s.get("created_at", 0) > 90:
            if s.get("status") == "ringing":
                s["status"] = "ended"
            continue
        
        if s.get("target_id") == user.id and s.get("status") in ("ringing", "connected"):
            candidates = s.get("caller_candidates", [])
            return CallSignalOut(
                room_code=room_code,
                status=s["status"],
                caller_id=s["caller_id"],
                caller_name=s["caller_name"],
                caller_role=s["caller_role"],
                target_id=s["target_id"],
                target_name=s["target_name"],
                call_type=s["call_type"],
                offer=s.get("offer"),
                answer=s.get("answer"),
                candidates=candidates,
            )
    return None


@router.post("/call/signal", summary="Trao đổi tín hiệu WebRTC (Offer, Answer, ICE Candidates, End Call)")
def send_call_signal(
    signal: CallSignalIn,
    user: CurrentUser = Depends(get_current_user),
) -> CallSignalOut:
    """Trao đổi tín hiệu WebRTC P2P SDP giữa Người gọi (Caller) và Người nghe (Callee)."""
    import time
    s = _CALL_SESSIONS.get(signal.room_code)
    if not s:
        s = {
            "room_code": signal.room_code,
            "status": "ringing",
            "caller_id": user.id,
            "caller_name": user.full_name or user.username,
            "caller_role": user.role,
            "target_id": "",
            "target_name": "",
            "call_type": "video",
            "offer": None,
            "answer": None,
            "caller_candidates": [],
            "target_candidates": [],
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        _CALL_SESSIONS[signal.room_code] = s

    s["updated_at"] = time.time()
    stype = signal.signal_type

    if stype == "offer":
        s["offer"] = signal.data
    elif stype == "answer":
        s["answer"] = signal.data
        s["status"] = "connected"
    elif stype == "candidate" and signal.data:
        if user.id == s.get("caller_id"):
            s.setdefault("caller_candidates", []).append(signal.data)
        else:
            s.setdefault("target_candidates", []).append(signal.data)
    elif stype in ("accept", "connected"):
        s["status"] = "connected"
    elif stype in ("decline", "declined"):
        s["status"] = "declined"
    elif stype in ("end", "ended"):
        s["status"] = "ended"

    is_caller = user.id == s.get("caller_id")
    remote_candidates = s.get("target_candidates", []) if is_caller else s.get("caller_candidates", [])

    return CallSignalOut(
        room_code=signal.room_code,
        status=s["status"],
        caller_id=s.get("caller_id", ""),
        caller_name=s.get("caller_name", ""),
        caller_role=s.get("caller_role", "doctor"),
        target_id=s.get("target_id", ""),
        target_name=s.get("target_name", ""),
        call_type=s.get("call_type", "video"),
        offer=s.get("offer"),
        answer=s.get("answer"),
        candidates=remote_candidates,
    )


@router.get("/call/signal/{room_code}", summary="Lấy tín hiệu WebRTC hiện tại của phòng đàm thoại")
def get_call_signal(
    room_code: str,
    user: CurrentUser = Depends(get_current_user),
) -> CallSignalOut:
    """Lấy trạng thái SDP offer/answer và ICE candidates từ phía đối phương."""
    s = _CALL_SESSIONS.get(room_code)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Phiên đàm thoại không tồn tại hoặc đã kết thúc")

    is_caller = user.id == s.get("caller_id")
    remote_candidates = s.get("target_candidates", []) if is_caller else s.get("caller_candidates", [])

    return CallSignalOut(
        room_code=room_code,
        status=s.get("status", "ended"),
        caller_id=s.get("caller_id", ""),
        caller_name=s.get("caller_name", ""),
        caller_role=s.get("caller_role", "doctor"),
        target_id=s.get("target_id", ""),
        target_name=s.get("target_name", ""),
        call_type=s.get("call_type", "video"),
        offer=s.get("offer"),
        answer=s.get("answer"),
        candidates=remote_candidates,
    )


@router.post("/{contact_id}/auto-reply", summary="Tự động tạo tin nhắn phản hồi từ người liên hệ")
def trigger_auto_reply(
    contact_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DirectMessageOut:
    """Tạo tin nhắn phản hồi tương tác mô phỏng từ người nhận về cho người gửi."""
    target_user = db.query(User).filter(User.id == contact_id).first()
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người gửi phản hồi")

    allowed_ids = _get_allowed_contact_ids(user, db)
    if allowed_ids is not None and target_user.id not in allowed_ids:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Người bệnh chỉ có thể liên lạc với Bác sĩ đang phụ trách điều trị.",
        )
    
    # Mẫu câu trả lời theo role của target
    reply_templates = {
        "doctor": [
            "Tôi đã nhận được thông tin và hình ảnh của bạn. Bạn tiếp tục duy trì liều lượng thuốc như hướng dẫn nhé.",
            "Chào bạn, các triệu chứng này nằm trong phạm vi kiểm soát tốt. Hãy theo dõi thêm 2 ngày và báo lại cho tôi.",
            "Đã kiểm tra hồ sơ. Vui lòng bấm gọi video nếu bạn cảm thấy khó chịu hoặc ngứa tăng lên nhé.",
        ],
        "patient": [
            "Dạ em đã nhận được lời dặn của bác sĩ. Em sẽ uống thuốc đúng giờ ạ.",
            "Dạ cảm ơn bác sĩ/điều dưỡng đã hướng dẫn nhiệt tình, tình trạng em đã đỡ nhiều rồi ạ!",
            "Dạ vâng, em vừa uống thuốc xong và đang theo dõi tại nhà ạ.",
        ],
        "nurse": [
            "Điều dưỡng đã ghi nhận thông tin và cập nhật vào sổ theo dõi ca trực hôm nay.",
            "Bạn nhớ đo nhiệt độ và kiểm tra huyết áp/nhịp tim rồi gửi cho bên mình nhé.",
        ],
        "pharmacist": [
            "Dược sĩ xác nhận đơn thuốc này không có tương tác bất lợi. Bạn có thể yên tâm sử dụng theo chỉ dẫn.",
        ],
    }
    choices = reply_templates.get(target_user.role, ["Đã nhận được tin nhắn của bạn."])
    import random
    reply_text = random.choice(choices)

    msg = DirectMessage(
        sender_id=contact_id,
        receiver_id=user.id,
        content=reply_text,
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
        sender_name=target_user.full_name or target_user.username,
        sender_role=target_user.role,
    )

