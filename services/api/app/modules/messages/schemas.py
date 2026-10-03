"""Pydantic schemas cho hệ thống tin nhắn và gọi thoại/video trực tiếp."""
from pydantic import BaseModel, ConfigDict


class DirectMessageIn(BaseModel):
    content: str
    attachment_url: str | None = None
    attachment_type: str | None = None  # image, prescription, symptom_photo


class DirectMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sender_id: str
    receiver_id: str
    content: str
    attachment_url: str | None = None
    attachment_type: str | None = None
    is_read: bool = False
    created_at: str
    sender_name: str | None = None
    sender_role: str | None = None


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    full_name: str
    role: str
    phone: str | None = None
    unread_count: int = 0
    last_message: str | None = None
    last_message_at: str | None = None
    is_online: bool = True
    patient_profile_id: str | None = None


class InstantCallRequest(BaseModel):
    target_user_id: str
    call_type: str = "video"  # "voice" | "video"


class InstantCallResponse(BaseModel):
    room_code: str
    token: str | None = None
    livekit_url: str | None = None
    call_type: str
    caller_id: str
    caller_name: str
    caller_role: str
    target_id: str
    target_name: str
