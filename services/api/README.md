# AllerCare AI — Backend API (MVP demo, chỉ dùng dữ liệu giả lập)

## Chạy local (không Docker)

```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # chỉnh nếu cần
alembic upgrade head
python -m app.seed_data          # seed 10 ca + 50 thuốc + 20 quy tắc giả lập
uvicorn app.main:app --reload --port 8000
```

- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/healthz
- Yêu cầu PostgreSQL đang chạy (xem `infra/docker-compose.yml`).

## Chạy bằng Docker Compose

```bash
docker compose -f infra/docker-compose.yml up --build
```

## Chạy test

```bash
cd services/api
source .venv/bin/activate
pytest
```

## Cấu trúc module

- `app/modules/auth/` — đăng nhập, JWT, phân quyền
- `app/modules/patients/` — hồ sơ, diễn biến, thuốc của người bệnh
- `app/modules/medications/` — danh mục thuốc, chuẩn hóa hoạt chất
- `app/modules/safety/` — MedSafe rule engine, cảnh báo, đánh giá bác sĩ
- `app/modules/ai/` — adapter AI, chatbot giới hạn
- `app/modules/consultations/` — lịch hẹn, phòng video
- `app/modules/audit/` — nhật ký AuditEvent

## Giới hạn

- Demo dùng **dữ liệu giả lập** (`data/synthetic/`), không chứa hồ sơ thật.
- Không bao giờ hiển thị "an toàn" khi thiếu dữ liệu, lỗi, hoặc ngoài phạm vi kiểm tra.
- AI không quyết định cảnh báo; rule engine + quy tắc được duyệt mới là căn cứ.
