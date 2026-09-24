# AllerCare AI — HƯỚNG DẪN SỬ DỤNG

> **Bản demo MVP với dữ liệu giả lập.** Không dùng cho chăm sóc thực tế.
> Mọi tên người bệnh, thuốc, quy tắc trong hệ thống đều là dữ liệu mẫu.

---

## 1. Khởi động hệ thống

### Yêu cầu
- Python 3.11+ · Node.js 18+ · Docker (để chạy PostgreSQL)

### Cách 1 — Từng bước (chi tiết, khuyến nghị lần đầu)

```bash
# 1) Khởi động database
docker compose -f infra/docker-compose.yml up -d postgres

# 2) Backend API (lần đầu)
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head          # tạo bảng
python -m app.seed_data       # tạo dữ liệu demo

# 3) Chạy API (cửa sổ riêng hoặc để chạy nền)
uvicorn app.main:app --port 8000

# 4) Frontend (cửa sổ terminal thứ hai)
cd apps/web
npm install
npm run dev
```

### Cách 2 — Script tự động
```bash
./scripts/dev.sh
```

### Kiểm tra hệ thống đã sẵn sàng
| URL | Kết quả mong đợi |
| --- | --- |
| http://localhost:8000/api/v1/healthz | `{"status":"ok","demo_mode":true}` |
| http://localhost:8000/docs | Trang Swagger API |
| http://localhost:3000/login | Trang đăng nhập AllerCare |

---

## 2. Tài khoản demo

| Vai trò | Tên đăng nhập | Mật khẩu | Ghi chú |
| --- | --- | --- | --- |
| Người bệnh | `patient1`–`patient8` | `patient123` | Ca giả lập (mỗi ca một tình huống kiểm tra an toàn) |
| **Ca lâm sàng mẫu** | `case01`–`case11` | `patient123` | 11 ca khoa Da liễu: phản vệ Diclofenac/Cefaclor/vacxin dại, nhọt da, viêm mô bào, vảy nến… |
| Bác sĩ | `doctor1` | `doctor123` | BS. Nguyễn Văn An — phụ trách phần lớn ca |
| Bác sĩ | `doctor2` | `doctor123` | BS. Trần Thị Bình — phụ trách case04, 05… |
| **Điều dưỡng** | `nurse1` | `nurse123` | ĐD. Trịnh Thu Hà — hàng đợi phân luồng mức vàng |
| Dược sĩ | `pharmacist1` | `pharma123` | DS. Nguyễn Thị Em — duyệt quy tắc |
| **Người nhà** | `family1` | `family123` | Ủy quyền theo dõi case01 — khai thay triệu chứng |
| **Lãnh đạo khoa** | `leader1` | `leader123` | Quality Dashboard — chỉ số tổng hợp ẩn danh |
| **Quản trị viên** | `admin1` | `admin123` | Quản lý tài khoản + nhật ký — không xem hồ sơ lâm sàng |

> Mỗi tài khoản demo được thiết kế để minh họa một tình huống kiểm tra an toàn khác nhau.

---

## 3. Hướng dẫn cho NGƯỜI BỆNH

### 3.1. Đăng nhập
1. Mở http://localhost:3000
2. Nhập tên đăng nhập/mật khẩu (hoặc bấm nút tài khoản demo để điền nhanh)
3. Hệ thống chuyển thẳng đến **Trang chủ người bệnh**

### 3.2. Trang chủ — xem hồ sơ
- **Xin chào + thông tin**: họ tên, giới tính, ngày sinh.
- **💊 Thuốc của tôi**: thuốc đang dùng/dự kiến, kèm nhãn trạng thái:
  - `✓ Đã xác minh` — bác sĩ đã xác nhận bạn dùng đúng thuốc này.
  - `? Chưa xác minh` — bạn tự khai, chưa được chuyên môn xác nhận.
- **🚫 Dị ứng / tiền sử**: danh sách dị ứng đã ghi nhận.
- **📋 Hướng dẫn dùng thuốc an toàn**: hướng dẫn cơ bản đã được duyệt.
- **Banner đỏ trên cùng**: nhắc gọi 115 khi khẩn cấp — ứng dụng không thay thế cấp cứu.

