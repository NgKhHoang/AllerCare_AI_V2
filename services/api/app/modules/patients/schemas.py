"""Pydantic schemas cho module người bệnh."""
from pydantic import BaseModel, Field


SOURCES = [
    "Bệnh viện Thống Nhất kê",
    "Bệnh viện/phòng khám khác",
    "Tự mua",
    "Thuốc không kê đơn (OTC)",
    "Thực phẩm chức năng",
    "Đông y/thảo dược",
]


class MedicationIn(BaseModel):
    raw_name: str = Field(min_length=1, max_length=160, description="Tên thuốc người bệnh/bác sĩ nhập")
    is_current: bool = True
    is_planned: bool = False
    dose: str | None = Field(default=None, max_length=80)
    route: str | None = Field(default=None, max_length=40)
    frequency: str | None = Field(default=None, max_length=80)
    timing: str | None = Field(default=None, max_length=120, description="Thời điểm dùng (VD: 8h và 20h)")
    start_date: str | None = Field(default=None, max_length=20)
    prescriber: str | None = Field(default=None, max_length=120, description="Người kê đơn/BV/tự mua")
    source_label: str | None = Field(default=None, max_length=120, description="Nguồn thuốc theo WHO reconciliation")
    image_url: str | None = Field(default=None, max_length=300, description="Tên file ảnh toa/bao bì (demo)")
    last_reaction: str | None = Field(default=None, max_length=300, description="Biểu hiện sau dùng")
    stop_reason: str | None = Field(default=None, max_length=200, description="Lý do ngừng")
    status: str | None = Field(default=None, pattern="^(active|stopped|irregular)$")


class MedicationOut(BaseModel):
    id: str
    raw_name: str
    is_current: bool
    is_planned: bool
    dose: str | None
    route: str | None
    frequency: str | None
    timing: str | None
    start_date: str | None
    prescriber: str | None
    status: str
    stop_reason: str | None
    last_reaction: str | None
    image_url: str | None
    verification: str
    source_label: str | None

    model_config = {"from_attributes": True}


class ObservationIn(BaseModel):
    kind: str = Field(pattern="^(symptom|lab)$")
    label: str = Field(min_length=1, max_length=200)
    value: str | None = Field(default=None, max_length=80)
    unit: str | None = Field(default=None, max_length=40)
    occurred_at: str = Field(min_length=10, max_length=20, description="YYYY-MM-DD HH:MM")
    image_url: str | None = Field(default=None, max_length=300, description="Tên file ảnh tổn thương da (demo)")


class ObservationOut(BaseModel):
    id: str
    kind: str
    label: str
    value: str | None
    unit: str | None
    occurred_at: str
    image_url: str | None
    status: str
    verification: str

    model_config = {"from_attributes": True}


class AllergyIn(BaseModel):
    substance: str = Field(min_length=1, max_length=160)
    reaction: str | None = Field(default=None, max_length=500)
    severity: str | None = Field(default=None, max_length=20)
    onset_date: str | None = Field(default=None, max_length=20)


class AllergyOut(BaseModel):
    id: str
    substance: str
    reaction: str | None
    severity: str | None
    verification: str
    onset_date: str | None

    model_config = {"from_attributes": True}


class ProfileOut(BaseModel):
    id: str
    full_name: str
    dob: str | None
    gender: str | None
    chronic_conditions: str | None
    assigned_doctor_id: str | None

    model_config = {"from_attributes": True}
