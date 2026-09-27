#!/bin/sh
# Entrypoint production cho API AllerCare.
# - Luôn chạy migration (an toàn — chỉ cập nhật schema, không xóa dữ liệu).
# - Chỉ seed khi SEED_ON_START=1 (seed XÓA dữ liệu cũ — KHÔNG bật trên hệ thống có dữ liệu thật).
set -e

echo "[entrypoint] alembic upgrade head..."
alembic upgrade head

if [ "${SEED_ON_START:-0}" = "1" ] || [ "${DEMO_MODE:-0}" = "1" ]; then
  echo "[entrypoint] Seed dữ liệu demo..."
  python -m app.seed_data || echo "[entrypoint] Seed gặp lỗi hoặc dữ liệu đã tồn tại"
else
  echo "[entrypoint] Bỏ qua seed — giữ nguyên dữ liệu hiện có"
fi

echo "[entrypoint] khởi động uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
