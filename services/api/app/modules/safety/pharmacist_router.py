"""API dược sĩ lâm sàng: xem danh sách quy tắc, rà soát duyệt/bỏ duyệt (draft ↔ approved)."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.auth.deps import CurrentUser, audit_log, require_roles
from app.modules.safety.knowledge_models import SafetyRule

router = APIRouter(prefix="/rules", tags=["pharmacist"])


class RuleOut(BaseModel):
    id: str
    code: str
    rule_version: str
    rule_type: str
    title: str
    message: str
    severity: str
    status: str
    condition_json: str
    required_data_json: str
    source_title: str | None = None

    model_config = {"from_attributes": True}


class RuleStatusIn(BaseModel):
    status: str = Field(pattern="^(approved|draft)$")


def _to_out(r: SafetyRule) -> RuleOut:
    return RuleOut(
        id=r.id,
        code=r.code,
        rule_version=r.rule_version,
        rule_type=r.rule_type,
        title=r.title,
        message=r.message,
        severity=r.severity,
        status=r.status,
        condition_json=r.condition_json,
        required_data_json=r.required_data_json,
        source_title=r.source.title if r.source else None,
    )


@router.get("", summary="Danh sách quy tắc an toàn")
def list_rules(
    user: CurrentUser = Depends(require_roles("pharmacist", "doctor")),
    db: Session = Depends(get_db),
) -> list[RuleOut]:
    rows = db.query(SafetyRule).order_by(SafetyRule.code).all()
    return [_to_out(r) for r in rows]


@router.post("/{rule_id}/status", summary="Duyệt hoặc chuyển quy tắc về bản nháp (chỉ dược sĩ)")
def set_rule_status(
    rule_id: str,
    data: RuleStatusIn,
    user: CurrentUser = Depends(require_roles("pharmacist")),
    db: Session = Depends(get_db),
) -> dict:
    rule = db.get(SafetyRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy quy tắc")
    old = rule.status
    rule.status = data.status
    if data.status == "approved":
        rule.approved_by = user.username
    audit_log(db, user, "set_rule_status", "safety_rule", rule.id, f"{old} -> {data.status}")
    db.commit()
    return {"id": rule.id, "status": rule.status}
