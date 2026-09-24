"use client";

/* Helper PWA cho AllerCare AI.
 * - registerServiceWorker: đăng ký sw.js (chỉ production-safe, nhưng dev vẫn chạy được).
 * - usePwaInstall: hook trả về khả năng cài đặt + hàm cài app lên màn hình chính.
 * - pwaLogoutCleanup: dọn cache service worker khi đăng xuất (không cache dữ liệu y tế,
 *   nhưng dọn cho sạch theo yêu cầu "xóa dữ liệu phiên khi đăng xuất").
 */

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    // Service worker cần HTTPS hoặc localhost
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Không chặn trải nghiệm nếu SW thất bại — app vẫn chạy bình thường
    });
  });
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function pwaLogoutCleanup(): void {
  if (typeof window === "undefined") return;
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "ALLERCARE_LOGOUT" });
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("allercare-"))
              .map((k) => caches.delete(k))
          )
        )
        .catch(() => {});
    }
  } catch {
    // im lặng — đăng xuất không được fail vì cleanup
  }
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useStateSafe<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useStateSafe(false);

  useEffectSafe(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault(); // chặn mini-infobar mặc định, dùng nút của mình
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  }

  return { canInstall: !!deferredPrompt, installed, install };
}

/* Nhỏ gọn để tránh import React hooks ở nơi không cần — bọc useState/useEffect an toàn */
import { useEffect, useState } from "react";

function useStateSafe<T>(initial: T) {
  return useState<T>(initial);
}

function useEffectSafe(effect: () => void | (() => void), deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, deps);
}
