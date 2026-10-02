"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, getToken } from "../lib/api";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    const user = getUser();

    if (!token || !user) {
      window.location.replace("/login");
      return;
    }

    const homeByRole: Record<string, string> = {
      patient: "/patient",
      caregiver: "/patient",
      doctor: "/doctor",
      pharmacist: "/doctor",
      nurse: "/nurse",
      leader: "/leader",
      admin: "/admin",
    };

    const target = homeByRole[user.role] ?? "/login";
    window.location.replace(target);
  }, [router]);

  return (
    <main className="login-wrap" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div
        className="login-card"
        style={{
          textAlign: "center",
          maxWidth: 420,
          width: "100%",
          padding: "36px 28px",
          background: "rgba(255, 255, 255, 0.95)",
          borderRadius: 20,
          boxShadow: "0 20px 40px rgba(2, 132, 199, 0.12), 0 4px 12px rgba(0,0,0,0.04)",
          border: "1.5px solid #bae6fd",
        }}
      >
        <div className="brand-dot" style={{ width: 68, height: 68, fontSize: 32, margin: "0 auto 16px" }}>
          🛡️
        </div>
        <h1 style={{ fontWeight: 800, fontSize: "1.45rem", color: "#0f172a", marginBottom: 6, letterSpacing: "-0.02em" }}>
          AllerCare <span style={{ color: "#0284c7" }}>AI v3.5</span>
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: 20 }}>
          Đang chuyển hướng vào hệ thống...
        </p>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <span className="pulse-dot" style={{ width: 14, height: 14, background: "#0284c7" }}></span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a
            href="/doctor"
            className="btn btn-primary"
            style={{ textDecoration: "none", justifyContent: "center", padding: "10px 16px", fontWeight: 700 }}
          >
            🩺 Vào Cổng Bác sĩ
          </a>
          <a
            href="/pharmacist"
            className="btn btn-secondary"
            style={{ textDecoration: "none", justifyContent: "center", padding: "10px 16px", fontWeight: 700 }}
          >
            💊 Cổng Dược sĩ & 633 Tương tác thuốc
          </a>
          <a
            href="/patient"
            className="btn btn-secondary"
            style={{ textDecoration: "none", justifyContent: "center", padding: "10px 16px" }}
          >
            👤 Vào Cổng Người bệnh
          </a>
          <a
            href="/login"
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: "none", justifyContent: "center", marginTop: 6 }}
          >
            🔑 Màn hình Đăng nhập
          </a>
        </div>
      </div>
    </main>
  );
}
