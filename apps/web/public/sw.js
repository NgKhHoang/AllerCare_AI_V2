/* AllerCare AI — Service Worker
 *
 * Ràng buộc an toàn (README mục 10):
 * - KHÔNG BAO GIỜ cache request/response của /api/* (dữ liệu sức khỏe).
 * - KHÔNG cache khi offline những gì thuộc hồ sơ người bệnh.
 * - Chỉ cache tài nguyên tĩnh (icon, offline.html) để mở app nhanh và có trang offline thân thiện.
 * - Đăng xuất phải gọi self.skipCacheCleanup() qua message để dọn cache (xem lib/pwa.ts).
 */
const VERSION = "allercare-v1";
const STATIC_CACHE = `${VERSION}-static`;

// Chỉ cache đúng các tài nguyên tĩnh liệt kê trước (precache)
const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/favicon-32.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1) API: LUÔN đi thẳng mạng — không đọc, không ghi cache. Mất mạng thì để app tự báo lỗi.
  if (isApiRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2) Điều hướng trang: network-first, có timeout ngắn; lỗi thì trả trang offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      Promise.race([
        fetch(event.request),
        new Promise((resolve) =>
          setTimeout(() => resolve(caches.match("/offline.html")), 4000)
        ),
      ]).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // 3) Tĩnh cùng nguồn: cache-first (đã precache), cập nhật ngầm sau khi trả.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            // Chỉ cache response hợp lệ, cùng nguồn, không phải API
            if (
              response &&
              response.status === 200 &&
              response.type === "basic" &&
              !isApiRequest(new URL(response.url))
            ) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
  // 4) Nguồn khác (nếu có): đi thẳng mạng.
});

// Dọn cache khi đăng xuất — nhận message từ trang (lib/pwa.ts)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ALLERCARE_LOGOUT") {
    caches.keys().then((keys) =>
      keys
        .filter((k) => k.startsWith("allercare-"))
        .forEach((k) => caches.delete(k))
    );
  }
});
