"""Test upload endpoint cho ảnh tổn thương da và toa thuốc."""
import io
from fastapi.testclient import TestClient
from tests.conftest import auth_header, login


def test_upload_image_flow(client: TestClient):
    p1 = login(client, "patient1", "patient123")

    # Giả lập file ảnh JPEG
    file_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xFF\xDB\x00C\x00"
    files = {"file": ("ton-thuong-da.jpg", io.BytesIO(file_bytes), "image/jpeg")}

    r = client.post("/api/v1/upload", files=files, headers=auth_header(p1))
    assert r.status_code == 200, r.text
    data = r.json()
    assert "url" in data
    assert "filename" in data
    assert data["url"].startswith("/api/v1/uploads/")

    # Kiểm tra xem ảnh tải lên qua GET /api/v1/uploads/{filename}
    img_resp = client.get(data["url"])
    assert img_resp.status_code == 200
    assert len(img_resp.content) == len(file_bytes)


def test_upload_invalid_file_type(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    files = {"file": ("malicious.exe", io.BytesIO(b"MZ..."), "application/x-msdownload")}
    r = client.post("/api/v1/upload", files=files, headers=auth_header(p1))
    assert r.status_code == 400
