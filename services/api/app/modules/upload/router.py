"""Upload & Static Media Router for AllerCare AI.
Hỗ trợ upload ảnh tổn thương da, ảnh toa thuốc, bao bì dược phẩm từ thiết bị (web & mobile).
"""
import mimetypes
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.modules.auth.deps import CurrentUser, get_current_user

router = APIRouter(tags=["upload"])

# Thư mục lưu trữ file upload
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "uploads")).resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Giới hạn dung lượng tối đa: 15MB
MAX_FILE_SIZE = 15 * 1024 * 1024

ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".heic",
    ".heif",
    ".bmp",
    ".svg",
}


def sanitize_filename(filename: str) -> str:
    """Loại bỏ ký tự đặc biệt, giữ lại tên an toàn."""
    name, ext = os.path.splitext(filename)
    safe_name = re.sub(r"[^\w\-_]", "_", name)
    safe_ext = ext.lower()
    return f"{safe_name[:40]}{safe_ext}"


@router.post("/upload", summary="Tải ảnh lên từ thiết bị (tổn thương da, toa thuốc, v.v.)")
async def upload_file(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên file không hợp lệ.",
        )

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS and not (
        file.content_type and file.content_type.startswith("image/")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ hỗ trợ tải lên file hình ảnh (JPG, PNG, WEBP, GIF, HEIC).",
        )

    # Đọc nội dung và kiểm tra kích thước
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dung lượng ảnh vượt quá giới hạn tối đa (15MB).",
        )

    # Tạo tên file độc nhất an toàn
    safe_suffix = sanitize_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex[:12]}_{safe_suffix}"
    dest_path = UPLOAD_DIR / unique_name

    # Lưu file
    dest_path.write_bytes(content)

    relative_url = f"/api/v1/uploads/{unique_name}"

    return {
        "url": relative_url,
        "filename": unique_name,
        "original_name": file.filename,
        "size": len(content),
        "content_type": file.content_type or mimetypes.guess_type(file.filename)[0],
    }


@router.get("/uploads/{filename}", summary="Xem / tải ảnh đã upload")
async def get_uploaded_file(filename: str):
    # Chống Path Traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên file không hợp lệ.")

    file_path = UPLOAD_DIR / filename
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ảnh.")

    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(
        path=str(file_path),
        media_type=media_type or "application/octet-stream",
    )
