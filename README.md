# AllerCare AI — MVP demo (dữ liệu giả lập)

Hệ thống theo dõi từ xa và kiểm tra an toàn thuốc cho Da liễu – Dị ứng miễn dịch.

- **Người bệnh**: khai báo thuốc/triệu chứng, **Phân luồng AI** (xanh/vàng/đỏ), nhận **hướng dẫn dùng thuốc** do AI soạn + bác sĩ duyệt (xác nhận "Tôi đã hiểu"), trò chuyện với Trợ lý AI (học từ kho kiến thức chia liều của bác sĩ), lịch hẹn + video call.
- **Bác sĩ**: danh sách ca được phân công, kiểm tra an toàn thuốc (MedSafe), **xếp hạng tác nhân nghi ngờ** theo WHO (toa cũ + mới), soạn/duyệt hướng dẫn thuốc, ghi nhận quyết định.
- **Điều dưỡng**: hàng đợi phân luồng mức vàng cần kiểm tra + xác nhận.
- **Dược sĩ**: duyệt quy tắc an toàn, xem hướng dẫn thuốc của hồ sơ.
- **Lãnh đạo khoa**: Quality Dashboard — chỉ số tổng hợp ẩn danh (phân luồng, cảnh báo, thời gian phản hồi).
- **Quản trị viên**: quản lý tài khoản (khóa/mở) + nhật ký hệ thống — không truy cập hồ sơ lâm sàng.
- **PWA hoàn chỉnh**: cài lên màn hình chính điện thoại/máy tính, app shortcuts, trang offline an toàn (không cache dữ liệu y tế).

> **Quan trọng:** đây là bản MVP demo chạy trên dữ liệu giả lập + 11 ca lâm sàng mẫu (khoa Da liễu). Không dùng cho chăm sóc thực tế.
> Không bao giờ hiển thị "an toàn" khi thiếu dữ liệu, lỗi, hoặc ngoài phạm vi kiểm tra.
> AI chỉ GỢI Ý (xếp hạng nghi ngờ, phân luồng, soạn hướng dẫn) — bác sĩ/điều dưỡng xác nhận trước khi ghi hồ sơ.

## Dữ liệu tách riêng trong thư mục `data/`

Toàn bộ dữ liệu của dự án nằm ở `data/` (catalog thuốc, quy tắc an toàn, ca demo, kho kiến thức AI) —
đổi dữ liệu thật chỉ cần thay file trong đó rồi chạy lại seed, không sửa code.

**Backend AI ảo** (`AI_PROVIDER=mock`): AI chỉ được đọc `data/ai_knowledge/` để học nguyên tắc
chia liều của bác sĩ + ví dụ liều + yếu tố bệnh nhân, rồi tham chiếu gợi ý liều theo hồ sơ từng
người bệnh (luôn kèm nguồn + disclaimer, thiếu dữ liệu thì không đoán). Chi tiết: `data/README.md`.

## Chạy nhanh (khuyến nghị)

```bash
# Toàn bộ stack trong Docker (postgres + api + web)
docker compose -f infra/docker-compose.yml up -d
# Web: http://localhost:3000  |  API: http://localhost:8000/docs
```

Hoặc frontend chạy local:

```bash
docker compose -f infra/docker-compose.yml up -d postgres api
cd apps/web && npm install && npm run dev   # Web: http://localhost:3000
```

## Chạy backend local (không Docker)

```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
python -m app.seed_data
uvicorn app.main:app --reload --port 8000
```

## Chạy bản production (multi-stage image)

```bash
# 1) Tạo cấu hình: cp infra/.env.prod.example infra/.env.prod rồi điền AUTH_SECRET ngẫu nhiên dài
nano infra/.env.prod

# 2) Build + chạy (đổi port qua API_PORT/WEB_PORT nếu 8000/3000 bận)
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml -p allercare-prod up -d --build
```

