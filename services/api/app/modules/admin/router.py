"""API Quản trị hệ thống toàn diện (Admin Super Dashboard):
- Quản lý người dùng (CRUD, Reset password, Khóa/Mở khóa, Phân quyền)
- Quản trị Dược lâm sàng & Quy tắc an toàn (CRUD 657+ Safety Rules, 326+ Ingredients, Drugs)
- Giám sát AI Engine & Health Telemetry (Gemini Ping Test, Config, Latency)
- Nhật ký sự kiện & Trung tâm kiểm toán (Audit Logs Filter & Export)
"""
from datetime import datetime, timezone
import json
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.modules.ai.adapter import generate_answer
from app.modules.audit.models import AuditEvent, new_id
from app.modules.auth.deps import CurrentUser, audit_log, require_roles
from app.modules.auth.security import hash_password
from app.modules.medications.models import Drug, DrugIngredient, Ingredient
from app.modules.patients.models import User
from app.modules.safety.check_models import Alert, SafetyCheck
from app.modules.safety.knowledge_models import KnowledgeSource, SafetyRule
from app.modules.triage.models import TriageAssessment

router = APIRouter(prefix="/admin", tags=["admin"])


# =====================================================================
# Pydantic Schemas
# =====================================================================

class UserCreateSchema(BaseModel):
    username: str = Field(..., min_length=3, max_length=80)
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2, max_length=160)
    role: str = Field(..., description="patient, doctor, nurse, pharmacist, leader, admin, caregiver")
    phone: Optional[str] = None
    is_active: bool = True


class UserUpdateSchema(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class UserResetPasswordSchema(BaseModel):
    new_password: str = Field(..., min_length=6)


class RuleCreateSchema(BaseModel):
    code: str = Field(..., min_length=2, max_length=60)
    rule_version: str = "1.0"
    rule_type: str = Field(..., description="drug_drug | duplicate_ingredient | drug_allergy | drug_condition")
    title: str
    message: str
    severity: str = Field("medium", description="high | medium | low")
    status: str = Field("approved", description="approved | draft")
    condition_json: str = "{}"
    required_data_json: str = "[]"
    approved_by: Optional[str] = "Admin Quản trị"


class RuleUpdateSchema(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    condition_json: Optional[str] = None
    approved_by: Optional[str] = None


class IngredientCreateSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    atc_code: Optional[str] = None
    notes: Optional[str] = None


class DrugCreateSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    strength: Optional[str] = None
    form: Optional[str] = None
    is_combination: bool = False
    in_scope: bool = True
    ingredient_ids: list[str] = []


class AITestSchema(BaseModel):
    prompt: str = Field("Kiểm tra kết nối hệ thống AI AllerCare", max_length=500)


# =====================================================================
# 1. Dashboard Overview & System Stats
# =====================================================================

@router.get("/stats", summary="Tổng quan số liệu quản trị hệ thống")
def get_admin_stats(
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    total_users = db.query(func.count(User.id)).scalar() or 0
    users_by_role = dict(db.query(User.role, func.count(User.id)).group_by(User.role).all())
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0

    total_rules = db.query(func.count(SafetyRule.id)).scalar() or 0
    rules_by_severity = dict(db.query(SafetyRule.severity, func.count(SafetyRule.id)).group_by(SafetyRule.severity).all())
    rules_by_type = dict(db.query(SafetyRule.rule_type, func.count(SafetyRule.id)).group_by(SafetyRule.rule_type).all())

    total_ingredients = db.query(func.count(Ingredient.id)).scalar() or 0
    total_drugs = db.query(func.count(Drug.id)).scalar() or 0
    total_audits = db.query(func.count(AuditEvent.id)).scalar() or 0
    total_checks = db.query(func.count(SafetyCheck.id)).scalar() or 0
    total_triage = db.query(func.count(TriageAssessment.id)).scalar() or 0

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "by_role": users_by_role,
        },
        "safety_rules": {
            "total": total_rules,
            "by_severity": rules_by_severity,
            "by_type": rules_by_type,
        },
        "catalog": {
            "ingredients_count": total_ingredients,
            "drugs_count": total_drugs,
        },
        "activity": {
            "audit_events_count": total_audits,
            "safety_checks_count": total_checks,
            "triage_assessments_count": total_triage,
        },
        "ai_engine": {
            "provider": settings.AI_PROVIDER,
            "model": settings.AI_MODEL,
            "has_api_key": bool(settings.AI_API_KEY.strip()),
            "demo_mode": settings.DEMO_MODE,
        },
        "server_time": datetime.now(timezone.utc).isoformat(),
    }


# =====================================================================
# 2. User Management (CRUD)
# =====================================================================

@router.get("/users", summary="Danh sách tài khoản có tìm kiếm & phân trang")
def list_users(
    q: Optional[str] = None,
    role: Optional[str] = None,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if q:
        kw = f"%{q.strip()}%"
        query = query.filter(or_(User.username.ilike(kw), User.full_name.ilike(kw), User.phone.ilike(kw)))
    rows = query.order_by(User.role, User.username).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role,
            "phone": u.phone,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else "",
        }
        for u in rows
    ]