### 3.3. Cập nhật — khai báo thuốc & triệu chứng
**Khai thuốc đang dùng:**
1. Mục **Cập nhật** (nav dưới màn hình)
2. Nhập tên thuốc (VD: `Zyrtec 10mg`) + cách dùng (không bắt buộc)
3. Bấm **Gửi khai báo** → hiện thông báo thành công
4. Thuốc mới luôn ở trạng thái `? Chưa xác minh` cho tới khi bác sĩ xác nhận

**Báo triệu chứng:**
1. Cùng trang, mục **🩺 Báo triệu chứng**
2. Nhập triệu chứng (VD: `Ngứa tăng về đêm`) + thời điểm xuất hiện
3. Bấm **Gửi báo cáo** → theo dõi trạng thái:
   - `Đã gửi` → `Bác sĩ đã xem` → `Đã có phản hồi`

### 3.4. Hỏi đáp AI — trợ lý ảo có giới hạn
- Mục **Hỏi đáp AI**: chat trực tiếp với **Trợ lý AI AllerCare** (không phải bác sĩ/dược sĩ).
- Nút **Hội thoại mới** để bắt đầu hội thoại mới; nút **Hội thoại cũ** để mở lại các hội thoại đã lưu trên backend (chỉ mình bạn xem được).
- AI học từ **kho kiến thức của hệ thống** (`data/ai_knowledge/`): nguyên tắc chia liều của bác sĩ, ví dụ liều thực tế, yếu tố bệnh nhân (tuổi, thận, gan…).
- Hỏi về liều — VD: "Uống Glucophage 850mg bao nhiêu viên một ngày?" — AI sẽ:
  - 💊 Tham chiếu **cách bác sĩ chia liều** cho thuốc đó
  - 👤 Cá thể hóa theo **hồ sơ của chính bạn** (tuổi, CrCl, dị ứng, bệnh đồng mắc)
  - 📖 Ghi rõ **nguồn** (file + ví dụ dose-xxx)
  - ⛔ Không kê đơn, không tự ý đổi liều — khuyên gặp bác sĩ
- ⚠️ Thiếu dữ liệu (VD: chưa có xét nghiệm CrCl) → AI báo "chưa đủ dữ liệu", **không đoán liều**.
- 🚨 **Khẩn cấp** (khó thở, sưng mặt, phản vệ) → hiện "GỌI 115 NGAY"
- 🔁 Yêu cầu gặp nhân viên y tế → chuyển handoff
- Bot trả lời theo giọng thân thiện (xưng "mình" – gọi "bạn"), có gợi ý câu hỏi nhanh khi mới mở.

### 3.5. Lịch hẹn — đặt và tham gia video call
1. Mục **Lịch hẹn** → chọn thời gian + lý do → **Gửi yêu cầu hẹn**
2. Chờ trạng thái chuyển từ `Chờ xác nhận` → `Đã xác nhận`
3. Bấm **Vào phòng** → nhận link phòng demo (không ghi âm/ghi hình, link không chứa tên bạn)
4. Có thể **Hủy** lịch trước cuộc hẹn

---

## 4. Hướng dẫn cho BÁC SĨ

### 4.1. Đăng nhập & danh sách ca
1. Đăng nhập `doctor1 / doctor123` → vào **Danh sách ca**
2. Chỉ hiện người bệnh **bạn được phân công** (kiểm tra ở backend, không chỉ ẩn nút)
3. Badge `N cập nhật mới` = số triệu chứng chưa xem của ca đó
4. Bấm vào tên → mở hồ sơ chi tiết

### 4.2. Xem & xác minh dữ liệu
**Tab thuốc:**
- Xem toàn bộ thuốc người bệnh khai + thuốc dự kiến
- Bấm **Xác minh** để xác nhận đúng thực tế → nhãn chuyển `✓ Đã xác minh`
- **Thêm thuốc dự kiến**: nhập tên thuốc mới trước khi chạy kiểm tra an toàn

**Tab dị ứng:**
- Chỉ dị ứng **đã xác minh** mới được dùng cho cảnh báo MedSafe
- Bấm **Xác minh** sau khi hỏi kỹ người bệnh

**Triệu chứng:**
- Bấm **Đánh dấu đã xem** → người bệnh thấy trạng thái đổi thành "Bác sĩ đã xem"

