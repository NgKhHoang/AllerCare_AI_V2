# 🛡️ AllerCare AI — Hệ Thống Giám Sát An Toàn Thuốc & Trợ Lý Gemini AI Cá Thể Hóa

> **Nền tảng số hóa theo dõi điều trị từ xa, phân luồng cấp cứu TriageGuard AI và kiểm tra an toàn sử dụng thuốc chuyên khoa Da liễu – Dị ứng Miễn dịch lâm sàng.**

[![Next.js 14](https://img.shields.io/badge/Next.js-14.2_App_Router-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![.NET Aspire 9.0](https://img.shields.io/badge/.NET_Aspire-9.0_AppHost-512BD4?style=flat-square&logo=dotnet)](https://learn.microsoft.com/dotnet/aspire/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_Database-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![LiveKit WebRTC](https://img.shields.io/badge/LiveKit-WebRTC_HD_Video-FF4B4B?style=flat-square)](https://livekit.io/)
[![Pytest Passed](https://img.shields.io/badge/Backend_Tests-93%2F93_Passed-22c55e?style=flat-square)](https://pytest.org/)
[![TypeScript Build](https://img.shields.io/badge/Next.js_Build-18%2F18_Routes_Clean-0284c7?style=flat-square)](https://www.typescriptlang.org/)

---

## 📑 Mục Lục Chi Tiết

1. [Tổng Quan Dự Án & Tầm Nhìn](#1-tổng-quan-dự-án--tầm-nhìn)
2. [5 Khối Chức Năng Cốt Lõi (Chuẩn 10.3 & SPEC)](#2-5-khối-chức-năng-cốt-lõi-chuẩn-103--spec)
   - [2.1. Cổng Bệnh Nhân & Người Nhà (Patient & Caregiver Portal)](#21-cổng-bệnh-nhân--người-nhà-patient--caregiver-portal)
   - [2.2. Cổng Bác Sĩ & Điều Trị Lâm Sàng (Doctor Portal)](#22-cổng-bác-sĩ--điều-trị-lâm-sàng-doctor-portal)
   - [2.3. Trợ Lý Gemini AI & Tư Vấn Video Call Trực Tuyến](#23-trợ-lý-gemini-ai--tư-vấn-video-call-trực-tuyến)
   - [2.4. AI Suspect Agent — Xếp Hạng Tác Nhân Nghi Ngờ (WHO-UMC)](#24-ai-suspect-agent--xếp-hạng-tác-nhân-nghi-ngờ-who-umc)
   - [2.5. Quy Trình Cấp Cứu 24/7 & Hotline Khẩn Cấp](#25-quy-trình-cấp-cứu-247--hotline-khẩn-cấp)
3. [Hệ Thống Cảnh Báo An Toàn MedSafe AI (9 Nhóm Cảnh Báo)](#3-hệ-thống-cảnh-báo-an-toàn-medsafe-ai-9-nhóm-cảnh-báo)
4. [Kiến Trúc Kỹ Thuật (Architecture & Tech Stack)](#4-kiến-trúc-kỹ-thuật-architecture--tech-stack)
5. [Cấu Trúc Thư Mục Toàn Dự Án](#5-cấu-trúc-thư-mục-toàn-dự-án)
6. [Mô Hình Dữ Liệu & Thực Thể (Database Schema)](#6-mô-hình-dữ-liệu--thực-thể-database-schema)
7. [Hướng Dẫn Cài Đặt & Khởi Chạy Từng Bước](#7-hướng-dẫn-cài-đặt--khởi-chạy-từng-bước)
   - [Cách 1: Khởi chạy bằng .NET Aspire AppHost (Khuyến nghị)](#cách-1-khởi-chạy-bằng-net-aspire-apphost-khuyến-nghị)
   - [Cách 2: Khởi chạy bằng Docker Compose](#cách-2-khởi-chạy-bằng-docker-compose)
   - [Cách 3: Khởi chạy thủ công từng Service (Dev Mode)](#cách-3-khởi-chạy-thủ-công-từng-service-dev-mode)
   - [Thiết lập HTTPS & Cài đặt PWA trên Điện Thoại (LAN)](#thiết-lập-https--cài-đặt-pwa-trên-điện-thoại-lan)
8. [Tài Khoản Thử Nghiệm & 11 Ca Lâm Sàng Mẫu](#8-tài-khoản-thử-nghiệm--11-ca-lâm-sàng-mẫu)
9. [Đặc Tả Chi Tiết API Endpoints (RESTful APIs)](#9-đặc-tả-chi-tiết-api-endpoints-restful-apis)
10. [Kiểm Thử & Đảm Bảo Chất Lượng (QA & Testing)](#10-kiểm-thử--đảm-bảo-chất-lượng-qa--testing)
11. [Quy Chuẩn An Toàn Y Tế & Tuyên Bố Miễn Trừ](#11-quy-chuẩn-an-toàn-y-tế--tuyên-bố-miễn-trừ)

---

## 1. Tổng Quan Dự Án & Tầm Nhìn

**AllerCare AI V2** là hệ sinh thái số hóa hỗ trợ cá thể hóa điều trị ngoại trú và phòng ngừa sự cố y khoa liên quan đến thuốc dành cho chuyên khoa **Da liễu, Dị ứng và Miễn dịch lâm sàng** (quản lý dị ứng thuốc, mày đay, phù mạch, viêm da cơ địa, vảy nến, hồng ban đa dạng, hội chứng Stevens-Johnson/TEN...).

### 🎯 Nguyên Lý Cốt Lõi:
1. **Mô Hình Hybrid AI Đột Phá**:
   - **MedSafe Deterministic Engine**: Bộ quy tắc an toàn y tế cứng dựa trên cơ sở chứng cứ dược lý học (Pharmacology), không phụ thuộc vào độ suy đoán ngẫu nhiên của LLM.
   - **Gemini LLM & Dosing RAG**: Đọc và học từ kho kiến thức quy tắc chia liều của bác sĩ (`data/ai_knowledge/`), hỗ trợ giải thích phác đồ dễ hiểu và tư vấn cá thể hóa theo độ thanh thải thận ($CrCl$), gan, tuổi và tiền sử dị ứng.
   - **AI Suspect Ranking Engine**: Ứng dụng thuật toán đánh giá mối liên hệ nhân quả của Tổ chức Y tế Thế giới (WHO-UMC) và thang điểm Naranjo.
2. **Cơ Chế Human-In-The-Loop**: AI chỉ đóng vai trò phân tích sơ bộ và đề xuất; mọi quyết định xác nhận dị ứng, thay đổi toa, duyệt hướng dẫn đều do **Bác sĩ/Dược sĩ/Điều dưỡng** xác nhận trước khi lưu vào hồ sơ điều trị chính thức.
3. **Mô Hình 5 Trạng Thái Trung Thực (5-State Truth Model)**: Không bao giờ hiển thị trạng thái "An toàn" nếu phát hiện thiếu dữ liệu cận lâm sàng, lỗi kiểm tra hoặc dữ liệu nằm ngoài phạm vi bao phủ.

---

## 2. 5 Khối Chức Năng Cốt Lõi (Chuẩn 10.3 & SPEC)

### 2.1. Cổng Bệnh Nhân & Người Nhà (Patient & Caregiver Portal)
- **Báo Thức Nhắc Thuốc & Web Audio Chime**:
  - Hẹn giờ uống thuốc buổi sáng chuẩn xác (Mặc định `07:30`).
  - Bộ tổng hợp âm thanh y tế êm dịu sử dụng Web Audio API (hợp âm C5-E5-G5-C6) chạy trực tiếp trên trình duyệt/PWA không cần tải file MP3 ngoài.
  - Hỗ trợ nút Báo lại sau 10 phút (*Snooze*) và thông báo đẩy trình duyệt (*Web Notifications*).
- **Check-in 1 Chạm**:
  - Tích chọn nhanh *"✓ Đã uống đủ thuốc theo đơn sáng nay"*.
  - Bộ chip chọn nhanh tình trạng da & cảm giác lâm sàng (🟢 Ổn định, 🟡 Ngứa nhẹ/Khô rát, 🔴 Ngứa nhiều/Ban đỏ lan rộng, ⚠️ Mụn nước/Phù nề, ❄️ Tróc vảy, 🤢 Buồn nôn/Mệt mỏi).
  - Ô nhập ghi chú bổ sung trực tiếp chuyển tới Bác sĩ phụ trách.
- **Phân Luồng TriageGuard AI (3 Mức Độ)**:
  - 🟢 **Xanh (Green)**: Triệu chứng nhẹ, ổn định → Tiếp tục theo dõi phác đồ.
  - 🟡 **Vàng (Yellow)**: Triệu chứng mới xuất hiện/chưa giảm/sốt nhẹ → Hệ thống tự động tạo cảnh báo và đưa vào hàng đợi Điều dưỡng/Bác sĩ xử lý trong vòng 24h.
  - 🔴 **Đỏ (Red — Cấp cứu)**: Phát hiện dấu hiệu phản vệ nguy kịch (khó thở, tức ngực, phù môi/lưỡi/thanh quản) → Kích hoạt ngay chế độ khẩn cấp, hiển thị nút **GỌI 115** và **HOTLINE CẤP CỨU +84 98 1224426** (không cần chờ bác sĩ duyệt).
- **Đối Soát & Khai Báo Thuốc Đa Nguồn (WHO Reconciliation)**:
  - Khai báo thuốc từ Bệnh viện, Bệnh viện/Phòng khám khác, Tự mua tại nhà thuốc, TPCN, Thuốc Nam/Bắc, Dạng bôi/nhỏ/tiêm.
  - Tải ảnh chụp đơn thuốc, vỏ hộp thuốc và hình ảnh tổn thương da thời gian thực.
- **Hướng Dẫn Sử Dụng Thuốc Dễ Hiểu**:
  - Hướng dẫn dùng thuốc do AI soạn thảo dựa trên toa gốc của Bác sĩ.
  - Bệnh nhân bấm nút phản hồi: **"✓ Tôi đã hiểu cách dùng thuốc"** hoặc **"✕ Chưa hiểu — cần giải thích lại"** (tự động thông báo Bác sĩ/Điều dưỡng liên hệ lại).
- **Ủy Quyền Người Nhà (Caregiver Link)**:
  - Cho phép người thân/người chăm sóc được ủy quyền khai báo thuốc, theo dõi sinh hiệu và nhận cảnh báo khẩn cấp thay cho bệnh nhân.

---

### 2.2. Cổng Bác Sĩ & Điều Trị Lâm Sàng (Doctor Portal)
- **Hồ Sơ Lâm Sàng & Theo Dõi 4 Chỉ Số Sinh Hiệu (Vital Signs)**:
  - Quản lý và cập nhật liên tục 4 chỉ số: **⚖️ Cân nặng (kg)**, **❤️ Nhịp tim / Mạch (bpm)**, **🩸 Huyết áp (mmHg)**, **🫁 SpO2 (Oxy máu %)** cùng Ghi chú lâm sàng ban đầu.
- **Cây Timeline Quá Trình Điều Trị & Tiền Sử Dị Ứng**:
  - Trực quan hóa toàn bộ lịch sử thăm khám, các đợt phát bệnh, thời điểm chẩn đoán các loại bệnh (Viêm da cơ địa, Dị ứng thuốc, Mày đay, Chàm...) và phân loại trạng thái (*Đang điều trị / Thuyên giảm / Đã khỏi*).
  - Ghi nhận chi tiết tiền sử dị ứng & phản vệ (dị nguyên, mức độ nghiêm trọng, biểu hiện lâm sàng).
- **Kê Đơn Thuốc Thông Minh & Tích Hợp MedSafe Checker**:
  - Kê đơn với bộ gợi ý thuốc tự động (Auto-complete) kèm liều dùng, tần suất, đường dùng và thời điểm dùng chuẩn y khoa.
  - Nút **Kê đơn & Kiểm tra tương tác MedSafe**: Tự động đối chiếu tương tác chéo giữa thuốc mới kê và toàn bộ danh mục thuốc bệnh nhân đang dùng + tiền sử dị ứng đã xác minh.
  - Chức năng *"Thử nghiệm thuốc dự kiến (Simulate MedSafe)"* giúp Bác sĩ kiểm tra độ an toàn trước khi chính thức đưa vào toa.
- **Xem & Phê Duyệt Cập Nhật Lâm Sàng**:
  - Theo dõi nhật ký triệu chứng, xem ảnh tổn thương da độ phân giải cao do bệnh nhân gửi.
  - Đánh dấu đã xem toàn bộ cập nhật (*Mark all as seen*) theo từng ca bệnh.

---

### 2.3. Trợ Lý Gemini AI & Tư Vấn Video Call Trực Tuyến
- **Trợ Lý AI AllerCare (RAG Dosing & Safety Engine)**:
  - Khác biệt hoàn toàn với chatbot thông thường: AI được huấn luyện theo persona *"Trợ lý Y tế AllerCare"*, tham chiếu trực tiếp từ kho tri thức liều lượng (`data/ai_knowledge/dosing_examples.json`).
  - Cá thể hóa phản hồi theo hồ sơ thực tế của bệnh nhân: Đối chiếu tuổi, mức độ suy thận ($CrCl$), bệnh lý nền.
  - Bộ quy tắc an toàn (Guardrails): Từ chối đoán mò liều khi thiếu chỉ số xét nghiệm, không tự ý khuyên đổi thuốc, phát hiện nguy cấp hướng dẫn gọi 115 ngay.
  - Hỗ trợ lưu trữ nhiều phiên hội thoại (*Multi-session Chat*), đặt tên hội thoại và xem minh bạch nguồn tri thức AI học được.
- **Phòng Khám Video Call HD 1-1 (LiveKit WebRTC)**:
  - Kết nối trực tiếp giữa Bác sĩ và Bệnh nhân theo lịch hẹn với chất lượng hình ảnh/âm thanh độ trễ cực thấp.
  - Hỗ trợ bật/tắt Micro, Camera, Chuyển đổi camera trước/sau trên điện thoại, Chia sẻ màn hình (*Screen Share*) và chế độ Toàn màn hình (*Full Screen*).

---

### 2.4. AI Suspect Agent — Xếp Hạng Tác Nhân Nghi Ngờ (WHO-UMC)
- Khi bệnh nhân gặp phản ứng dị ứng/phản vệ bất thường, AI tự động đối soát toàn bộ toa thuốc cũ và toa thuốc mới.
- **Thang điểm đánh giá nhân quả theo WHO-UMC / Naranjo**:
  - Quan hệ thời gian dùng thuốc và thời điểm khởi phát triệu chứng: `+2 điểm`
  - Xuất hiện trong cả 2 đợt phản ứng tái diễn (*in_both_episodes*): `+4 điểm`
  - Trùng với nhóm thuốc/hoạt chất dị ứng đã xác minh trước đó: `+3 điểm`
  - Thuốc tự mua / OTC / không rõ nguồn gốc: `+1 điểm`
  - Có nguyên nhân bệnh lý thay thế giải thích được: `-2 điểm`
- Xếp hạng theo 3 mức độ: **HIGH (≥ 5 điểm)**, **POSSIBLE (≥ 2 điểm)**, **LOW (< 2 điểm)**.
- Bác sĩ kiểm tra báo cáo và bấm **"Xác nhận tác nhân dị ứng"** → Hệ thống tự động khởi tạo bản ghi `AllergyRecord` ở trạng thái chờ xác minh.

---

### 2.5. Quy Trình Cấp Cứu 24/7 & Hotline Khẩn Cấp
- Đường dây nóng Cấp cứu Quốc gia **115** và **HOTLINE CẤP CỨU ALLERCARE: `+84 98 1224426`** được tích hợp đồng bộ trên:
  - `EmergencyBanner` ở đầu tất cả các trang Bệnh nhân.
  - Trang Phân luồng TriageGuard khi phát hiện mức Đỏ.
  - Khung Chat Trợ lý AI khi phát hiện từ khóa nguy hiểm.
  - Trang Hướng dẫn sử dụng thuốc & Trang chủ.

---

## 3. Hệ Thống Cảnh Báo An Toàn MedSafe AI (9 Nhóm Cảnh Báo)

Engine MedSafe độc lập kiểm tra toàn diện 9 nhóm quy tắc an toàn y khoa:

| Mã Nhóm | Tên Quy Tắc | Mã Rule Code | Hành Động & Cơ Chế Hệ Thống |
| :--- | :--- | :--- | :--- |
| **1. Phản vệ** | Nghi ngờ phản vệ cấp | `TriageGuard Red` | Báo động đỏ, nút gọi 115 & Hotline tức thì |
| **2. Tái dị ứng** | Dùng lại thuốc từng gây dị ứng | `DA001` – `DA007` | Chặn kê đơn, đối soát chéo tiền sử dị ứng đã xác minh |
| **3. Tương tác thuốc** | Tương tác Thuốc – Thuốc | `DD001` – `DD005` | Cảnh báo mức độ nghiêm trọng (Major / Moderate) |
| **4. Thuốc – Bệnh nền** | Chống chỉ định theo bệnh nền / Xét nghiệm | `DC001` – `DC007` | Kiểm tra $CrCl$, suy gan, hen phế quản, loét dạ dày |
| **5. Trùng hoạt chất** | Trùng lặp hoạt chất / Nhóm thuốc | `DI001` – `DI006` | Phát hiện kê trùng dẫn đến quá liều ngộ độc |
| **6. Sai liều dùng** | Uống gấp đôi / Bù liều sai cách | `DL001`, `DR001` | Cảnh báo khi phát hiện thói quen uống bù liều gấp đôi |
| **7. Bỏ liều** | Bỏ thuốc / Uống không đều đặn | `DL002` | Phát hiện thuốc ở trạng thái `irregular` |
| **8. Diễn tiến nặng** | Triệu chứng tiến triển nhanh | `TriageGuard Red` | Phù môi, khó thở, ban đỏ lan rộng toàn thân |
| **9. Chưa kiểm tra** | Thuốc tự khai chưa qua duyệt | `UM001` | Nhắc nhở Bác sĩ cần xác minh trước khi tin cậy |

---

## 4. Kiến Trúc Kỹ Thuật (Architecture & Tech Stack)

```
                                  ┌─────────────────────────────────────────────────────────┐
                                  │            .NET 9.0 Aspire AppHost Engine               │
                                  │   - Orchestration & Distributed Application Host        │
                                  │   - Aspire Dashboard (Metrics, OpenTelemetry, Logs)     │
                                  └────────────────────────────┬────────────────────────────┘
                                                               │
                                ┌──────────────────────────────┴──────────────────────────────┐
                                │                                                             │
                                ▼                                                             ▼
                 ┌─────────────────────────────┐                               ┌─────────────────────────────┐
                 │      apps/web (Next.js 14)  │                               │    services/api (FastAPI)   │
                 │  - React 18, TypeScript     │ ───────[ REST API / JSON ]───▶│  - Python 3.12+, FastAPI    │
                 │  - App Router Architecture  │ ◀──────[ JWT Access Token ]── │  - SQLAlchemy 2.0 ORM       │
                 │  - Custom Vanilla CSS Design│                               │  - Alembic Migrations       │
                 │  - LiveKit WebRTC Video SDK │                               │  - MedSafe 9-Rule Engine    │
                 │  - PWA Offline ServiceWorker│                               │  - WHO-UMC Suspect Engine   │
                 └─────────────────────────────┘                               │  - Gemini AI & RAG Pipeline │
                                                                               └──────────────┬──────────────┘
                                                                                              │
                                                               ┌──────────────────────────────┴──────────────┐
                                                               ▼                                             ▼
                                                ┌─────────────────────────────┐               ┌───────────────────────────┐
                                                │    PostgreSQL 16 Database   │               │   LiveKit WebRTC Server   │
                                                │ - User & Patient Profiles   │               │ - SFU Low-Latency Video   │
                                                │ - Medications & Allergies   │               │ - Room Token Generation   │
                                                │ - Vitals & TreatmentTimeline│               │ - Screen Share & Media    │
                                                │ - Triage & Audit Logs       │               └───────────────────────────┘
                                                └─────────────────────────────┘
```

---

## 5. Cấu Trúc Thư Mục Toàn Dự Án

```
AllerCare_AI_V2/
├── apps/
│   └── web/                         # Ứng dụng Frontend Next.js 14
│       ├── app/
│       │   ├── admin/               # Cổng Quản trị viên hệ thống & Audit logs
│       │   ├── doctor/              # Cổng Bác sĩ, Sinh hiệu, Kê đơn, AI Suspect
│       │   ├── nurse/               # Cổng Điều dưỡng (Xử lý hàng đợi phân luồng vàng)
│       │   ├── patient/             # Cổng Bệnh nhân (Chat AI, Triage, Updates, Guides)
│       │   ├── pharmacist/          # Cổng Dược sĩ lâm sàng
│       │   ├── leader/              # Cổng Lãnh đạo khoa (Quality Dashboard ẩn danh)
│       │   ├── video/               # Phòng khám Video Call trực tuyến WebRTC
│       │   ├── globals.css          # Design System gốc (Tokens, Theme, Variables)
│       │   └── layout.tsx           # Root Layout & PWA Metadata
│       ├── components/              # UI Components (AppShell, TreatmentTimeline, UI Library)
│       ├── lib/                     # API Client, Token Manager, Interface Types
│       └── public/                  # PWA Manifest, Icons, Assets
├── services/
│   └── api/                         # Dịch vụ Backend FastAPI
│       ├── app/
│       │   ├── modules/             # Các phân hệ tính năng độc lập
│       │   │   ├── auth/            # Xác thực JWT, Hash mật khẩu bcrypt
│       │   │   ├── patients/        # Quản lý hồ sơ, 4 chỉ số sinh hiệu, timeline
│       │   │   ├── triage/          # TriageGuard AI & WHO-UMC Suspect Engine
│       │   │   ├── safety/          # MedSafe Rule-Based Engine & Drug Interaction
│       │   │   ├── chat/            # Gemini AI Assistant & RAG Dosing Advisor
│       │   │   └── video/           # Cấp phát LiveKit Room Token
│       │   ├── models.py            # Định nghĩa toàn bộ thực thể CSDL (SQLAlchemy)
│       │   ├── schemas.py           # Định nghĩa cấu trúc DTO / Pydantic Schemas
│       │   ├── seed_data.py         # Nạp 11 ca bệnh giả lập chuẩn y khoa Da liễu
│       │   └── main.py              # Điểm khởi tạo FastAPI Application & Middleware
│       └── tests/                   # 93 Unit & Integration Tests (Pytest)
├── src/
│   └── AppHost/                     # Dự án .NET 9.0 Aspire Service Orchestration
├── data/                            # Kho dữ liệu y khoa tách biệt
│   ├── catalog/                     # 80 thuốc chuẩn & 61 hoạt chất chuyên khoa
│   ├── safety/                      # 29 quy tắc an toàn, triage rules, knowledge sources
│   ├── demo/                        # Danh sách 27 tài khoản & 11 ca lâm sàng
│   └── ai_knowledge/                # Kho tri thức duy nhất cho AI RAG chia liều
├── docs/                            # Tài liệu phân tích yêu cầu (Roadmap, Specs, Fix docs)
├── infra/                           # Dockerfiles, Docker Compose & Caddy HTTPS Proxy
└── scripts/                         # Walkthrough scripts & công cụ sinh icon PWA
```

---

## 6. Mô Hình Dữ Liệu & Thực Thể (Database Schema)

Hệ thống được thiết kế với hơn 15 bảng quan hệ chuẩn hóa:
- `users`: Tài khoản người dùng, vai trò (`patient`, `caregiver`, `doctor`, `nurse`, `pharmacist`, `leader`, `admin`), trạng thái khóa/mở.
- `patient_profiles`: Hồ sơ chi tiết người bệnh, ngày sinh, giới tính, bác sĩ phụ trách, **chỉ số sinh hiệu (cân nặng, nhịp tim, HA, $\text{SpO}_2$)**, ghi chú lâm sàng.
- `treatment_conditions`: Cây timeline các đợt phát bệnh và loại bệnh chẩn đoán (`active`, `remission`, `resolved`).
- `medication_records`: Danh mục thuốc đa nguồn, liều lượng, tần suất, đường dùng, thời điểm, ảnh toa, trạng thái xác minh (`unverified`, `verified`, `stopped`).
- `allergy_records`: Tiền sử dị ứng & phản vệ thuốc/thực phẩm, mức độ nặng, biểu hiện lâm sàng.
- `triage_records`: Nhật ký phân luồng triệu chứng 3 mức (xanh/vàng/đỏ), dấu hiệu nhận diện, hành động khuyến nghị.
- `suspect_rankings`: Kết quả xếp hạng tác nhân thuốc nghi ngờ theo WHO-UMC kèm điểm số chi tiết.
- `guide_records`: Hướng dẫn dùng thuốc do AI soạn, trạng thái duyệt của Bác sĩ và phản hồi của Bệnh nhân (*understood/not_understood*).
- `chat_sessions` & `chat_messages`: Lịch sử các phiên hội thoại với Trợ lý Gemini AI.
- `caregiver_links`: Quan hệ ủy quyền giữa người nhà và bệnh nhân.
- `audit_logs`: Nhật ký kiểm toán toàn bộ thao tác y tế bảo đảm tính minh bạch.

---

## 7. Hướng Dẫn Cài Đặt & Khởi Chạy Từng Bước

### Cách 1: Khởi chạy bằng .NET Aspire AppHost (Khuyến nghị)

Yêu cầu: Đã cài đặt [.NET 9.0 SDK](https://dotnet.microsoft.com/download), Python 3.12+, Node.js 18+ và Docker Desktop.

```bash
# 1. Di chuyển vào thư mục AppHost
cd src/AppHost

# 2. Khởi chạy toàn bộ hệ sinh thái
dotnet run
```
> Trình duyệt sẽ tự động mở **Aspire Dashboard** tại `https://localhost:17234` cung cấp bảng điều khiển trung tâm, traces OTLP, logs thời gian thực và tự động điều phối Backend API (`http://localhost:8000`) cùng Frontend Web (`http://localhost:3000`).

---

### Cách 2: Khởi chạy bằng Docker Compose

```bash
# Khởi chạy Postgres + Backend API + Frontend Next.js
docker compose -f infra/docker-compose.yml up -d --build

# Kiểm tra trạng thái các container:
docker compose -f infra/docker-compose.yml ps

# Truy cập:
# - Web Application: http://localhost:3000
# - API Swagger Docs: http://localhost:8000/docs
# - LiveKit Server:   http://localhost:7880
```

---

### Cách 3: Khởi chạy thủ công từng Service (Dev Mode)

#### 1. Khởi chạy Backend API:
```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Chạy migration CSDL và nạp dữ liệu mẫu
alembic upgrade head
python -m app.seed_data

# Khởi chạy server FastAPI
uvicorn app.main:app --reload --port 8000
```

#### 2. Khởi chạy Frontend Web:
```bash
cd apps/web
npm install
npm run dev
# Truy cập: http://localhost:3000
```

---

### Thiết lập HTTPS & Cài đặt PWA trên Điện Thoại (LAN)

Để trải nghiệm tính năng PWA (cài app ra màn hình chính, chuông báo thức, nhận thông báo đẩy và gọi video camera) trên điện thoại trong cùng mạng Wi-Fi:

```bash
# Chạy script tự động bật Caddy HTTPS Reverse Proxy
./scripts/lan_https.sh dev
```
1. Trên điện thoại (cùng Wi-Fi): Mở `http://<IP_MAY_TINH>:8080/ca.crt` để tải chứng chỉ SSL cục bộ và bấm Tin cậy chứng chỉ.
2. Truy cập `https://<IP_MAY_TINH>` trên Safari (iOS) hoặc Chrome (Android) → Chọn **"Thêm vào Màn hình chính (Add to Home Screen)"**.

---

## 8. Tài Khoản Thử Nghiệm & 11 Ca Lâm Sàng Mẫu

Hệ thống đã nạp sẵn 27 tài khoản và 11 ca bệnh da liễu điển hình:

| Vai trò | Tên đăng nhập | Mật khẩu | Kịch bản kiểm thử lâm sàng |
| :--- | :--- | :--- | :--- |
| **Bệnh nhân 1** | `patient1` | `patient123` | Bệnh nhân theo dõi ngoại trú, thử chuông báo thức & check-in ngày |
| **Bệnh nhân 2** | `patient2` | `patient123` | Ca phản vệ tái diễn — thử nghiệm xếp hạng tác nhân nghi ngờ Cefaclor |
| **Bệnh nhân 3** | `patient3` | `patient123` | Ca mày đay cấp & dị ứng chéo thuốc chống viêm NSAIDs |
| **Bệnh nhân 4** | `case01` | `patient123` | Ca Viêm da tiếp xúc dị ứng có người nhà (`family1`) ủy quyền |
| **Người nhà** | `family1` | `family123` | Người chăm sóc được ủy quyền khai báo thay cho `case01` |
| **Bác sĩ 1** | `doctor1` | `doctor123` | Bác sĩ điều trị chính: xem sinh hiệu, timeline, kê đơn, gọi video call |
| **Bác sĩ 2** | `doctor2` | `doctor123` | Bác sĩ hội chẩn chuyên khoa Dị ứng Miễn dịch |
| **Điều dưỡng** | `nurse1` | `nurse123` | Quản lý hàng đợi phân luồng vàng, xác nhận triệu chứng người bệnh |
| **Dược sĩ** | `pharmacist1` | `pharm123` | Rà soát quy tắc an toàn MedSafe, kiểm tra tương tác thuốc |
| **Lãnh đạo khoa** | `leader1` | `leader123` | Xem Quality Dashboard — thống kê tỷ lệ phân luồng, thời gian phản hồi |
| **Quản trị viên** | `admin1` | `admin123` | Quản lý tài khoản, xem Audit Logs hệ thống |

---

## 9. Đặc Tả Chi Tiết API Endpoints (RESTful APIs)

### 🔐 Xác thực & Người dùng (Auth & Users)
- `POST /api/v1/auth/login`: Xác thực tài khoản, trả về JWT Access Token.
- `GET /api/v1/patients/me/profile`: Lấy thông tin chi tiết hồ sơ người bệnh hiện tại.
- `GET /api/v1/patients/me/timeline`: Lấy cây timeline quá trình điều trị của bệnh nhân.

### 🩺 Lâm Sàng & Sinh Hiệu (Clinical & Vitals — Bác sĩ)
- `GET /api/v1/patients/{id}/clinical-info`: Lấy thông tin lâm sàng & 4 chỉ số sinh hiệu.
- `POST /api/v1/patients/{id}/clinical-info`: Cập nhật cân nặng, nhịp tim, HA, $\text{SpO}_2$ và ghi chú lâm sàng.
- `GET /api/v1/patients/{id}/timeline`: Lấy danh sách timeline bệnh lý của bệnh nhân chỉ định.
- `POST /api/v1/patients/{id}/timeline/conditions`: Thêm chẩn đoán bệnh mới vào timeline.
- `POST /api/v1/patients/{id}/verify-medication/{med_id}`: Bác sĩ xác minh thuốc tự khai vào hồ sơ chính thức.

### 🚦 Phân Luồng Triệu Chứng & Tác Nhân Nghi Ngờ (Triage & Suspect)
- `POST /api/v1/triage`: Khai báo triệu chứng → Phân luồng Xanh/Vàng/Đỏ (TriageGuard AI).
- `GET /api/v1/triage/mine`: Lấy lịch sử phân luồng của bản thân.
- `GET /api/v1/triage/queue`: Hàng đợi phân luồng mức Vàng dành cho Điều dưỡng & Bác sĩ.
- `POST /api/v1/triage/suspect-ranking`: Chạy thuật toán WHO-UMC xếp hạng tác nhân nghi ngờ gây dị ứng.
- `POST /api/v1/triage/suspect-ranking/{id}/confirm`: Bác sĩ xác nhận tác nhân nghi ngờ thành hồ sơ dị ứng.

### 💊 Kê Đơn & An Toàn Thuốc (Prescription & MedSafe)
- `POST /api/v1/safety/check`: Rà soát tương tác thuốc chéo và chống chỉ định bệnh nền.
- `POST /api/v1/patients/{id}/prescribe`: Bác sĩ kê đơn thuốc mới vào hồ sơ bệnh nhân.
- `POST /api/v1/guides/draft/{med_id}`: AI soạn thảo bản nháp hướng dẫn sử dụng thuốc.
- `POST /api/v1/guides/{id}/approve`: Bác sĩ phê duyệt hướng dẫn sử dụng thuốc.
- `POST /api/v1/guides/{id}/acknowledge`: Bệnh nhân xác nhận *"Tôi đã hiểu"* hoặc yêu cầu giải thích lại.

### 🤖 Chatbot AI & Video Call Trực Tuyến
- `GET /api/v1/chat/sessions`: Danh sách các phiên hội thoại với Trợ lý Gemini AI.
- `POST /api/v1/chat/messages`: Gửi tin nhắn câu hỏi y khoa tới Trợ lý AI (RAG Dosing).
- `GET /api/v1/video/token`: Cấp phát token phòng khám LiveKit WebRTC Video Call.

---

## 10. Kiểm Thử & Đảm Bảo Chất Lượng (QA & Testing)

Dự án duy trì chất lượng mã nguồn nghiêm ngặt:

### 1. Backend Testing (Pytest):
```bash
PYTHONPATH=services/api .venv/bin/pytest -v
```
- **Kết quả**: Đạt **93/93 tests (100% Passed)** bao gồm:
  - Kiểm thử xác thực & phân quyền 7 vai trò (`test_permissions.py`)
  - Kiểm thử phân luồng 3 mức TriageGuard & Xếp hạng nghi ngờ WHO (`test_new_modules.py`)
  - Kiểm thử đối soát thuốc đa nguồn & ảnh tổn thương (`test_reconciliation.py`)
  - Kiểm thử MedSafe 9 nhóm quy tắc an toàn (`test_safety_flow.py`)
  - Kiểm thử Trợ lý Gemini RAG & chia liều cá thể hóa (`test_mock_ai.py`, `test_chat_flow.py`)

### 2. Frontend Testing (Next.js Build & Lint):
```bash
cd apps/web && npm run build
```
- **Kết quả**: Biên dịch thành công **18/18 routes** tĩnh & động, **0 Lỗi Lint**, **0 Type Errors**, đạt chuẩn Cognitive Complexity $\le 15$ của SonarLint.

---

## 11. Quy Chuẩn An Toàn Y Tế & Tuyên Bố Miễn Trừ

1. **Phạm Vi Nghiên Cứu & Trình Diễn**: AllerCare AI là sản phẩm nghiên cứu ứng dụng công nghệ y tế (MVP Demo) dựa trên dữ liệu giả lập chuẩn hóa. Hệ thống không thay thế cho các cơ sở khám chữa bệnh thực tế khi chưa có phê duyệt chính thức từ Hội đồng Y khoa.
2. **Quyền Quyết Định Chuyên Môn**: Mọi khuyến nghị của AI chỉ mang tính chất tham khảo (*Clinical Decision Support*). Quyết định xử trí lâm sàng, phác đồ điều trị và chỉ định dùng thuốc thuộc toàn quyền của Bác sĩ điều trị có chứng chỉ hành nghề.
3. **Bảo Mật Thông Tin Y Tế**: Mật khẩu được băm bằng thuật toán `bcrypt`, phiên làm việc quản lý qua `JWT Token`, dữ liệu lâm sàng được kiểm soát truy cập đa tầng ở Backend API, không cache dữ liệu y tế nhạy cảm vào Service Worker của trình duyệt.

---

<div align="center">
  <sub>AllerCare AI Platform • Phát triển bởi Đội ngũ Nghiên cứu & Ứng dụng Y tế Số • Bản quyền © 2026.</sub>
</div>
