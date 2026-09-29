#!/bin/sh
# Entrypoint production cho API AllerCare.
# - Luôn chạy migration (an toàn — chỉ cập nhật schema, không xóa dữ liệu).
# - Seed an toàn (chỉ bổ sung dữ liệu demo còn thiếu, KHÔNG BAO GIỜ xóa tài khoản mới tạo).
set -e

echo "[entrypoint] alembic upgrade head..."
alembic upgrade head

if [ "${SEED_ON_START:-0}" = "1" ] || [ "${DEMO_MODE:-0}" = "1" ]; then
  echo "[entrypoint] Bổ sung dữ liệu nền tảng còn thiếu (an toàn)..."
  python -m app.seed_data || echo "[entrypoint] Bỏ qua seed"
else
  echo "[entrypoint] Bỏ qua seed — giữ nguyên dữ liệu hiện có"
fi

echo "[entrypoint] khởi động uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
