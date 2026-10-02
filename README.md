# 🛡️ AllerCare AI — Hệ Thống Giám Sát An Toàn Thuốc & Trợ Lý Gemini AI Cá Thể Hóa

> **Hệ thống theo dõi từ xa, phân luồng cấp cứu và kiểm tra an toàn sử dụng thuốc chuyên khoa Da liễu – Dị ứng Miễn dịch lâm sàng.**

[![Next.js 14](https://img.shields.io/badge/Next.js-14.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![.NET Aspire 9.0](https://img.shields.io/badge/.NET_Aspire-9.0-512BD4?style=flat-square&logo=dotnet)](https://learn.microsoft.com/dotnet/aspire/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![LiveKit WebRTC](https://img.shields.io/badge/LiveKit-WebRTC_Video-FF4B4B?style=flat-square)](https://livekit.io/)
[![Tests Passed](https://img.shields.io/badge/Tests-93%2F93_Passed-22c55e?style=flat-square)](https://pytest.org/)

---

## 📌 Mục Lục
1. [Giới Thiệu & Tầm Nhìn](#-giới-thiệu--tầm-nhìn)
2. [5 Khối Chức Năng Cốt Lõi (Chuẩn 10.3)](#-5-khối-chức-năng-cốt-lõi-chuẩn-103)
3. [Kiến Trúc Kỹ Thuật (Architecture)](#-kiến-trúc-kỹ-thuật-architecture)
4. [Cấu Trúc Thư Mục Dự Án](#-cấu-trúc-thư-mục-dự-án)
5. [Hướng Dẫn Cài Đặt & Khởi Chạy](#-hướng-dẫn-cài-đặt--khởi-chạy)
6. [Tài Khoản Thử Nghiệm (Demo Accounts)](#-tài-khoản-thử-nghiệm-demo-accounts)
7. [Tài Liệu API Endpoints Chính](#-tài-liệu-api-endpoints-chính)
8. [Kiểm Thử & Đảm Bảo Chất Lượng](#-kiểm-thử--đảm-bảo-chất-lượng)
9. [Quy Chuẩn An Toàn Y Tế & Giới Hạn Trách Nhiệm](#-quy-chuẩn-an-toàn-y-tế--giới-hạn-trách-nhiệm)

---

## 📖 Giới Thiệu & Tầm Nhìn

**AllerCare AI** là nền tảng số hóa quản lý điều trị ngoại trú và giám sát an toàn sử dụng thuốc chuyên sâu cho bệnh nhân mắc các bệnh lý Da liễu, Dị ứng và Miễn dịch lâm sàng (như Dị ứng thuốc, Mày đay cấp/mạn, Viêm da cơ địa, Hội chứng Stevens-Johnson/TEN, Vảy nến...).

Hệ thống kết hợp mô hình **Hybrid AI** (Rule-Based MedSafe Engine + RAG Knowledge Base + Gemini LLM) cùng cơ chế **Human-in-the-loop** (Bác sĩ/Dược sĩ luôn là người phê duyệt quyết định chuyên môn cuối cùng), giúp:
- Tối ưu hóa tuân thủ phác đồ điều trị của người bệnh.
- Ngăn ngừa tương tác thuốc nguy hiểm, chống chỉ định và phản ứng có hại của thuốc (ADR).
- Phân luồng triệu chứng khẩn cấp, kết nối đường dây cấp cứu tức thì.

---

## 🌟 5 Khối Chức Năng Cốt Lõi (Chuẩn 10.3)

### 1. 🚦 Cổng Bệnh Nhân & Người Nhà (Patient Portal)
- **Báo Thức Nhắc Thuốc Chuẩn Giờ & Web Audio Chime**: Bộ nhắc nhở uống thuốc buổi sáng với chuông âm thanh y tế êm dịu, hỗ trợ hẹn giờ nhắc, nút báo lại (Snooze 10 phút) và tích hợp Web Notifications.
- **Check-in 1 Chạm**: Nhanh chóng xác nhận đã uống thuốc, chọn nhanh tình trạng da/cảm giác lâm sàng qua Quick-Chips (🟢 Ổn định, 🟡 Ngứa nhẹ, 🔴 Ngứa nhiều, ⚠️ Phù nề/Mụn nước, ❄️ Khô tróc vảy, 🤢 Tác dụng phụ) và gửi ghi chú trực tiếp cho Bác sĩ.
- **Phân Luồng TriageGuard AI (3 Mức Xanh / Vàng / Đỏ)**:
  - 🟢 **Xanh (Green)**: Triệu chứng ổn định, tiếp tục theo dõi phác đồ hiện tại.
  - 🟡 **Vàng (Yellow)**: Triệu chứng bất thường mức độ nhẹ/vừa — tự động đẩy vào hàng đợi Điều dưỡng/Bác sĩ kiểm tra trong 24h.
  - 🔴 **Đỏ (Red — Cấp cứu)**: Phát hiện dấu hiệu phản vệ (khó thở, tức ngực, sưng phù môi/lưỡi/thanh quản) — kích hoạt Banner khẩn cấp, hiển thị nút **GỌI 115** và **HOTLINE CẤP CỨU +84 98 1224426**.
- **Khai Báo Thuốc Đa Nguồn & Lịch Sử Điều Trị**: Khai báo thuốc bệnh viện, thuốc mua ngoài, thực phẩm chức năng và thuốc dân gian; tải ảnh chụp đơn/vỏ thuốc và ảnh tổn thương da.
- **Hướng Dẫn Dùng Thuốc Tinh Gọn**: Hướng dẫn dùng thuốc do AI soạn thảo và Bác sĩ phê duyệt, yêu cầu người bệnh xác nhận *"Tôi đã hiểu"* hoặc gửi yêu cầu giải thích lại.

### 2. 🩺 Cổng Bác Sĩ Điều Trị (Doctor Portal)
- **Hồ Sơ Lâm Sàng & Theo Dõi 4 Chỉ Số Sinh Hiệu**:
  - Cân nặng (kg), Nhịp tim / Mạch (bpm), Huyết áp (mmHg), $\text{SpO}_2$ (Oxy máu %).
  - Nhập, chỉnh sửa và theo dõi diễn tiến chỉ số sinh hiệu trực quan.
- **Cây Timeline Quá Trình Điều Trị & Tiền Sử Dị Ứng**:
  - Trực quan hóa toàn bộ lịch sử thăm khám, các đợt phát bệnh, nhóm bệnh chẩn đoán (Viêm da tiếp xúc, Dị ứng thuốc, Chàm thể tạng...) và tiền sử phản vệ.
  - Hỗ trợ thêm chẩn đoán bệnh mới, cập nhật trạng thái (Đang điều trị / Thuyên giảm / Đã khỏi).
- **Kê Đơn Thuốc Thông Minh & Kiểm Tra Tương Tác MedSafe**:
  - Kê đơn với gợi ý thuốc tự động (Auto-complete) kèm liều lượng, tần suất, đường dùng và thời điểm dùng chuẩn.
  - Tích hợp **MedSafe Checker**: Tự động rà soát tương tác chéo giữa thuốc mới và toàn bộ thuốc đang dùng + tiền sử dị ứng đã ghi nhận.

### 3. 🤖 Trợ Lý Gemini AI & Tư Vấn Trực Tuyến
- **Trợ Lý AI AllerCare (RAG Knowledge Engine)**:
  - Học từ kho kiến thức quy tắc chia liều và ví dụ liều dùng của bác sĩ (`data/ai_knowledge/`).
  - Trả lời thắc mắc y khoa của bệnh nhân dựa trên hồ sơ thực tế (tuổi, chức năng gan thận CrCl, tiền sử dị ứng).
  - Tích hợp đầy đủ Guardrails: Không tự ý đổi liều, từ chối đoán liều khi thiếu dữ liệu xét nghiệm, chuyển tiếp khẩn cấp khi có dấu hiệu nguy hiểm.
- **Tư Vấn Video Call HD 1-1 (LiveKit WebRTC)**:
  - Khám và tư vấn từ xa trực tiếp giữa Bác sĩ và Bệnh nhân với hình ảnh/âm thanh độ trễ thấp, bật/tắt camera/mic, chia sẻ màn hình và chế độ toàn màn hình.

### 4. 🔍 AI Suspect Agent (Thuật Toán WHO-UMC / Naranjo)
- Đánh giá và xếp hạng mức độ nghi ngờ của các loại thuốc người bệnh đã và đang sử dụng khi xuất hiện biến cố có hại (ADR).
- Phân tích mối liên hệ thời gian dùng thuốc, cơ chế dược lý, triệu chứng khởi phát và tiền sử dùng thuốc tương tự để đề xuất thứ tự ưu tiên nghi ngờ cho Bác sĩ.

### 5. 🚨 Quy Trình Cấp Cứu 24/7 & Hotline Khẩn Cấp
- Tích hợp số điện thoại Cấp cứu Y tế Quốc gia **115** và **Đường dây nóng cấp cứu AllerCare: `+84 98 1224426`** trên toàn bộ giao diện Người bệnh (`EmergencyBanner`, Trang chủ, Phân luồng Triage, Chat AI, Hướng dẫn thuốc).

---

## 🏗️ Kiến Trúc Kỹ Thuật (Architecture)

```
                       ┌─────────────────────────────────────────┐
                       │       .NET 9.0 Aspire AppHost           │
                       │    (Service Orchestration & Dashboard)   │
                       └────────────────────┬────────────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    │                                               │
                    ▼                                               ▼
     ┌─────────────────────────────┐                 ┌─────────────────────────────┐
     │      apps/web (Next.js 14)  │                 │    services/api (FastAPI)   │
     │  - App Router & Server Comp │ ──[ REST/JSON ]─▶  - Python 3.12+             │
     │  - Vanilla CSS Design System│ ◀───[ JWT Auth ]──  - SQLAlchemy 2.0 Async/Sync │
     │  - LiveKit WebRTC Video SDK │                 │  - Pydantic v2 Schemas      │
     │  - PWA Offline Support      │                 │  - MedSafe Rule Engine      │
     └─────────────────────────────┘                 │  - Gemini AI & RAG Pipeline │
                                                     └──────────────┬──────────────┘
                                                                    │
                                                     ┌──────────────┴──────────────┐
                                                     ▼                             ▼
                                      ┌─────────────────────────────┐ ┌───────────────────────────┐
                                      │    PostgreSQL 16 Database   │ │  LiveKit WebRTC Server    │
                                      │ (Users, Profiles, Rx, Vitals│ │ (Realtime HD Video Calls) │
                                      │  Timeline, Audit Logs, etc.)│ └───────────────────────────┘
                                      └─────────────────────────────┘
```

---

## 📂 Cấu Trúc Thư Mục Dự Án

```
AllerCare_AI_V2/
├── apps/
│   └── web/                         # Frontend Next.js 14 (React, TypeScript)
│       ├── app/
│       │   ├── admin/               # Cổng Quản trị viên
│       │   ├── doctor/              # Cổng Bác sĩ & AI Suspect Agent
│       │   ├── nurse/               # Cổng Điều dưỡng (Duyệt phân luồng vàng)
│       │   ├── patient/             # Cổng Bệnh nhân (Chat AI, Triage, Updates, Guides)
│       │   ├── pharmacist/          # Cổng Dược sĩ
│       │   ├── leader/              # Cổng Lãnh đạo (Quality Dashboard)
│       │   └── video/               # Phòng khám Video Call WebRTC
│       ├── components/              # UI Component Library & TreatmentTimeline
│       ├── lib/                     # API Client, Token Storage, Types
│       └── public/                  # Static Assets, PWA Manifest, Icons
├── services/
│   └── api/                         # Backend FastAPI
│       ├── app/
│       │   ├── modules/             # Các module tính năng (auth, triage, safety, ai, etc.)
│       │   ├── models.py            # SQLAlchemy ORM Models
│       │   ├── schemas.py           # Pydantic Schemas
│       │   ├── seed_data.py         # Bộ dữ liệu mẫu khởi tạo chuẩn y khoa
│       │   └── main.py              # FastAPI Application Entrypoint
│       └── tests/                   # 93 Unit & Integration Tests (Pytest)
├── src/
│   └── AppHost/                     # .NET 9.0 Aspire Orchestration Project
├── data/                            # Kho dữ liệu y khoa tách biệt (Rules, Dosing RAG, Meds)
├── docs/                            # Tài liệu phân tích yêu cầu & lộ trình phát triển
├── infra/                           # Dockerfiles, docker-compose & Caddy HTTPS Configs
└── scripts/                         # Walkthrough scripts & utility tools
```

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### Cách 1: Khởi chạy bằng .NET Aspire (Khuyến nghị cho phát triển)

Yêu cầu: Đã cài đặt [.NET 9.0 SDK](https://dotnet.microsoft.com/download) và Docker Desktop.

```bash
# Di chuyển vào thư mục AppHost và khởi chạy
cd src/AppHost
dotnet run
```
> Trình duyệt sẽ mở **Aspire Dashboard** hiển thị trạng thái và logs thời gian thực của cả Database, API Backend và Web Frontend.

---

### Cách 2: Khởi chạy toàn bộ bằng Docker Compose

Yêu cầu: Đã cài đặt [Docker](https://www.docker.com/) & Docker Compose.

```bash
# Khởi chạy Postgres + API + Web Frontend
docker compose -f infra/docker-compose.yml up -d --build

# Truy cập ứng dụng:
# - Web Application: http://localhost:3000
# - API Swagger Docs: http://localhost:8000/docs
# - LiveKit Server:   http://localhost:7880
```

---

### Cách 3: Khởi chạy thủ công từng dịch vụ (Local Dev)

#### 1. Khởi chạy Backend API (Python):
```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Chạy migration & nạp dữ liệu mẫu
alembic upgrade head
python -m app.seed_data

# Khởi động server
uvicorn app.main:app --reload --port 8000
```

#### 2. Khởi chạy Frontend Web (Next.js):
```bash
cd apps/web
npm install
npm run dev
# Truy cập: http://localhost:3000
```

---

## 👥 Tài Khoản Thử Nghiệm (Demo Accounts)

Hệ thống đã được nạp sẵn 11 ca bệnh giả lập và đầy đủ tài khoản các vai trò chuyên môn:

| Vai trò | Tên đăng nhập | Mật khẩu | Phạm vi quyền hạn |
| :--- | :--- | :--- | :--- |
| **Bệnh nhân** | `patient1` | `patient123` | Check-in, Báo thức, Khai báo thuốc/triệu chứng, Triage, Chat AI, Video call |
| **Bệnh nhân 2** | `patient2` | `patient123` | Ca dị ứng thuốc phức tạp / Hội chứng phát ban |
| **Bác sĩ** | `doctor1` | `doctor123` | Quản lý bệnh nhân, Sinh hiệu, Timeline điều trị, Kê đơn, MedSafe, Video call |
| **Điều dưỡng** | `nurse1` | `nurse123` | Hàng đợi phân luồng vàng, xác nhận triệu chứng người bệnh |
| **Dược sĩ** | `pharm1` | `pharm123` | Duyệt quy tắc tương tác thuốc, rà soát hướng dẫn sử dụng |
| **Lãnh đạo khoa** | `leader1` | `leader123` | Quality Dashboard, thống kê thời gian phản hồi, tỷ lệ phân luồng |
| **Quản trị viên**| `admin1` | `admin123` | Quản trị tài khoản, Audit log hệ thống (Không can thiệp hồ sơ lâm sàng) |

---

## 🔌 Tài Liệu API Endpoints Chính

| Phương thức | Endpoint | Mô tả chức năng |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Đăng nhập hệ thống, trả về JWT Access Token |
| `GET` | `/api/v1/patients/me/profile` | Lấy thông tin hồ sơ người bệnh đang đăng nhập |
| `GET` | `/api/v1/patients/{id}/clinical-info` | Lấy thông tin lâm sàng & 4 chỉ số sinh hiệu (Bác sĩ) |
| `POST` | `/api/v1/patients/{id}/clinical-info` | Cập nhật cân nặng, nhịp tim, HA, $\text{SpO}_2$, ghi chú lâm sàng |
| `GET` | `/api/v1/patients/{id}/timeline` | Lấy danh sách timeline quá trình điều trị & chẩn đoán bệnh |
| `POST` | `/api/v1/patients/{id}/timeline/conditions` | Thêm chẩn đoán bệnh mới vào timeline |
| `POST` | `/api/v1/triage` | Gửi mô tả triệu chứng → TriageGuard AI phân luồng Xanh/Vàng/Đỏ |
| `GET` | `/api/v1/triage/mine` | Lịch sử phân luồng triệu chứng của người bệnh |
| `POST` | `/api/v1/safety/check` | Kiểm tra tương tác thuốc chéo & dị ứng (MedSafe Rule Engine) |
| `POST` | `/api/v1/chat/messages` | Gửi tin nhắn trò chuyện với Trợ lý Gemini AI (Dosing RAG) |
| `GET` | `/api/v1/video/token` | Cấp LiveKit WebRTC Token tham gia cuộc gọi video trực tuyến |

---

## 🧪 Kiểm Thử & Đảm Bảo Chất Lượng

Hệ thống được thiết lập bộ kiểm thử toàn diện từ Backend đến Frontend:

```bash
# 1. Chạy toàn bộ 93 Backend Pytest (Authentication, Safety, Triage, RAG, Video):
PYTHONPATH=services/api .venv/bin/pytest -v

# Kết quả:
# ======================== 93 passed in 37.56s ========================
```

```bash
# 2. Kiểm tra type check, linting và build production của Next.js:
cd apps/web
npm run build

# Kết quả:
# ✓ Compiled successfully
# ✓ Generating static pages (18/18 routes)
# ✓ 0 Lint Errors / 0 Type Warnings
```

---

## ⚖️ Quy Chuẩn An Toàn Y Tế & Giới Hạn Trách Nhiệm

1. **Mục đích Demo & Nghiên cứu**: Dự án được xây dựng phục vụ mục đích nghiên cứu, trình diễn giải pháp công nghệ y tế (MVP Demo) dựa trên dữ liệu giả lập. Không tự ý sử dụng thay thế cho chẩn đoán y khoa chính thức.
2. **Nguyên tắc "Human-In-The-Loop"**: AI chỉ đóng vai trò phân tích sơ bộ và gợi ý. Toàn bộ quyết định kê đơn, thay đổi liều và phác đồ điều trị bắt buộc phải do Bác sĩ chuyên khoa có chứng chỉ hành nghề trực tiếp xác nhận.
3. **Cơ chế Dự phòng Khi Thiếu Dữ Liệu**: Khi hệ thống thiếu thông tin cận lâm sàng (như nồng độ Creatinine huyết thanh, men gan...) hoặc gặp lỗi kết nối, AI tuyệt đối không được tự ý suy đoán liều mà bắt buộc phải trả về thông báo yêu cầu bổ sung thông tin từ nhân viên y tế.
4. **Bảo Mật Dữ Liệu**: Hệ thống thực hiện mã hóa mật khẩu chuẩn `bcrypt`, xác thực qua `JWT Token` và phân quyền kiểm tra đa tầng trên từng bản ghi lâm sàng.

---

<div align="center">
  <sub>Phát triển bởi Đội ngũ AllerCare AI • Bản quyền © 2026. All rights reserved.</sub>
</div>