### 4.3. Chạy kiểm tra an toàn thuốc (MedSafe) ⭐
1. Cuộn tới mục **🛡 Kiểm tra an toàn thuốc**
2. Bấm **Chạy kiểm tra an toàn**
3. Đọc kết quả — hệ thống luôn hiển thị **một trong 5 trạng thái**:

| Trạng thái | Màu | Ý nghĩa |
| --- | --- | --- |
| **⚠ Có cảnh báo** | Đỏ/cam theo mức | Có tương tác/trùng hoạt chất/dị ứng/tình trạng — kèm nguồn & phiên bản quy tắc |
| **Chưa phát hiện trong phạm vi đã kiểm tra** | Xám | KHÔNG đồng nghĩa "an toàn" |
| **ⓘ Chưa đủ dữ liệu** | Vàng đất | Liệt kê rõ thiếu gì (VD: CrCl) — cần bổ sung trước khi kết luận |
| **Ngoài phạm vi hỗ trợ** | Xám xanh | Thuốc chưa có trong danh mục (VD: thuốc dân gian) |
| **✕ Kiểm tra thất bại** | Đỏ đậm | Lỗi hệ thống — không coi như đã kiểm tra thành công |

4. Mỗi cảnh báo hiển thị: **nội dung → dữ liệu chi tiết → nguồn tài liệu + mã quy tắc + phiên bản**

### 4.4. Ghi nhận quyết định chuyên môn
Sau khi có cảnh báo, phần **Ghi nhận quyết định của bác sĩ**:
- **Đã xử lý** — bạn đã điều chỉnh theo cảnh báo (ghi chú khuyến nghị)
- **Đã xem xét** — đã đọc, cân nhắc
- **Không áp dụng (ghi lý do)** — từ chối cảnh báo, bắt buộc ghi chú
- Quyết định được lưu vào nhật ký hệ thống (AuditEvent) để truy nguyên

### 4.5. Xác nhận lịch hẹn & video call
1. Người bệnh gửi yêu cầu hẹn → bạn mở trang và **Confirm** (qua API/UI)
2. Hệ thống tạo phòng họp riêng, mã phòng ngẫu nhiên
3. Vào phòng qua `/appointments/{id}/join` — chỉ 2 bên trong cuộc hẹn được cấp quyền

---

## 5. Hướng dẫn cho DƯỢC SĨ

1. Đăng nhập `pharmacist1 / pharma123` → mục **Quy tắc**
2. Xem toàn bộ quy tắc an toàn: mã, loại (thuốc–thuốc / trùng hoạt chất / thuốc–dị ứng / thuốc–tình trạng), mức độ, nguồn
3. **Duyệt** quy tắc nháp → quy tắc bắt đầu sinh cảnh báo thực
4. **Về nháp** để ngừng một quy tắc (VD: quy tắc đang rà soát lại)
5. Quy tắc `draft` **không bao giờ** xuất hiện trong kết quả kiểm tra thực

---

## 6. Quy tắc an toàn đã tích hợp (cần hiểu trước khi dùng)

1. **Không bao giờ hiện "an toàn"** khi thiếu dữ liệu, lỗi, hoặc ngoài phạm vi — chỉ hiện "chưa phát hiện trong phạm vi đã kiểm tra".
2. **Dữ liệu người bệnh tự khai luôn gắn nhãn "chưa xác minh"** cho tới khi bác sĩ xác nhận.
3. **Không suy diễn dị ứng chéo** — chỉ khớp chính xác hoạt chất/tên đã xác minh.
4. **AI không quyết định cảnh báo** — rule engine với quy tắc có nguồn/phiên bản mới là căn cứ; chatbot chỉ trả lời theo nội dung đã duyệt.
5. **Mọi cảnh báo có nguồn**: tên tài liệu + phiên bản + mã quy tắc + phiên bản — bám truy nguyên được.
6. **Phân quyền kiểm tra ở backend từng hồ sơ** — người bệnh không xem chéo, bác sĩ chỉ xem ca được phân công.
7. **Nhật ký AuditEvent** ghi mọi thao tác quan trọng (ai, làm gì, với đối tượng nào, lúc nào).

---

## 7. Chạy kiểm thử tự động

