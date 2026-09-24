"""Danh mục thuốc và hoạt chất — dữ liệu giả lập có nguồn mô phỏng."""
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.modules.audit.models import new_id


class Ingredient(Base):
    """Hoạt chất."""

    __tablename__ = "ingredients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)  # tên hoạt chất (INN)
    atc_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Drug(Base):
    """Biệt dược — có thể là thuốc phối hợp (nhiều hoạt chất)."""

    __tablename__ = "drugs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)  # biệt dược
    strength: Mapped[str | None] = mapped_column(String(80), nullable=True)  # hàm lượng
    form: Mapped[str | None] = mapped_column(String(80), nullable=True)  # viên, siro, tiêm...
    is_combination: Mapped[bool] = mapped_column(Boolean, default=False)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("knowledge_sources.id"), nullable=True)
    in_scope: Mapped[bool] = mapped_column(Boolean, default=True)  # False = ngoài phạm vi danh mục

    ingredients: Mapped[list["DrugIngredient"]] = relationship(back_populates="drug")


class DrugIngredient(Base):
    """Liên kết thuốc — hoạt chất (hỗ trợ thuốc phối hợp)."""

    __tablename__ = "drug_ingredients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    drug_id: Mapped[str] = mapped_column(ForeignKey("drugs.id"), index=True)
    ingredient_id: Mapped[str] = mapped_column(ForeignKey("ingredients.id"), index=True)
    amount: Mapped[str | None] = mapped_column(String(80), nullable=True)  # hàm lượng hoạt chất trong thuốc

    drug: Mapped["Drug"] = relationship(back_populates="ingredients")
    ingredient: Mapped["Ingredient"] = relationship()
