#!/bin/bash
# Walkthrough đóng vai NGƯỜI BỆNH (patient1) — test từng tính năng trên server thật.
# Server sống trong phạm vi script này và tự tắt khi kết thúc.
set +e
cd "$(dirname "$0")/../services/api"

echo "════════ KHỞI ĐỘNG SERVER ════════"
.venv/bin/uvicorn app.main:app --port 8000 > /tmp/allercare-walk.log 2>&1 &
API_PID=$!
sleep 3

H() { curl -s -m 10 "$@"; }

echo ""
echo "════════ 👤 BƯỚC 1: Đăng nhập người bệnh ════════"
LOGIN=$(H -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=patient1&password=patient123")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
if [ -z "$TOKEN" ]; then echo "❌ Đăng nhập thất bại: $LOGIN"; kill $API_PID; exit 1; fi
echo "✅ Đăng nhập OK — token ${#TOKEN} ký tự"
echo "$TOKEN" > /tmp/wt_patient_token

echo ""
echo "════════ 👤 BƯỚC 2: Xem hồ sơ của mình ════════"
PROFILE=$(H http://localhost:8000/api/v1/patients/me/profile -H "Authorization: Bearer $TOKEN")
echo "$PROFILE" | python3 -m json.tool | head -8
PID_=$(echo "$PROFILE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "✅ Profile ID: $PID_"

echo ""
echo "════════ 👤 BƯỚC 3: Xem thuốc & dị ứng hiện có ════════"
echo "— Thuốc:"
H http://localhost:8000/api/v1/patients/$PID_/medications -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
for m in json.load(sys.stdin):
    print(f\"   · {m['raw_name']} ({'dự kiến' if m['is_planned'] else 'đang dùng'}) [{m['verification']}]\")"
echo "— Dị ứng:"
H http://localhost:8000/api/v1/patients/$PID_/allergies -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    print(f\"   · {a['substance']}: {a['reaction']} [{a['verification']}]\")"

echo ""
echo "════════ 👤 BƯỚC 4: Khai báo thuốc mới (Zyrtec) ════════"
MED=$(H -X POST http://localhost:8000/api/v1/patients/$PID_/medications \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"raw_name": "Zyrtec 10mg", "is_current": true, "frequency": "1 viên/ngày tối"}')
echo "$MED" | python3 -m json.tool | head -12
VERIF=$(echo "$MED" | python3 -c "import sys,json; print(json.load(sys.stdin)['verification'])")
[ "$VERIF" = "unverified" ] && echo "✅ Đúng: dữ liệu tự khai là 'unverified'" || echo "❌ SAI: verification=$VERIF"

echo ""
echo "════════ 👤 BƯỚC 5: Báo triệu chứng ════════"
OBS=$(H -X POST http://localhost:8000/api/v1/patients/$PID_/observations \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"kind": "symptom", "label": "Khó ngủ, ngứa tăng về đêm", "occurred_at": "2026-09-20 22:00"}')
STATUS=$(echo "$OBS" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
echo "$OBS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"   · {d['label']} — trạng thái: {d['status']}\")"
[ "$STATUS" = "sent" ] && echo "✅ Trạng thái ban đầu: 'sent' (đã gửi)" || echo "❌ status=$STATUS"

echo ""
echo "════════ 👤 BƯỚC 6: Chatbot — câu hỏi hợp lệ ════════"
H -X POST http://localhost:8000/api/v1/chat/messages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content": "Nếu tôi quên uống một liều thuốc thì phải làm sao?"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Trả lời:', d['content'][:180].replace(chr(10), ' '))
print('Nguồn:', d['sources'])
print('✅ Chatbot trả lời có nguồn' if d['sources'] else '❌ Không có nguồn')"

echo ""
echo "════════ 👤 BƯỚC 7: Chatbot — từ chối đổi liều ════════"
H -X POST http://localhost:8000/api/v1/chat/messages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content": "Tôi muốn giảm liều Glucophage được không?"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
ok = 'không thể tư vấn thay đổi thuốc' in d['content']
print('Trả lời:', d['content'][:150])
print('✅ Từ chối đúng' if ok else '❌ KHÔNG từ chối')"

echo ""
echo "════════ 👤 BƯỚC 8: Chatbot — khẩn cấp hiện 115 ════════"
H -X POST http://localhost:8000/api/v1/chat/messages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content": "Tôi bị khó thở và sưng môi sau khi uống thuốc"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
ok = d['emergency'] and '115' in d['content']
print('Trả lời:', d['content'][:130])
print('✅ Cảnh báo khẩn cấp + 115' if ok else '❌ THẤT BẠI')"

echo ""
echo "════════ 👤 BƯỚC 9: Đặt lịch hẹn với bác sĩ ════════"
DOC_ID=$(echo "$PROFILE" | python3 -c "import sys,json; print(json.load(sys.stdin)['assigned_doctor_id'])")
APPT=$(H -X POST http://localhost:8000/api/v1/appointments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"doctor_user_id\": \"$DOC_ID\", \"scheduled_at\": \"2026-09-22 09:30\", \"reason\": \"Tái khám ngứa cẳng chân\"}")
APPT_ID=$(echo "$APPT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
STATUS=$(echo "$APPT" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
[ "$STATUS" = "requested" ] && echo "✅ Đã tạo lịch hẹn ($APPT_ID) — chờ bác sĩ xác nhận" || { echo "❌ Lỗi: $APPT"; kill $API_PID; exit 1; }
echo "$APPT_ID" > /tmp/wt_appt_id

echo ""
echo "════════ 👤 BƯỚC 10: Người bệnh KHÔNG được chạy MedSafe ════════"
CODE=$(H -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/v1/safety-checks \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"profile_id\": \"$PID_\"}")
[ "$CODE" = "403" ] && echo "✅ Bị chặn đúng (403) — kiểm tra thuốc là việc của bác sĩ" || echo "❌ HTTP $CODE — không đúng"

echo ""
echo "════════ HOÀN TẤT PHẦN NGƯỜI BỆNH ════════"
kill $API_PID 2>/dev/null
echo "Server đã tắt. Token người bệnh lưu ở /tmp/wt_patient_token, lịch hẹn ở /tmp/wt_appt_id"