```bash
cd services/api
source .venv/bin/activate
pytest                      # 50 test: engine, guardrails, phân quyền, các luồng
pytest tests/test_engine.py -v   # chỉ unit test rule engine
```

Kỳ vọng: **50 passed** (không fail).

## 8. Walkthrough đóng vai người dùng

```bash
./scripts/walkthrough_patient.sh   # 10 bước người bệnh (kết quả lưu /tmp/wt_*)
./scripts/walkthrough_doctor.sh    # 10 bước bác sĩ + 3 test bảo mật + dược sĩ
```

## 9. Sự cố thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| API không kết nối DB | PostgreSQL chưa chạy | `docker compose -f infra/docker-compose.yml up -d postgres` |
| Trang login trắng | Frontend chưa build xong | Chờ `npm run dev` hiện "Ready" |
| 401 sau một lúc | Token hết hạn (8 giờ) | Đăng nhập lại |
| Seed báo lỗi | DB chưa migration | Chạy `alembic upgrade head` trước |
| Chatbot trả lời ngoài phạm vi | Câu hỏi trượt keyword | Đặt câu theo chủ đề dùng thuốc hoặc nhắc tên thuốc trong kho kiến thức |
| Test fail về quyền | DB chưa seed đúng | `python -m app.seed_data` rồi chạy lại |

## 10. Cài đặt lên điện thoại (PWA)

AllerCare AI là **PWA hoàn chỉnh** — cài lên màn hình chính như app thật, không cần App Store/CH Play.

### Android (Chrome)
1. Mở ứng dụng bằng Chrome
2. Bấm nút **"⬇ Cài app"** trên góc phải header (hoặc menu ⋮ → "Thêm vào màn hình chính")
3. Xác nhận → icon AllerCare xuất hiện trên màn hình chính, mở toàn màn hình như app

### iPhone/iPad (Safari)
1. Mở ứng dụng bằng Safari
2. Bấm nút **Chia sẻ** ⬆ → cuộn xuống chọn **"Thêm vào Màn hình chính"**
3. Đặt tên → Thêm. Icon sóng biển xanh sẽ xuất hiện trên màn hình chính

### Chrome trên máy tính
- Bấm nút **"⬇ Cài app"** trên header, hoặc icon cài đặt ⊕ trên thanh địa chỉ

### Lưu ý quan trọng khi dùng PWA
- **Yêu cầu HTTPS hoặc localhost** — service worker không chạy trên HTTP thường
- **Mất mạng**: hiện trang hướng dẫn kết nối lại + nhắc gọi 115 khi khẩn cấp
- **An toàn**: ứng dụng **KHÔNG lưu hồ sơ sức khỏe trên thiết bị khi offline**; cache chỉ chứa icon/giao diện; đăng xuất tự dọn cache
- **Cập nhật**: khi có phiên bản mới, đóng và mở lại app (service worker tự tải nền)

### Các tính năng PWA đã tích hợp
| Tính năng | Chi tiết |
| --- | --- |
| App shortcuts | Giữ icon → 3 lối tắt: Cập nhật, Hỏi đáp AI, Lịch hẹn |
| Standalone | Mở không thanh địa chỉ, như app native |
| Theme màu | Thanh trạng thái điện thoại tự nhuộm màu xanh thương hiệu |
| Maskable icon | Icon tròn/vuông phù hợp mọi launcher Android |
| Offline page | Trang thân thiện khi mất mạng (không cache dữ liệu y tế) |

## 12. Truy cập từ điện thoại trong mạng LAN (HTTPS + Caddy)

PWA yêu cầu **HTTPS** (hoặc localhost) để service worker hoạt động. Script này bật HTTPS trong mạng LAN bằng Caddy với chứng chỉ nội bộ.

### Bật HTTPS LAN (chạy trên máy chủ)

```bash
./scripts/lan_https.sh dev    # hoặc: ./scripts/lan_https.sh prod
```

Script tự: phát hiện IP LAN → khởi động Caddy (HTTPS :443) → xuất root CA → in URL đầy đủ.

### Cài đặt trên điện thoại (cùng Wi-Fi, làm 1 lần)

1. **Tải CA**: mở `http://<IP-máy-chủ>:8080/ca.crt`
   - **iOS**: Settings → Profile Downloaded → Install → vào General → About → **Certificate Trust Settings** → bật tin cậy cho "Caddy Local Authority"
   - **Android**: Settings → Security → "Install a certificate" → **CA certificate** → chọn file ca.crt đã tải