- Image tối ưu: API ~356MB (venv slim, user không phải root, healthcheck), Web ~265MB (Next.js standalone).
- `SEED_ON_START=1` chỉ dùng cho demo đầu tiên — seed **xóa dữ liệu cũ**.
- Production thật: không expose 5432, đặt `POSTGRES_PASSWORD` mạnh, và đi sau HTTPS reverse proxy.

## Chạy test

```bash
cd services/api
source .venv/bin/activate
pytest                 # 67 test pass (gồm test AI ảo + dosage advisor)
```

## Walkthrough đóng vai người dùng

```bash
./scripts/walkthrough_patient.sh   # 10 bước người bệnh
./scripts/walkthrough_doctor.sh    # 10 bước bác sĩ + test bảo mật
```

## Hỏi đáp AI (chat với Trợ lý AI — không phải bác sĩ/dược sĩ)

- Mục **Hỏi đáp AI** trong app người bệnh là chỗ trò chuyện tự nhiên với **Trợ lý AI AllerCare** —
  không phải nhắn tin với bác sĩ hay dược sĩ. Các quyết định chuyên môn vẫn thuộc về bác sĩ phụ trách
  (qua mục Lịch hẹn/video call).
- AI trả lời theo persona "Trợ lý AI AllerCare" — không đóng vai bác sĩ/dược sĩ.
- Hỏi về liều (VD: "Uống Glucophage 850mg bao nhiêu viên một ngày?") → AI tham chiếu cách bác sĩ chia liều trong `data/ai_knowledge/dosing_examples.json`, cá thể hóa theo hồ sơ của chính bạn (tuổi, CrCl, dị ứng).
- Thiếu dữ liệu (VD: chưa có CrCl) → AI báo "chưa đủ dữ liệu", không đoán liều.
- Vẫn giữ đầy đủ guardrails: khẩn cấp → 115, từ chối tự đổi thuốc/liều, chuyển nhân viên y tế.
- Hỏi đáp có **nhiều hội thoại**: nút "Hội thoại mới" + "Hội thoại cũ" (lưu trên backend, chỉ mình bạn xem được).
- `GET /api/v1/chat/sessions` — danh sách hội thoại; `GET /api/v1/chat/messages?session_id=...` — lịch sử.
- `GET /api/v1/chat/knowledge-info` — xem minh bạch AI học từ đâu.

## Tài khoản demo (dữ liệu giả lập)

| Vai trò | Tên đăng nhập | Mật khẩu |
| --- | --- | --- |
| Người bệnh | `patient1` | `patient123` |
| Bác sĩ | `doctor1` | `doctor123` |

Danh sách đầy đủ trong `services/api/app/seed_data.py`.

## Truy cập từ điện thoại trong mạng LAN (HTTPS/PWA)

```bash
./scripts/lan_https.sh dev    # bật Caddy HTTPS, tự phát hiện IP LAN
# Trên điện thoại (cùng Wi-Fi): tải CA tại http://<IP>:8080/ca.crt, cài tin cậy,
# rồi mở https://<IP> — chi tiết trong USER_GUIDE.md mục 12.
```

## Tài liệu kế hoạch

- `docs/ROADMAP-10-PHASES.md` — kế hoạch 10 phase và design system trắng + xanh nước biển.
- `USER_GUIDE.md` — hướng dẫn sử dụng chi tiết (mục 10: cài PWA lên điện thoại).
- `scripts/gen_pwa_icons.py` — sinh lại bộ icon PWA (`python3 scripts/gen_pwa_icons.py`).

## Giới hạn & an toàn

- Phân quyền kiểm tra ở backend trên từng hồ sơ, không chỉ ẩn nút UI.
- AI không quyết định cảnh báo; rule engine + quy tắc có nguồn mới là căn cứ.
- Không commit bí mật, dữ liệu bệnh viện, hay hồ sơ người bệnh thật.
