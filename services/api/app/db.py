"""SQLAlchemy engine, session, và Base cho toàn bộ module.

Chỉ backend sở hữu truy cập database; frontend không kết nối trực tiếp.
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _sqlalchemy_database_url(database_url: str) -> str:
    """Make standard PostgreSQL URLs use the bundled psycopg driver.

    Managed providers, including Render, supply ``postgresql://`` URLs while
    this application installs psycopg (not psycopg2). SQLAlchemy needs the
    explicit driver name in that case.
    """
    if database_url.startswith("postgresql://"):
        return "postgresql+psycopg://" + database_url.removeprefix("postgresql://")
    if database_url.startswith("postgres://"):
        return "postgresql+psycopg://" + database_url.removeprefix("postgres://")
    return database_url


_settings = get_settings()

engine = create_engine(
    _sqlalchemy_database_url(_settings.DATABASE_URL),
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: 1 session cho mỗi request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
