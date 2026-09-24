#!/bin/bash
# Walkthrough đóng vai BÁC SĨ (doctor1): xử lý ca, MedSafe, review, xác nhận lịch, video.
# Kèm test bảo mật truy cập chéo hồ sơ trên server thật.
set +e
cd "$(dirname "$0")/../services/api"

echo "════════ KHỞI ĐỘNG SERVER ════════"
.venv/bin/uvicorn app.main:app --port 8000 > /tmp/allercare-walk2.log 2>&1 &
API_PID=$!
sleep 3

H() { curl -s -m 10 "$@"; }
CODE() { curl -s -m 10 -o /dev/null -w "%{http_code}" "$@"; }

login() {
  H -X POST http://localhost:8000/api/v1/auth/login \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$1&password=$2" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
}

echo ""
echo "════════ 👨‍⚕️ BƯỚC 1: Đăng nhập bác sĩ ════════"
DTOKEN=$(login doctor1 doctor123)
[ -n "$DTOKEN" ] && echo "✅ doctor1 đăng nhập OK" || { echo "❌ fail"; kill $API_PID; exit 1; }

echo ""
echo "════════ 👨‍⚕️ BƯỚC 2: Danh sách ca được phân công ════════"
H http://localhost:8000/api/v1/patients/assigned -H "Authorization: Bearer $DTOKEN" | python3 -c "
import sys, json
for p in json.load(sys.stdin):
    badge = f\" → {p['unseen_updates']} cập nhật mới\" if p['unseen_updates'] else ''
    print(f\"   · {p['full_name']} ({p['gender']}, {p['dob']}){badge}\")"

PID_=$(cat /tmp/wt_patient_token >/dev/null 2>&1 && echo "")
# Lấy profile_id patient1 qua đăng nhập người bệnh
PTOKEN=$(login patient1 patient123)
PID_=$(H http://localhost:8000/api/v1/patients/me/profile -H "Authorization: Bearer $PTOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo ""
echo "════════ 👨‍⚕️ BƯỚC 3: Mở ca Lê Văn Cường — xem chi tiết ════════"
echo "— Thuốc:"
H http://localhost:8000/api/v1/patients/$PID_/medications -H "Authorization: Bearer $DTOKEN" | python3 -c "
import sys, json
for m in json.load(sys.stdin):
    print(f\"   · {m['raw_name']} [{m['verification']}]\")" | head -8
echo "— Dị ứng:"
H http://localhost:8000/api/v1/patients/$PID_/allergies -H "Authorization: Bearer $DTOKEN" | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    print(f\"   · {a['substance']}: {a['reaction']} [{a['verification']}]\")"

echo ""
echo "════════ 👨‍⚕️ BƯỚC 4: Xác minh thuốc Amoxicillin (dự kiến) ════════"
MED_ID=$(H http://localhost:8000/api/v1/patients/$PID_/medications -H "Authorization: Bearer $DTOKEN" | python3 -c "
import sys, json
for m in json.load(sys.stdin):
    if 'Amoxicillin' in m['raw_name']:
        print(m['id']); break")
RES=$(H -X POST http://localhost:8000/api/v1/patients/$PID_/verify-medication/$MED_ID \
  -H "Authorization: Bearer $DTOKEN" -H "Content-Type: application/json" -d '{"verify": true}')
echo "✅ Kết quả: $RES"

echo ""
echo "════════ 👨‍⚕️ BƯỚC 5: Đánh dấu đã xem triệu chứng ════════"
OBS_ID=$(H http://localhost:8000/api/v1/patients/$PID_/observations -H "Authorization: Bearer $DTOKEN" | python3 -c "
import sys, json
for o in json.load(sys.stdin):
    if o['status'] == 'sent':
        print(o['id']); break")
if [ -n "$OBS_ID" ]; then
  RES=$(H -X POST http://localhost:8000/api/v1/patients/$PID_/observations/$OBS_ID/status \
    -H "Authorization: Bearer $DTOKEN" -H "Content-Type: application/json" -d '{"status": "seen"}')
  echo "✅ $RES"
else
  echo "ℹ Không còn cập nhật chưa xem (đã xem hết ở lần chạy trước)"
fi

echo ""
echo "════════ 👨‍⚕️ BƯỚC 6: Chạy MedSafe — dị ứng Penicillin vs Amoxicillin ════════"
CHECK=$(H -X POST http://localhost:8000/api/v1/safety-checks \
  -H "Authorization: Bearer $DTOKEN" -H "Content-Type: application/json" \
  -d "{\"profile_id\": \"$PID_\"}")
echo "$CHECK" | python3 -c "
import sys, json
d = json.load(sys.stdin)
r = d['result']
print(f\"Trạng thái: {r['status']}\")
print(f\"Ghi chú:   {r['note']}\")
for a in r['alerts']:
    print(f\"  ⚠ [{a['severity']}] {a['message'][:80]}\")
    print(f\"     Nguồn: {a['source']} · {a['rule_code']} v{a['rule_version']}\")
if r['missing_data']: print(f\"  Thiếu dữ liệu: {r['missing_data']}\")
if r['out_of_scope']: print(f\"  Ngoài phạm vi: {r['out_of_scope']}\")
"
CHECK_ID=$(echo "$CHECK" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "$CHECK_ID" > /tmp/wt_check_id

echo ""
echo "════════ 👨‍⚕️ BƯỚC 7: Ghi nhận quyết định chuyên môn ════════"
RES=$(H -X POST http://localhost:8000/api/v1/safety-checks/$CHECK_ID/reviews \
  -H "Authorization: Bearer $DTOKEN" -H "Content-Type: application/json" \
  -d '{"decision": "action_taken", "note": "Ngừng Amoxicillin, đổi kháng sinh nhóm khác theo chuyên môn"}')
echo "✅ Review: $RES"

echo ""
echo "════════ 👨‍⚕️ BƯỚC 8: Xác nhận lịch hẹn chờ của người bệnh ════════"
APPT_ID=$(cat /tmp/wt_appt_id 2>/dev/null)
if [ -n "$APPT_ID" ]; then
  RES=$(H -X POST http://localhost:8000/api/v1/appointments/$APPT_ID/confirm -H "Authorization: Bearer $DTOKEN")
  echo "✅ $RES" | head -c 200; echo ""
  echo "— Người bệnh vào phòng:"
  JOIN=$(H -X POST http://localhost:8000/api/v1/appointments/$APPT_ID/join -H "Authorization: Bearer $PTOKEN")
  echo "$JOIN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"   Phòng: {d['room_url']}\")
print(f\"   Ghi hình bị chặn: {d['recording_disabled']}\")
print(f\"   Mã phòng không chứa tên người bệnh: {'Lê' not in d['room_code'] and 'Cường' not in d['room_code']}\")"
else
  echo "ℹ Không có lịch hẹn chờ (bỏ qua)"
fi

echo ""
echo "════════ 🔒 BƯỚC 9: TEST BẢO MẬT — truy cập chéo hồ sơ ════════"
# doctor2 (không phụ trách patient1) cố đọc hồ sơ patient1
D2TOKEN=$(login doctor2 doctor123)
C1=$(CODE http://localhost:8000/api/v1/patients/$PID_ -H "Authorization: Bearer $D2TOKEN")
[ "$C1" = "403" ] && echo "✅ doctor2 đọc hồ sơ ca của doctor1 → 403 chặn đúng" || echo "❌ doctor2 vào được hồ sơ (HTTP $C1)!"

# patient2 cố thêm thuốc vào hồ sơ patient1
P2TOKEN=$(login patient2 patient123)
C2=$(CODE -X POST http://localhost:8000/api/v1/patients/$PID_/medications \
  -H "Authorization: Bearer $P2TOKEN" -H "Content-Type: application/json" -d '{"raw_name":"hack"}')
[ "$C2" = "403" ] && echo "✅ patient2 ghi vào hồ sơ patient1 → 403 chặn đúng" || echo "❌ patient2 ghi được hồ sơ người khác (HTTP $C2)!"

# Token giả mạo
C3=$(CODE http://localhost:8000/api/v1/patients/me/profile -H "Authorization: Bearer fake.token.here")
[ "$C3" = "401" ] && echo "✅ Token giả mạo → 401 chặn đúng" || echo "❌ Token giả vẫn vào được (HTTP $C3)!"

echo ""
echo "════════ 👨‍⚕️ BƯỚC 10: Dược sĩ duyệt quy tắc ════════"
PHtoken=$(login pharmacist1 pharma123)
RULE_ID=$(H http://localhost:8000/api/v1/rules -H "Authorization: Bearer $PHtoken" | python3 -c "
import sys, json
for r in json.load(sys.stdin):
    if r['code'] == 'DC004' and r['status'] == 'draft':
        print(r['id']); break")
RES=$(H -X POST http://localhost:8000/api/v1/rules/$RULE_ID/status \
  -H "Authorization: Bearer $PHtoken" -H "Content-Type: application/json" -d '{"status": "approved"}')
echo "Duyệt DC004 (nháp): $RES"
# Trả lại trạng thái draft như ban đầu
H -X POST http://localhost:8000/api/v1/rules/$RULE_ID/status \
  -H "Authorization: Bearer $PHtoken" -H "Content-Type: application/json" -d '{"status": "draft"}' >/dev/null
echo "✅ Đã trả DC004 về nháp (quy tắc nháp không bao giờ cảnh báo)"

echo ""
kill $API_PID 2>/dev/null
echo "════════ HOÀN TẤT PHẦN BÁC SĨ + BẢO MẬT ════════"
