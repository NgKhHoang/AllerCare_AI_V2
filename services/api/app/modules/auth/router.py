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
