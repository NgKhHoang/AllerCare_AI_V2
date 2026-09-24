"""Schemas lịch hẹn."""
from pydantic import BaseModel, Field


class AppointmentIn(BaseModel):
    doctor_user_id: str
    scheduled_at: str = Field(min_length=16, max_length=20, description="YYYY-MM-DD HH:MM")
    reason: str | None = Field(default=None, max_length=500)


class AppointmentOut(BaseModel):
    id: str
    patient_user_id: str
    doctor_user_id: str
    scheduled_at: str
    status: str
    reason: str | None

    model_config = {"from_attributes": True}