@router.post("/users", summary="Tạo mới tài khoản người dùng")
def create_user(
    body: UserCreateSchema,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.query(User).filter(User.username == body.username.strip()).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Tên đăng nhập '{body.username}' đã tồn tại")

    new_user = User(
        id=new_id(),
        username=body.username.strip(),
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        role=body.role.strip(),
        phone=body.phone.strip() if body.phone else None,
        is_active=body.is_active,
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_user)
    audit_log(db, user, "create_user", "user", new_user.id, f"username={new_user.username}, role={new_user.role}")
    db.commit()
    db.refresh(new_user)
    return {
        "id": new_user.id,
        "username": new_user.username,
        "full_name": new_user.full_name,
        "role": new_user.role,
        "is_active": new_user.is_active,
    }


@router.put("/users/{user_id}", summary="Cập nhật thông tin người dùng")
def update_user(
    user_id: str,
    body: UserUpdateSchema,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")

    if body.full_name is not None:
        target.full_name = body.full_name.strip()
    if body.role is not None:
        target.role = body.role.strip()
    if body.phone is not None:
        target.phone = body.phone.strip()
    if body.is_active is not None:
        if target.id == user.id and not body.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể tự vô hiệu hóa tài khoản của bạn")
        target.is_active = body.is_active

    audit_log(db, user, "update_user", "user", target.id, f"updated fields: {body.model_dump(exclude_unset=True)}")
    db.commit()
    return {"id": target.id, "username": target.username, "full_name": target.full_name, "role": target.role, "is_active": target.is_active}


@router.post("/users/{user_id}/reset-password", summary="Đặt lại mật khẩu cho người dùng")
def reset_user_password(
    user_id: str,
    body: UserResetPasswordSchema,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")
    target.password_hash = hash_password(body.new_password)
    audit_log(db, user, "reset_password", "user", target.id, f"Reset password for {target.username}")
    db.commit()
    return {"id": target.id, "username": target.username, "message": "Đặt lại mật khẩu thành công"}


@router.post("/users/{user_id}/active", summary="Khóa/mở tài khoản")
def toggle_user_active(
    user_id: str,
    is_active: bool,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")
    if target.id == user.id and not is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Không thể tự khóa tài khoản của chính mình")
    target.is_active = is_active
    audit_log(db, user, "set_user_active", "user", target.id, f"active={is_active}")
    db.commit()
    return {"id": target.id, "username": target.username, "is_active": target.is_active}


@router.delete("/users/{user_id}", summary="Xóa tài khoản người dùng")
def delete_user(
    user_id: str,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")
    if target.id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể tự xóa tài khoản của chính mình")
    username = target.username
    db.delete(target)
    audit_log(db, user, "delete_user", "user", user_id, f"Deleted user {username}")
    db.commit()
    return {"message": f"Đã xóa tài khoản {username} thành công"}


# =====================================================================
# 3. Clinical Safety Rules Management (CRUD 657+ Rules)
# =====================================================================

@router.get("/rules", summary="Danh sách quy tắc an toàn thuốc (có lọc & phân trang)")
def list_rules(
    q: Optional[str] = None,
    rule_type: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(SafetyRule)
    if rule_type:
        query = query.filter(SafetyRule.rule_type == rule_type)
    if severity:
        query = query.filter(SafetyRule.severity == severity)
    if q:
        kw = f"%{q.strip()}%"
        query = query.filter(or_(SafetyRule.code.ilike(kw), SafetyRule.title.ilike(kw), SafetyRule.message.ilike(kw)))

    total = query.count()
    rows = query.order_by(SafetyRule.code).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": r.id,
                "code": r.code,
                "rule_version": r.rule_version,
                "rule_type": r.rule_type,
                "title": r.title,
                "message": r.message,
                "severity": r.severity,
                "status": r.status,
                "condition_json": r.condition_json,
                "approved_by": r.approved_by,
                "source_id": r.source_id,
            }
            for r in rows
        ],
    }


@router.post("/rules", summary="Thêm mới quy tắc an toàn thuốc")
def create_rule(
    body: RuleCreateSchema,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.query(SafetyRule).filter(SafetyRule.code == body.code.strip()).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mã quy tắc '{body.code}' đã tồn tại")

    default_src = db.query(KnowledgeSource).first()
    src_id = default_src.id if default_src else new_id()

    rule = SafetyRule(
        id=new_id(),
        code=body.code.strip(),
        rule_version=body.rule_version,
        rule_type=body.rule_type.strip(),
        title=body.title.strip(),
        message=body.message.strip(),
        severity=body.severity.strip(),
        status=body.status.strip(),
        condition_json=body.condition_json,
        required_data_json=body.required_data_json,
        source_id=src_id,
        approved_by=body.approved_by,
        created_at=datetime.now(timezone.utc),
    )
    db.add(rule)
    audit_log(db, user, "create_safety_rule", "safety_rule", rule.id, f"code={rule.code}")
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "code": rule.code, "title": rule.title, "severity": rule.severity}


@router.put("/rules/{rule_id}", summary="Cập nhật quy tắc an toàn")
def update_rule(
    rule_id: str,
    body: RuleUpdateSchema,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    rule = db.get(SafetyRule, rule_id)
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy quy tắc an toàn")

    if body.title is not None:
        rule.title = body.title.strip()
    if body.message is not None:
        rule.message = body.message.strip()
    if body.severity is not None:
        rule.severity = body.severity.strip()
    if body.status is not None:
        rule.status = body.status.strip()
    if body.condition_json is not None:
        rule.condition_json = body.condition_json
    if body.approved_by is not None:
        rule.approved_by = body.approved_by.strip()

    audit_log(db, user, "update_safety_rule", "safety_rule", rule.id, f"Updated rule {rule.code}")
    db.commit()
    return {"id": rule.id, "code": rule.code, "title": rule.title, "severity": rule.severity, "status": rule.status}


@router.delete("/rules/{rule_id}", summary="Xóa quy tắc an toàn")
def delete_rule(
    rule_id: str,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    rule = db.get(SafetyRule, rule_id)
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy quy tắc an toàn")
    code = rule.code
    db.delete(rule)
    audit_log(db, user, "delete_safety_rule", "safety_rule", rule_id, f"Deleted rule {code}")
    db.commit()
    return {"message": f"Đã xóa quy tắc {code} thành công"}


# =====================================================================
# 4. Medication & Active Ingredient Management
# =====================================================================

@router.get("/ingredients", summary="Danh sách hoạt chất (326+ hoạt chất)")
def list_ingredients(
    q: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Ingredient)
    if q:
        kw = f"%{q.strip()}%"
        query = query.filter(or_(Ingredient.name.ilike(kw), Ingredient.atc_code.ilike(kw)))
    total = query.count()
    rows = query.order_by(Ingredient.name).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [{"id": i.id, "name": i.name, "atc_code": i.atc_code, "notes": i.notes} for i in rows],
    }


@router.post("/ingredients", summary="Thêm mới hoạt chất")
def create_ingredient(
    body: IngredientCreateSchema,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.query(Ingredient).filter(Ingredient.name.ilike(body.name.strip())).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Hoạt chất '{body.name}' đã có trong hệ thống")
    ing = Ingredient(
        id=new_id(),
        name=body.name.strip().upper(),
        atc_code=body.atc_code.strip().upper() if body.atc_code else None,
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(ing)
    audit_log(db, user, "create_ingredient", "ingredient", ing.id, f"name={ing.name}")
    db.commit()
    db.refresh(ing)
    return {"id": ing.id, "name": ing.name, "atc_code": ing.atc_code}


@router.delete("/ingredients/{ingredient_id}", summary="Xóa hoạt chất")
def delete_ingredient(
    ingredient_id: str,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    ing = db.get(Ingredient, ingredient_id)
    if not ing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt chất")
    name = ing.name
    db.delete(ing)
    audit_log(db, user, "delete_ingredient", "ingredient", ingredient_id, f"Deleted ingredient {name}")
    db.commit()
    return {"message": f"Đã xóa hoạt chất {name} thành công"}


@router.get("/drugs", summary="Danh sách biệt dược")
def list_drugs(
    q: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Drug)
    if q:
        kw = f"%{q.strip()}%"
        query = query.filter(or_(Drug.name.ilike(kw), Drug.strength.ilike(kw), Drug.form.ilike(kw)))
    total = query.count()
    rows = query.order_by(Drug.name).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "id": d.id,
                "name": d.name,
                "strength": d.strength,
                "form": d.form,
                "is_combination": d.is_combination,
                "in_scope": d.in_scope,
            }
            for d in rows
        ],
    }


@router.post("/drugs", summary="Thêm mới biệt dược")
def create_drug(
    body: DrugCreateSchema,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.query(Drug).filter(Drug.name.ilike(body.name.strip())).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Biệt dược '{body.name}' đã có trong hệ thống")
    drug = Drug(
        id=new_id(),
        name=body.name.strip(),
        strength=body.strength.strip() if body.strength else None,
        form=body.form.strip() if body.form else None,
        is_combination=body.is_combination,
        in_scope=body.in_scope,
    )
    db.add(drug)
    audit_log(db, user, "create_drug", "drug", drug.id, f"name={drug.name}")
    db.commit()
    db.refresh(drug)
    return {"id": drug.id, "name": drug.name, "strength": drug.strength}


@router.delete("/drugs/{drug_id}", summary="Xóa biệt dược")
def delete_drug(
    drug_id: str,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    drug = db.get(Drug, drug_id)
    if not drug:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy biệt dược")
    name = drug.name
    db.delete(drug)
    audit_log(db, user, "delete_drug", "drug", drug_id, f"Deleted drug {name}")
    db.commit()
    return {"message": f"Đã xóa biệt dược {name} thành công"}


# =====================================================================
# 5. AI Telemetry & Health Test
# =====================================================================

@router.post("/test-ai", summary="Kiểm tra kết nối và độ trễ của mô hình AI Gemini")
def test_ai_engine(
    body: AITestSchema,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    start_time = time.time()
    try:
        reply_text, sources = generate_answer(
            db=db,
            user_message=body.prompt,
            classification="in_scope",
            user_id=None,
        )
        latency_ms = round((time.time() - start_time) * 1000, 1)
        audit_log(db, user, "test_ai", "ai_engine", None, f"Latency: {latency_ms}ms, Provider: {settings.AI_PROVIDER}")
        db.commit()
        return {
            "status": "success",
            "latency_ms": latency_ms,
            "provider": settings.AI_PROVIDER,
            "model": settings.AI_MODEL,
            "has_api_key": bool(settings.AI_API_KEY.strip()),
            "response_text": reply_text[:500],
            "rag_citations": sources,
        }
    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000, 1)
        return {
            "status": "error",
            "latency_ms": latency_ms,
            "provider": settings.AI_PROVIDER,
            "model": settings.AI_MODEL,
            "error_detail": str(e),
        }


# =====================================================================
# 6. Audit Logs Filter & Inspection
# =====================================================================

@router.get("/audit-log", summary="Nhật ký hệ thống kiểm toán (audit log) chi tiết")
def list_audit_logs(
    q: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(AuditEvent)
    if action:
        query = query.filter(AuditEvent.action == action)
    if q:
        kw = f"%{q.strip()}%"
        query = query.filter(or_(AuditEvent.username.ilike(kw), AuditEvent.detail.ilike(kw), AuditEvent.object_type.ilike(kw)))

    total = query.count()
    rows = query.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "username": r.username,
                "action": r.action,
                "object_type": r.object_type,
                "object_id": r.object_id,
                "detail": r.detail,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rows
        ],
    }
