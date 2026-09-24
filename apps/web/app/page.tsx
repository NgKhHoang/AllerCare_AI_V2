"use client";

import { useEffect } from "react";
import { getUser } from "../lib/api";

export default function Home() {
  useEffect(() => {
    const user = getUser();
    if (!user) {
      window.location.href = "/login";
    } else if (user.role === "doctor" || user.role === "pharmacist") {
      window.location.href = "/doctor";
    } else {
      window.location.href = "/patient";
    }
  }, []);

  return (
    <main className="login-wrap">
      <div style={{ textAlign: "center" }}>
        <div className="brand-dot" style={{ width: 64, height: 64, fontSize: 30, margin: "0 auto 14px" }}>
          🌊
        </div>
        <p className="muted">Đang mở AllerCare AI…</p>
      </div>
    </main>
  );
}
