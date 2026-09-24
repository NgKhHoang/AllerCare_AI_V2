"use client";

import { useState } from "react";

const DEMO_ACCOUNTS = [
  { label: "Người bệnh", username: "patient1", password: "patient123" },
  { label: "Ca thật 01", username: "case01", password: "patient123" },
  { label: "Ca thật 02 (Cefaclor)", username: "case02", password: "patient123" },
  { label: "Bác sĩ", username: "doctor1", password: "doctor123" },
  { label: "Điều dưỡng", username: "nurse1", password: "nurse123" },
  { label: "Dược sĩ", username: "pharmacist1", password: "pharma123" },
  { label: "Người nhà", username: "family1", password: "family123" },
  { label: "Lãnh đạo khoa", username: "leader1", password: "leader123" },
  { label: "Quản trị viên", username: "admin1", password: "admin123" },
];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const form = new URLSearchParams({ username, password });
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

  function fillDemo(acc: (typeof DEMO_ACCOUNTS)[number]) {
    setUsername(acc.username);
    setPassword(acc.password);
  }

  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt="Logo AllerCare AI"
            style={{ width: 64, height: 64, margin: "0 auto 12px", display: "block", borderRadius: 20 }}
          />
          <div className="login-title">AllerCare AI</div>
          <div className="login-sub">Theo dõi từ xa & an toàn thuốc</div>
        </div>
        <form onSubmit={handleLogin}>
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
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
        <div className="demo-hint">
          <strong>🔑 Tài khoản demo</strong> (bấm để điền nhanh):
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.username}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fillDemo(a)}
              >
                {a.username}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            Mật khẩu: patient123 · doctor123 · nurse123 · pharma123 · family123 · leader123 ·
            admin123
          </div>
        </div>
        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          Bản demo dùng dữ liệu giả lập, không dùng cho chăm sóc thực tế.
        </p>
      </div>
    </main>
  );
}
