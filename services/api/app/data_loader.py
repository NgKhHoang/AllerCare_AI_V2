"""Nạp dữ liệu dự án từ thư mục `data/` ở gốc repo.

Toàn bộ dữ liệu (catalog, quy tắc an toàn, ca demo) được tách khỏi mã nguồn
để sau này nhập dữ liệu thật mà không cần sửa code. Đường dẫn có thể ghi đè
bằng biến môi trường DATA_DIR.
"""
import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

# Marker file bắt buộc phải có trong data/ — dùng để dò đúng thư mục
_MARKER = Path("catalog") / "ingredients.json"


def data_dir() -> Path:
    """Thư mục data/ hiện hành (ghi đè bằng DATA_DIR).

    Dò theo thứ tự: DATA_DIR env → các thư mục cha của file này (chạy local
    từ source tree) → cwd/data (container) → /srv/data (container).
    """
    override = os.environ.get("DATA_DIR")
    if override:
        return Path(override)
    candidates: list[Path] = []
    # Chạy local: services/api/app/data_loader.py → dò lên các thư mục cha
    try:
        for parent in Path(__file__).resolve().parents:
            candidates.append(parent / "data")
    except Exception:  # noqa: BLE001 — dò đường dẫn không được phép làm sập app
        pass
    # Container / cwd khác
    candidates += [Path.cwd() / "data", Path("/srv/data"), Path.cwd().parent / "data"]
    for c in candidates:
        if (c / _MARKER).is_file():
            return c
    return Path.cwd() / "data"


def _read_json(rel_path: str) -> Any:
    path = data_dir() / rel_path
    if not path.is_file():
        raise FileNotFoundError(f"Thiếu file dữ liệu: {path}")
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _read_text(rel_path: str) -> str:
    path = data_dir() / rel_path
    if not path.is_file():
        raise FileNotFoundError(f"Thiếu file dữ liệu: {path}")
    return path.read_text(encoding="utf-8")


# ----------------------------- Catalog -----------------------------

@lru_cache
def load_ingredients() -> list[dict]:
    return _read_json("catalog/ingredients.json")


@lru_cache
def load_drugs() -> list[dict]:
    return _read_json("catalog/drugs.json")


# ----------------------------- Safety -----------------------------

@lru_cache
def load_knowledge_sources() -> list[dict]:
    raw = _read_json("safety/knowledge_sources.json")
    # Hỗ trợ cả cấu trúc list cũ và {"sources": [...]} mới (có _readme)
    if isinstance(raw, list):
        return raw
    return raw.get("sources", [])


@lru_cache
def load_safety_rules() -> list[dict]:
    raw = _read_json("safety/safety_rules.json")
    # Hỗ trợ cả cấu trúc list cũ và {"rules": [...]} mới (có _readme)
    if isinstance(raw, list):
        return raw
    return raw.get("rules", [])


# ----------------------------- Demo -----------------------------

@lru_cache
def load_demo_accounts() -> list[dict]:
    return _read_json("demo/accounts.json")


@lru_cache
def load_demo_cases() -> list[dict]:
    return _read_json("demo/cases.json")


# ----------------------------- AI knowledge (duy nhất AI được đọc) -----------------------------

AI_KNOWLEDGE_FILES = (
    "ai_knowledge/dosing_principles.md",
    "ai_knowledge/dosing_examples.json",
    "ai_knowledge/patient_factors.md",
    "ai_knowledge/conversation_style.md",
)


@lru_cache
def load_ai_knowledge_bundle() -> dict[str, Any]:
    """Nạp toàn bộ kho kiến thức AI (chỉ từ ai_knowledge/).

    Cache theo thời gian ngắn: dùng lru_cache thủ công qua wrapper bên dưới
    nếu cần làm mới trong quá trình chạy dài. Hiện tại nạp 1 lần mỗi tiến trình
    đủ cho demo; file lớn (dữ liệu thật) nên nạp lại qua restart hoặc gọi
    `reload_ai_knowledge()`.
    """
    return {
        "dosing_principles_md": _read_text("ai_knowledge/dosing_principles.md"),
        "dosing_examples": _read_json("ai_knowledge/dosing_examples.json"),
        "patient_factors_md": _read_text("ai_knowledge/patient_factors.md"),
        "conversation_style_md": _read_text("ai_knowledge/conversation_style.md"),
    }


def reload_ai_knowledge() -> dict[str, Any]:
    """Làm mới kho kiến thức AI (gọi khi file dữ liệu thay đổi)."""
    load_ai_knowledge_bundle.cache_clear()
    return load_ai_knowledge_bundle()


def ai_knowledge_files_info() -> list[dict]:
    """Danh sách file trong kho kiến thức AI + kích thước — để hiển thị minh bạch."""
    info = []
    for rel in AI_KNOWLEDGE_FILES:
        path = data_dir() / rel
        info.append({
            "file": rel,
            "exists": path.is_file(),
            "bytes": path.stat().st_size if path.is_file() else 0,
        })
    return info
