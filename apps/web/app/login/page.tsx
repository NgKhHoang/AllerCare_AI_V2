"use client";

import { useState } from "react";

const DEMO_ACCOUNTS = [
  { label: "Bệnh nhân (patient1)", username: "patient1", password: "patient123", icon: "👤", role: "Người bệnh" },
  { label: "Ca 02 Phản vệ Cefaclor", username: "case02", password: "patient123", icon: "⚠️", role: "Ca dị ứng mẫu" },
  { label: "BS. Nguyễn Văn An", username: "doctor1", password: "doctor123", icon: "🩺", role: "Bác sĩ" },
  { label: "ĐD. Trịnh Thu Hà", username: "nurse1", password: "nurse123", icon: "🚦", role: "Điều dưỡng" },
  { label: "DS. Nguyễn Thị Em", username: "pharmacist1", password: "pharma123", icon: "💊", role: "Dược sĩ" },
  { label: "Lãnh đạo khoa", username: "leader1", password: "leader123", icon: "📊", role: "Quality Dashboard" },
  { label: "Người nhà (family1)", username: "family1", password: "family123", icon: "🏡", role: "Ủy quyền" },
  { label: "Quản trị viên", username: "admin1", password: "admin123", icon: "🛠️", role: "Hệ thống" },
];

export default function LoginPage() {
  const [username, setUsername] = useState("patient1");
  const [password, setPassword] = useState("patient123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e?: React.FormEvent, customUser?: string, customPass?: string) {
    if (e) e.preventDefault();
    const u = customUser || username;
    const p = customPass || password;
    setError("");
    setLoading(true);
    try {
      const form = new URLSearchParams({ username: u, password: p });
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : "Đăng nhập thất bại");
      }
      const data = await res.json();
      localStorage.setItem("allercare_token", data.access_token);
      localStorage.setItem("allercare_user", JSON.stringify(data.user));
      const homeByRole: Record<string, string> = {
        patient: "/patient",
        caregiver: "/patient",
        doctor: "/doctor",
        pharmacist: "/doctor",
        nurse: "/nurse",
        leader: "/leader",
        admin: "/admin",
      };
      window.location.href = homeByRole[data.user.role] ?? "/patient";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
      setLoading(false);
    }
  }

  function quickLogin(acc: (typeof DEMO_ACCOUNTS)[number]) {
    setUsername(acc.username);
    setPassword(acc.password);
    handleLogin(undefined, acc.username, acc.password);
  }

  return (
    <main className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="brand-dot">🛡️</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            AllerCare <span style={{ color: "var(--brand-500)" }}>AI</span>
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4 }}>
            Nền tảng Theo dõi Từ xa & An toàn Thuốc Da liễu
          </p>
          <div style={{ marginTop: 8 }}>
            <span className="badge badge-info" style={{ fontSize: 11 }}>
              ✨ Tích hợp Gemini 1.5 & 633 Tương tác thuốc Bộ Y tế
            </span>
          </div>
        </div>

        {error && <div className="error-text" style={{ textAlign: "center", marginBottom: 12 }}>{error}</div>}

        <form onSubmit={(e) => handleLogin(e)}>
          <div className="field">
            <label className="label" htmlFor="username">
              Tên đăng nhập
            </label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              Mật khẩu
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 8, padding: 12, fontSize: 15 }} disabled={loading}>
            {loading ? "Đang xử lý đăng nhập…" : "Đăng nhập hệ thống →"}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border-default)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10, textAlign: "center" }}>
            ⚡ CHỌN TÀI KHOẢN DEMO ĐĂNG NHẬP NHANH (1-CLICK)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.username}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => quickLogin(acc)}
                style={{
                  textAlign: "left",
                  justifyContent: "flex-start",
                  fontSize: 12,
                  padding: "6px 8px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={`Đăng nhập nhanh vai trò ${acc.role}`}
              >
                <span>{acc.icon}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{acc.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
