"""Schemas cho safety check."""
from pydantic import BaseModel, Field


class SafetyCheckIn(BaseModel):
    profile_id: str
    medication_ids: list[str] | None = Field(
        default=None, description="Bỏ trống = kiểm tra toàn bộ thuốc"
    )
    custom_drugs: list[str] | None = Field(
        default=None, description="Danh sách 2, 3 hoặc nhiều thuốc bác sĩ nhập trực tiếp để kiểm tra tương tác"
    )


class QuickCheckIn(BaseModel):
    profile_id: str | None = Field(
        default=None, description="ID hồ sơ bệnh nhân để đối chiếu tiền sử dị ứng và bệnh nền"
    )
    drugs: list[str] = Field(
        min_length=1, description="Danh sách 2, 3 hoặc nhiều loại chất/thuốc cần kiểm tra tương tác với nhau và với bệnh nhân"
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

