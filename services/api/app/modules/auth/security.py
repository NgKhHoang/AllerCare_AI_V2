"""Băm mật khẩu (bcrypt trực tiếp) và tạo/kiểm tra JWT (pyjwt)."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import get_settings


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")[:72]  # bcrypt giới hạn 72 bytes
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pw = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(pw, hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str, username: str, role: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id, "username": username, "role": role,
        "exp": expire, "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, get_settings().AUTH_SECRET, algorithm=get_settings().AUTH_ALGORITHM)


def decode_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.AUTH_SECRET, algorithms=[settings.AUTH_ALGORITHM])
    except jwt.PyJWTError:
        return None
