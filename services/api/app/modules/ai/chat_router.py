"""API trò chuyện với AI cho người bệnh: phân loại → AI ảo trả lời → lưu phiên.

AI ảo học từ data/ai_knowledge/ (nguyên tắc chia liều của bác sĩ + ví dụ liều +
yếu tố bệnh nhân + phong cách hội thoại). Guardrails luôn chạy trước AI.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.ai.adapter import generate_answer
from app.modules.ai.guardrails import classify
from app.modules.ai.knowledge import get_brain
from app.modules.auth.deps import CurrentUser, audit_log, require_roles
from app.modules.consultations.models import ChatMessage, ChatSession

router = APIRouter(prefix="/chat", tags=["chat"])


class MessageIn(BaseModel):
    session_id: str | None = Field(default=None, description="Bỏ trống = tạo phiên mới")
    content: str = Field(min_length=1, max_length=2000)


class MessageOut(BaseModel):
    session_id: str
    role: str
    content: str
    sources: list[dict]
    emergency: bool
    handoff: bool


_GREETING_REPLY = (
    "Chào bạn! Mình là Trợ lý AI của AllerCare 🌊\n\n"
    "Mình học từ kho kiến thức của hệ thống — gồm nguyên tắc chia liều của bác sĩ, ví dụ liều thực tế "
    "và yếu tố bệnh nhân (tuổi, thận, gan…) — nên có thể:\n"
    "- 💊 Kể cho bạn nghe cách bác sĩ chia liều thuốc trong kho kiến thức, theo đúng hồ sơ của bạn\n"
    "- 📚 Trả lời cách dùng thuốc theo hướng dẫn đã được duyệt\n"
    "- 🚨 Cảnh báo khẩn cấp → mình sẽ hướng dẫn gọi 115 ngay\n\n"
    "Mình không kê đơn, không tự ý đổi liều — việc đó thuộc về bác sĩ phụ trách. "
    "Bạn đang thắc mắc về thuốc nào hôm nay? 😊"
)

_SMALLTALK_REPLY = (
    "Mình là Trợ lý AI của AllerCare — trợ lý ảo học từ kho kiến thức của hệ thống, không phải bác sĩ hay dược sĩ nhé 😊 "
    "Mình được học cách bác sĩ chia liều thuốc nên có thể trò chuyện cùng bạn về cách dùng thuốc và liều theo hồ sơ của bạn. "
    "Còn quyết định chuyên môn thì luôn thuộc về bác sĩ phụ trách. "
    "Bạn đang thắc mắc về thuốc nào không?"
)


def _safe_json_loads(raw: str | None) -> list:
    if not raw:
        return []
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return []


@router.get("/sessions", summary="Danh sách hội thoại hỏi đáp AI của người bệnh hiện tại")
def list_sessions(
    user: CurrentUser = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Chỉ trả về hội thoại của chính người bệnh — không xem chéo."""
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.patient_user_id == user.id)
        .order_by(ChatSession.created_at.desc())
        .limit(30)
        .all()
    )
    out = []
    for s in sessions:
        last = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == s.id)
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        count = db.query(ChatMessage).filter(ChatMessage.session_id == s.id).count()
        out.append({
            "session_id": s.id,
            "created_at": s.created_at.isoformat(),
            "message_count": count,
            "last_message": (last.content[:140] if last else ""),
        })
    return out


@router.post("/messages", summary="Gửi tin nhắn cho Trợ lý AI (người bệnh)")
def send_message(
    data: MessageIn,
    user: CurrentUser = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
) -> MessageOut:
    if data.session_id:
        session = db.get(ChatSession, data.session_id)
        if session is None or session.patient_user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Phiên chat không thuộc về bạn")
    else:
        session = ChatSession(patient_user_id=user.id)
        db.add(session)
        db.flush()

    db.add(ChatMessage(session_id=session.id, role="patient", content=data.content))

    label = classify(data.content)
    if label == "greeting":
        answer, sources = _GREETING_REPLY, []
    elif label == "smalltalk":
        answer, sources = _SMALLTALK_REPLY, []
    else:
        answer, sources = generate_answer(db, data.content, label, user_id=user.id)

    role = "assistant"
    if label == "handoff":
        role = "handoff"

    db.add(
        ChatMessage(
            session_id=session.id,
            role=role,
            content=answer,
            sources_json=json.dumps(sources, ensure_ascii=False),
        )
    )
    audit_log(db, user, "chat_message", "chat_session", session.id, f"classification={label}")
    db.commit()

    return MessageOut(
        session_id=session.id,
        role=role,
        content=answer,
        sources=sources,
        emergency=label == "emergency",
        handoff=label == "handoff",
    )


@router.get("/messages", summary="Lịch sử tin nhắn của một hội thoại hỏi đáp AI")
def list_messages(
    session_id: str,
    user: CurrentUser = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
) -> list[dict]:
    session = db.get(ChatSession, session_id)
    if session is None or session.patient_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Phiên chat không thuộc về bạn")
    msgs = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    out = []
    for m in msgs:
        out.append({
            "role": m.role,
            "content": m.content,
            "sources": _safe_json_loads(m.sources_json),
            "at": m.created_at.isoformat(),
        })
    return out


@router.get("/knowledge-info", summary="Minh bạch: AI học từ đâu (người bệnh xem được)")
def knowledge_info(user: CurrentUser = Depends(require_roles("patient"))) -> dict:
    brain = get_brain()
    stats = brain.stats()
    return {
        "ai_name": "Trợ lý AI AllerCare",
        "scope": "Chỉ học từ data/ai_knowledge/ — nguyên tắc chia liều của bác sĩ, ví dụ liều, yếu tố bệnh nhân.",
        "cannot_do": [
            "Không kê đơn hoặc tự ý đổi liều",
            "Không chẩn đoán bệnh",
            "Không truy cập hồ sơ của người bệnh khác",
            "Không gọi Internet",
        ],
        "stats": stats,
    }