2. **Mở app**: `https://<IP-máy-chủ>` → đăng nhập patient1 / patient123
   - **Android Chrome**: hiện nút **"Cài đặt ứng dụng"** → cài như app thật
   - **iOS Safari**: Chia sẻ ⬆ → **"Thêm vào Màn hình chính"**

### Cách hoạt động
| Thành phần | Vai trò |
| --- | --- |
| Caddy (:443) | Chấm hết HTTPS → /api/* sang FastAPI, phần còn lại sang Next.js |
| `default_sni` | Cho phép truy cập bằng IP (điện thoại không gửi SNI) |
| `local_certs` | Caddy tự sinh CA nội bộ, hạn 10 năm, không cần Internet |
| HTTP :8080 | Chỉ serve file ca.crt để điện thoại tải (không có dữ liệu khác) |

### Lưu ý
- IP LAN có thể đổi khi đổi Wi-Fi — chạy lại `./scripts/lan_https.sh` và cài lại CA nếu IP mới khác CA cũ (Caddy tự cấp cert cho IP mới, điện thoại đã tin CA root nên không cần cài lại)
- Chỉ dùng trong mạng LAN tin cậy cho demo; production thật cần domain + Let's Encrypt

## 13. Các phân hệ mới (theo tài liệu CHI TIẾT)

### 🚦 Phân luồng AI (TriageGuard) — mục Phân luồng của người bệnh
Người bệnh khai triệu chứng → hệ thống phân luồng theo quy tắc khoa duyệt:
- 🔴 **ĐỎ** (khó thở, sưng môi/lưỡi, choáng…): hiện nút **GỌI 115 NGAY** + báo bác sĩ/điều dưỡng/người nhà — không chờ duyệt.
- 🟡 **VÀNG** (mẩn đỏ mới, ngứa nhiều, sốt…): vào hàng đợi điều dưỡng/bác sĩ xác nhận trong 24h.
- 🟢 **XANH** (ổn định): tiếp tục theo dõi tại nhà.

### 🔍 Xếp hạng tác nhân nghi ngờ — trang Bác sĩ
Bác sĩ nhập mô tả phản ứng + thuốc toa cũ → AI xếp hạng theo nguyên tắc WHO (quan hệ thời gian,
tái diễn 2 lần, trùng dị ứng đã biết, thuốc tự mua…). Thuốc toa cũ không còn trong hồ sơ vẫn được
xếp hạng (VD: Cefaclor). Bác sĩ xác nhận → tự ghi hồ sơ dị ứng (nhãn "chưa xác minh").

### 📖 Hướng dẫn dùng thuốc — AI soạn → bác sĩ duyệt → người bệnh xác nhận
Bác sĩ chọn thuốc trong toa → AI soạn hướng dẫn dễ hiểu (không đổi liều, không thêm/bỏ thuốc) →
bác sĩ duyệt → gửi người bệnh + người nhà → người bệnh bấm **"Tôi đã hiểu cách sử dụng thuốc"**.
Bấm **"Chưa hiểu"** → hệ thống tự chuyển câu hỏi cho bác sĩ + điều dưỡng.

### 🔔 Thông báo & người nhà ủy quyền
Mỗi vai trò có kênh thông báo riêng (chuông 🔔 trên header). Người nhà được ủy quyền (family1 →
case01) khai thay triệu chứng, nhận hướng dẫn thuốc của người thân.

## 14. Giới hạn của bản demo

- Dữ liệu giả lập + 11 ca lâm sàng mẫu — chỉ phục vụ demo, không phải hồ sơ chăm sóc thực tế.
- Video call là **link phòng demo** (mô phỏng) — chưa tích hợp Jitsi thật.
- Chat AI dùng **AI ảo cục bộ** — học từ `data/ai_knowledge/`, chưa có LLM thật (kiến trúc adapter sẵn sàng nâng cấp).
- **Không thay thế** tư vấn y tế, cấp cứu, hay quyết định kê đơn. Phân luồng và xếp hạng nghi ngờ chỉ là GỢI Ý — quyết định chuyên môn thuộc về nhân viên y tế.
