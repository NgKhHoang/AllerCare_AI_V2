# AllerCare AI — Đặc tả triển khai theo tài liệu CHI TIẾT

> Tài liệu này ánh xạ 1:1 giữa **tài liệu "CHI TIẾT các vấn đề"** (file `CHI TIẾT.docx`) và
> phần đã triển khai trong code. Dùng cho review, demo và làm việc với chuyên môn.
> Ngày cập nhật: 23/09/2026 · Backend: FastAPI + PostgreSQL · Frontend: Next.js PWA

---

## I. SÁU VẤN ĐỀ → TRẠNG THÁI TRIỂN KHAI

### 1. Hỗ trợ xác định tác nhân nghi ngờ gây dị ứng / phản vệ — ✅ HOÀN THÀNH

| Yêu cầu tài liệu | Triển khai |
| --- | --- |
| Thu thập toàn bộ thuốc (mọi nguồn) | `POST /patients/{id}/medications` — BV kê, BV khác, tự mua, OTC, TPCN, đông y, kèm ảnh toa |
| Ghi nhận thời điểm dùng / khởi phát | `MedicationRecord.timing`, `start_date`, `last_reaction`; mô tả phản ứng trong suspect ranking |
| Đối chiếu toa cũ ↔ toa mới | `POST /triage/suspect-ranking` với `previous_episode_drugs` — thuốc toa cũ **không còn trong hồ sơ** vẫn được xếp hạng |
| Xếp hạng tác nhân nghi ngờ | `services/api/app/modules/triage/suspect_engine.py` — thang điểm WHO: quan hệ thời gian (+2), xuất hiện cả 2 lần (+4), trùng dị ứng đã xác minh (+3), tự mua/OTC (+1), nguyên nhân thay thế (−2) → mức `high` (≥5) / `possible` (≥2) / `low` |
| Tóm tắt cho bác sĩ kiểm tra | `build_summary()` — kèm căn cứ từng yếu tố, nhắc "theo WHO thường chỉ đạt possible/probable" |
| Bác sĩ xác nhận trước khi ghi hồ sơ | `POST /triage/suspect-ranking/{id}/confirm` → tự tạo `AllergyRecord` nhãn **unverified** |
| AI chỉ gợi ý, không kết luận | Engine thuần dữ liệu; xác nhận là bắt buộc; audit log mọi bước |

**Kiểm chứng thật:** ca case02 (NGUYỄN KÈO, phản vệ tái diễn) → Cefaclor xếp hạng #1 mức HIGH (5 điểm) đúng bức tranh lâm sàng.

### 2. Kết nối và theo dõi người bệnh sau điều trị — ✅ HOÀN THÀNH

| Yêu cầu tài liệu | Triển khai |
| --- | --- |
| Đặt lịch tư vấn, video call | Mục Lịch hẹn có sẵn (`/patient/appointments`, appointments + consultation rooms) |
| Gửi câu hỏi / cập nhật triệu chứng | `POST /patients/{id}/observations` + dòng thời gian trong portal bác sĩ |
| Gửi hình ảnh tổn thương da | `ObservationIn.image_url` — hiển thị 📷 trong danh sách, "[kèm ảnh]" trong AI tóm tắt |
| Khai biểu hiện bất thường sau dùng thuốc | `MedicationRecord.last_reaction`, ngừng thuốc kèm lý do `POST /medications/{id}/stop` |
| Bác sĩ theo dõi dòng thời gian | Portal bác sĩ: observations + trạng thái sent → seen → responded |
| AI tổng hợp thành bản tóm tắt | `GET /patients/{id}/ai-summary` — tổng hợp triệu chứng/thuốc theo nguồn/dị ứng/phân luồng, mỗi dòng gắn nguồn, có disclaimer "không chẩn đoán" |
| Người nhà khai thay khi được ủy quyền | `CaregiverLink` + `get_owned_patient_profile` cho phép caregiver khai thuốc/triệu chứng thay |

### 3. TriageGuard AI — sàng lọc, phân loại 3 mức — ✅ HOÀN THÀNH

| Mức | Hành động hệ thống (đúng bảng tài liệu) |
| --- | --- |
| 🟢 Xanh — nhẹ, ổn định | Hướng dẫn theo dõi, ghi nhận, đúng chỉ định (`data/safety/triage_rules.json` → green patterns) |
| 🟡 Vàng — mới/tăng dần/cần đánh giá | Yêu cầu liên hệ bác sĩ sớm ≤24h + vào hàng đợi NVYT (`GET /triage/queue`, `POST /triage/{id}/confirm`), thông báo bác sĩ + điều dưỡng |
| 🔴 Đỏ — khó thở, phù môi lưỡi, choáng, tiến triển nhanh | Cảnh báo cấp cứu NGAY (nút GỌI 115), thông báo bác sĩ + điều dưỡng + người bệnh + người nhà — **không chờ duyệt** |

- Quy tắc nằm trong `data/safety/triage_rules.json` do khoa phê duyệt — AI KHÔNG tự đoán từ khóa.
- Tăng mức tối thiểu lên vàng khi: dị ứng mức cao đã xác minh / tái dùng thuốc nghi ngờ (high_risk_context).
- Bảo lưu quy định Bộ Y tế: chẩn đoán, phân độ, xử trí phản vệ thuộc chuyên môn (`ydct.moh.gov.vn`).

