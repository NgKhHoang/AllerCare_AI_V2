"""SQLAlchemy engine, session, và Base cho toàn bộ module.

Chỉ backend sở hữu truy cập database; frontend không kết nối trực tiếp.
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()

engine = create_engine(_settings.DATABASE_URL, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: 1 session cho mỗi request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
