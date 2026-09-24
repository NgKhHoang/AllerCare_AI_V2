#!/bin/bash
# AllerCare AI — script chạy local (không Docker) cho backend + frontend.
# Cách dùng: chmod +x scripts/dev.sh && ./scripts/dev.sh
set -e

cd "$(dirname "$0")/.."

echo "== [1/3] Backend API =="
cd services/api
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -e ".[dev]"
cp -n .env.example .env 2>/dev/null || true
alembic upgrade head
python -m app.seed_data
nohup uvicorn app.main:app --reload --port 8000 >/tmp/allercare-api.log 2>&1 &
echo "API: http://localhost:8000 (log: /tmp/allercare-api.log)"

echo "== [2/3] Frontend =="
cd ../../apps/web
npm install
nohup npm run dev >/tmp/allercare-web.log 2>&1 &
echo "Web: http://localhost:3000 (log: /tmp/allercare-web.log)"

echo "== [3/3] Health check =="
sleep 3
curl -s http://localhost:8000/healthz || echo "API chưa sẵn sàng, xem log /tmp/allercare-api.log"
echo ""
echo "Hoàn tất. Đăng nhập demo: patient1/patient123 hoặc doctor1/doctor123"
