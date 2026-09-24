#!/bin/bash
# Bật HTTPS cho AllerCare AI trong mạng LAN bằng Caddy.
#
# Làm gì:
#   1. Phát hiện IP LAN của máy (en0/en1/eth0...)
#   2. Ghi infra/.env.lan (LAN_IP, HTTP_PORT)
#   3. docker compose up caddy (HTTPS :443, HTTP :8080 để tải CA)
#   4. Xuất root CA của Caddy ra infra/caddy/data/caddy-root/ca.crt
#   5. In URL + hướng dẫn cài CA trên điện thoại
#
# Dùng: ./scripts/lan_https.sh [dev|prod]   (mặc định dev)
set -e
cd "$(dirname "$0")/.."

MODE="${1:-dev}"
COMPOSE_FILE="infra/docker-compose.yml"
[ "$MODE" = "prod" ] && COMPOSE_FILE="infra/docker-compose.prod.yml"

echo "== [1/5] Phát hiện IP LAN =="
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LAN_IP" ]; then
  echo "❌ Không tìm thấy IP LAN. Kiểm tra Wi-Fi/Ethernet rồi chạy lại."
  exit 1
fi
echo "   IP LAN: $LAN_IP"

HTTP_PORT=8080
echo "HTTP_PORT=$HTTP_PORT" > infra/.env.lan
echo "LAN_IP=$LAN_IP" >> infra/.env.lan
echo "   Đã ghi infra/.env.lan"

echo ""
echo "== [2/5] Khởi động service caddy ($MODE) =="
if [ "$MODE" = "prod" ]; then
  docker compose --env-file infra/.env.prod --env-file infra/.env.lan -f "$COMPOSE_FILE" -p allercare-prod up -d caddy
else
  docker compose --env-file infra/.env.lan -f "$COMPOSE_FILE" up -d caddy
fi

echo ""
echo "== [3/5] Chờ Caddy cấp cert =="
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -sk -m 3 -o /dev/null "https://$LAN_IP/api/v1/healthz"; then
    echo "   HTTPS đã sẵn sàng"
    break
  fi
  echo "   ...chờ ($i/10)"
done

echo ""
echo "== [4/5] Xuất root CA cho điện thoại =="
CA_CONTAINER=$(docker ps --filter name=allercare-caddy --format "{{.Names}}" | head -1)
if [ -n "$CA_CONTAINER" ]; then
  docker exec "$CA_CONTAINER" sh -c 'cat /data/caddy/pki/authorities/local/root.crt' > /tmp/allercare-root-ca.crt 2>/dev/null || true
  mkdir -p infra/caddy/data/caddy-root
  if [ -s /tmp/allercare-root-ca.crt ]; then
    cp /tmp/allercare-root-ca.crt infra/caddy/data/caddy-root/ca.crt
    echo "   ✓ CA tại: infra/caddy/data/caddy-root/ca.crt (được serve tại http://$LAN_IP:$HTTP_PORT/ca.crt)"
  else
    echo "   ⚠ Chưa lấy được root.crt — thử lại sau 10s: docker exec $CA_CONTAINER cat /data/caddy/pki/authorities/local/root.crt"
  fi
fi

echo ""
echo "== [5/5] Truy cập từ điện thoại =="
cat <<EOF

  📱 Trên điện thoại (cùng Wi-Fi):

  1. Tải và cài CA:   http://$LAN_IP:$HTTP_PORT/ca.crt
     - iOS: Settings → Profile Downloaded → Install → General → About → Certificate Trust Settings → bật tin cậy
     - Android: Settings → Security → Install from storage → chọn ca.crt (VPN & apps / CA certificate)

  2. Mở trình duyệt:  https://$LAN_IP
     - Đăng nhập patient1 / patient123 (hoặc doctor1 / doctor123)
     - Chrome Android sẽ hiện nút "Cài đặt ứng dụng" (PWA install)
     - iOS Safari: Chia sẻ → "Thêm vào Màn hình chính"

  ⚠ Lưu ý: dữ liệu đi trong mạng LAN qua HTTPS tự ký — chỉ dùng demo, không phải production.
EOF