### 4. Giải thích toa thuốc và nhắc tái khám — ✅ HOÀN THÀNH

| Yêu cầu tài liệu | Triển khai |
| --- | --- |
| Toa → AI soạn hướng dẫn dễ hiểu | `POST /guides/draft/{medication_id}` — tên, hoạt chất, mục đích, liều, thời điểm, cách dùng, lưu ý, dấu hiệu nguy, tái khám |
| AI KHÔNG đổi liều/thêm bỏ thuốc/ngừng thuốc/viết khác toa | `_draft_from_medication()` bám sát `MedicationRecord` gốc — dose lấy nguyên văn từ toa; test assert liều không đổi |
| Bác sĩ duyệt → gửi người bệnh + người nhà | `POST /guides/{id}/approve` → notification cho patient + mọi caregiver ủy quyền |
| Nút "Tôi đã hiểu cách sử dụng thuốc" | `POST /guides/{id}/acknowledge` `understood` / `not_understood` |
| "Chưa hiểu" → chuyển bác sĩ/điều dưỡng | Tự tạo notification cho doctor + nurse + xác nhận lại cho người bệnh |
| Nhắc uống theo giờ | `timing` ("8h và 20h") hiển thị trong hướng dẫn + danh sách thuốc |
| Hình ảnh thuốc | Ghi nhận `image_url` (toa/bao bì) — demo dùng tên file, sẵn sàng ghích upload |

### 5. Đối soát và quản lý danh sách thuốc (WHO reconciliation) — ✅ HOÀN THÀNH

| Yêu cầu tài liệu | Triển khai |
| --- | --- |
| Nguồn thuốc: BV Thống Nhất, BV/phòng khám khác, tự mua, OTC, TPCN, đông y, bôi/nhỏ/tiêm, đã ngừng | `source_label` + `status` (active/stopped/irregular) + `route` |
| Trường dữ liệu: tên, ảnh, liều, thời điểm, ngày bắt đầu, người kê, trạng thái, lần dùng gần nhất, biểu hiện sau dùng, lý do ngừng | Đủ các cột `raw_name, image_url, dose, timing, start_date, prescriber, status, stop_reason, last_reaction` trong `medication_records` |
| Người bệnh chụp toa → xác nhận thông tin | Form "Đối soát thuốc" trong `/patient/updates` + ảnh toa |
| Bác sĩ nhận thông báo thuốc mới | Notification `guide_approved`/audit — thuốc mới luôn `unverified` |
| Hệ thống kiểm tra trùng, dị ứng, tương tác | Tự chạy qua MedSafe khi bác sĩ bấm kiểm tra an toàn |
| Bác sĩ xác nhận mới vào hồ sơ chính thức | `POST /patients/{id}/verify-medication/{med_id}` — chỉ verified mới được tin cho cảnh báo |

Nguồn: WHO Medication Regression WHO/UHC/SDS/2019.9 (ghi trong `knowledge_sources`).

### 6. Hệ thống cảnh báo an toàn — 9 loại × 3 mức — ✅ HOÀN THÀNH

| # | Cảnh báo | Rule code | Trạng thái |
| --- | --- | --- | --- |
| 1 | Dấu hiệu nghi ngờ phản vệ | qua TriageGuard red + suspect ranking | ✅ |
| 2 | Dùng lại thuốc từng gây phản ứng | DA001–DA007 (khớp dị ứng đã xác minh) + suspect in_both_episodes | ✅ |
| 3 | Tương tác thuốc–thuốc | DD001–DD005 | ✅ (từ Phase 6) |
| 4 | Thuốc–bệnh nền | DC001–DC007 (kể cả theo xét nghiệm + theo bệnh nền) | ✅ |
| 5 | Trùng hoạt chất | DI001–DI006 | ✅ |
| 6 | Dùng sai liều / trùng liều | **DL001 (mới)** — pattern "uống gấp đôi/bù liều" + DR001 trùng biệt dược | ✅ |
| 7 | Bỏ liều / dùng không đều | **DL002 (mới)** — thuốc ở trạng thái `irregular` | ✅ |
| 8 | Triệu chứng tiến triển nặng | TriageGuard red patterns (mẩn + khó thở, môi tím…) | ✅ |
| 9 | Thuốc chưa được bác sĩ kiểm tra | **UM001** — thuốc đang dùng chưa verified | ✅ |

Quy trình 3 mức theo bảng tài liệu: đỏ → cảnh báo cấp cứu + bác sĩ ưu tiên cao, không chờ duyệt;
vàng → khuyến nghị liên hệ sớm + danh sách cần kiểm tra; xanh → lưu hồ sơ theo dõi.
Engine luôn trả **5 trạng thái trung thực** (có cảnh báo / chưa phát hiện trong phạm vi / chưa đủ
dữ liệu / ngoài phạm vi / thất bại) — không bao giờ nói "an toàn" khi thiếu dữ liệu.

---

