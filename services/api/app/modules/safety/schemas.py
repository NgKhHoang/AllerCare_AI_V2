"""Schemas cho safety check."""
from pydantic import BaseModel, Field


class SafetyCheckIn(BaseModel):
    profile_id: str
    medication_ids: list[str] | None = Field(
        default=None, description="Bỏ trống = kiểm tra toàn bộ thuốc dự kiến (is_planned)"
    )


class SafetyCheckOut(BaseModel):
    id: str
    profile_id: str
    result_status: str
    input_snapshot: dict
    result: dict
    created_at: str


class ReviewIn(BaseModel):
    decision: str = Field(pattern="^(reviewed|action_taken|dismissed_with_reason)$")
    note: str | None = Field(default=None, max_length=1000)
