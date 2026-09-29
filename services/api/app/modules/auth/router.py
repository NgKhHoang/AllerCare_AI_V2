"""API xác thực: đăng nhập, lấy thông tin user hiện tại."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.auth.deps import CurrentUser, audit_log, get_current_user
from app.modules.auth.security import create_access_token, verify_password
from app.modules.patients.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", summary="Đăng nhập, nhận JWT")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.username == form.username).first()
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai tên đăng nhập hoặc mật khẩu")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản đã bị khóa")
    token = create_access_token(user.id, user.username, user.role)
    audit_log(db, None, "login", "user", user.id, f"role={user.role}")
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "username": user.username, "full_name": user.full_name, "role": user.role},
    }


@router.get("/me", summary="Thông tin tài khoản hiện tại")
def me(user: CurrentUser = Depends(get_current_user)) -> dict:
    return {"id": user.id, "username": user.username, "role": user.role}


@router.get("/demo-users", summary="Danh sách tài khoản demo đăng nhập nhanh")
def list_demo_users(db: Session = Depends(get_db)) -> list[dict]:
    usernames = ["patient1", "case02", "doctor1", "nurse1", "pharmacist1", "leader1", "family1", "admin1"]
    users = db.query(User).filter(User.username.in_(usernames)).all()
    user_map = {u.username: u for u in users}

    icon_map = {
        "patient": "👤",
        "doctor": "🩺",
        "nurse": "🚦",
        "pharmacist": "💊",
        "leader": "📊",
        "caregiver": "🏡",
        "admin": "🛠️",
    }
    role_desc_map = {
        "patient": "Người bệnh",
        "doctor": "Bác sĩ",
        "nurse": "Điều dưỡng",
        "pharmacist": "Dược sĩ",
        "leader": "Quality Dashboard",
        "caregiver": "Ủy quyền",
        "admin": "Hệ thống",
    }

    passwords = {
        "patient1": "patient123",
        "case02": "patient123",
        "doctor1": "doctor123",
        "nurse1": "nurse123",
        "pharmacist1": "pharma123",
        "leader1": "leader123",
        "family1": "family123",
        "admin1": "admin123",
    }

    out = []
    for uname in usernames:
        u = user_map.get(uname)
        if u:
            label = u.full_name
            if uname == "patient1":
                label = f"{u.full_name} ({u.username})"
            elif u.role == "doctor" and not label.startswith("BS."):
                label = f"BS. {label}"
            elif u.role == "nurse" and not label.startswith("ĐD."):
                label = f"ĐD. {label}"
            elif u.role == "pharmacist" and not label.startswith("DS."):
                label = f"DS. {label}"

            icon = icon_map.get(u.role, "👤")
            if uname == "case02": icon = "⚠️"
            if uname == "family1": icon = "🏡"

            out.append({
                "label": label,
                "username": u.username,
                "password": passwords.get(uname, "password123"),
                "icon": icon,
                "role": role_desc_map.get(u.role, u.role),
            })
    return out