## II. CẤU TRÚC SẢN PHẨM — 5 PHÂN HỆ

| Phân hệ tài liệu | Trong code |
| --- | --- |
| 1. AllerCare Patient | `/patient/*` — Trang chủ, **Phân luồng**, Cập nhật (đối soát + ảnh), Hỏi đáp AI, Lịch hẹn, Hướng dẫn, Thông báo |
| 2. AllerCare Clinical | `/doctor` (dòng thời gian, MedSafe, xếp hạng nghi ngờ, AI tóm tắt, hướng dẫn) + `/nurse` (hàng đợi vàng) + `/pharmacist` (quy tắc) |
| 3. MedSafe AI | `services/api/app/modules/safety/` (engine 8 nhóm quy tắc + 5 trạng thái) + `modules/triage/suspect_engine.py` |
| 4. TriageGuard AI | `services/api/app/modules/triage/engine.py` + `data/safety/triage_rules.json` |
| 5. Quality Dashboard | `/leader` + `GET /dashboard/quality` — số liệu tổng hợp ẩn danh (phân luồng, cảnh báo, thời gian phản hồi, xếp hạng) |

## III. 7 TÁC NHÂN NGƯỜI DÙNG — ✅ ĐỦ

| Tác nhân | Tài khoản demo | Quyền chính (kiểm tra ở backend) |
| --- | --- | --- |
| Người bệnh | `patient1`–`patient8`, `case01`–`case11` | Khai báo, nhận hướng dẫn, phân luồng, hỏi đáp AI |
| Người nhà/chăm sóc | `family1` (ủy quyền case01) | Khai thay, nhận cảnh báo + hướng dẫn người thân |
| Bác sĩ | `doctor1`, `doctor2` | Xác nhận gợi ý AI, xử trí, duyệt hướng dẫn |
| Điều dưỡng | `nurse1`, `nurse2` | Hàng đợi cảnh báo, xác nhận phân luồng, xem tóm tắt |
| Dược sĩ | `pharmacist1` | Duyệt quy tắc, xem hồ sơ thuốc |
| Lãnh đạo khoa/QLCL | `leader1` | CHỈ dashboard tổng hợp ẩn danh — không lâm sàng |
| Quản trị viên | `admin1` | Tài khoản + nhật ký — KHÔNG tự xem dữ liệu lâm sàng |

---

## IV. DỮ LIỆU & AI

- Toàn bộ dữ liệu tách riêng ở `data/`:
  - `catalog/` — 80 thuốc thật + 61 hoạt chất (11 ca Da liễu)
  - `safety/` — safety_rules (29 quy tắc, 8 nguồn), triage_rules, knowledge_sources
  - `demo/` — accounts (27), cases (8 giả lập + 11 ca thật)
  - `ai_knowledge/` — **thư mục duy nhất AI đọc** để học cách chia liều của bác sĩ
- AI mock cục bộ (không Internet, không bịa số): thiếu dữ liệu → nói thiếu, luôn gắn nguồn, bác sĩ duyệt trước khi ghi hồ sơ.
- Kiến trúc adapter sẵn sàng nâng cấp LLM thật qua `AI_PROVIDER`.

## V. API MỚI THEO TÀI LIỆU

| Endpoint | Vai trò | Mục đích |
| --- | --- | --- |
| `POST /api/v1/triage` | patient, caregiver | Khai triệu chứng → phân luồng xanh/vàng/đỏ |
| `GET /triage/queue` + `POST /triage/{id}/confirm` | nurse, doctor | Hàng đợi vàng + xác nhận |
| `POST /triage/suspect-ranking` | doctor, pharmacist, nurse | Xếp hạng tác nhân nghi ngờ (WHO) |
| `POST /triage/suspect-ranking/{id}/confirm` | doctor | Xác nhận → ghi dị ứng unverified |
| `POST /guides/draft/{med_id}` → `/{id}/approve` → `/{id}/acknowledge` | doctor → patient | Soạn → duyệt → "Tôi đã hiểu" |
| `GET /patients/{id}/ai-summary` | doctor, nurse | AI tóm tắt diễn biến (chỉ tổng hợp) |
| `POST /patients/{id}/medications` | patient, caregiver | Đối soát thuốc mọi nguồn + ảnh toa |
| `POST /patients/{id}/medications/{id}/stop` | patient | Ngừng thuốc kèm lý do |
| `GET /dashboard/quality` | leader | Chỉ số chất lượng ẩn danh |
| `GET/POST /admin/*` | admin | Tài khoản + nhật ký |
| `GET/POST /notifications*` | mọi vai trò | Kênh thông báo riêng |

## VI. KIỂM THỬ

- `tests/test_new_modules.py` — 13 test: triage 3 mức, suspect ranking, guides, notifications, dashboard, admin, caregiver.
- `tests/test_reconciliation.py` — 6 test: khai thuốc mọi nguồn + ảnh, ngừng thuốc, caregiver ủy quyền, DL001/DL002, ảnh tổn thương + AI tóm tắt.
- Toàn bộ suite: **86/86 pass** · TypeScript typecheck sạch · Kiểm chứng end-to-end trên Docker.
