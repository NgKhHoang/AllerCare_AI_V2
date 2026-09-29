"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "../lib/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login");
    } else if (user.role === "doctor" || user.role === "pharmacist") {
      router.replace("/doctor");
    } else {
      router.replace("/patient");
    }
  }, [router]);

  return (
    <main className="login-wrap">
      <div style={{ textAlign: "center", maxWidth: 360, width: "100%" }}>
        <div className="brand-dot" style={{ width: 64, height: 64, fontSize: 30, margin: "0 auto 14px" }}>
          🌊
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, color: "var(--brand-600)", marginBottom: 6 }}>
          AllerCare AI
        </div>
        <p className="muted" style={{ marginBottom: 16 }}>Đang chuyển hướng vào hệ thống…</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="/login" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>
            🔑 Vào màn hình Đăng nhập
          </a>
          <a href="/doctor" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
            🩺 Vào Cổng Bác sĩ
          </a>
          <a href="/patient" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
            👤 Vào Cổng Người bệnh
          </a>
        </div>
      </div>
    </main>
  );
}
