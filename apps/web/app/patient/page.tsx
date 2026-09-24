"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "../../lib/api";
import { AppShell, EmergencyBanner, EmptyState, VerifiedBadge } from "../../components/ui";

interface Profile {
  id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  assigned_doctor_id: string | null;
}
interface Medication {
  id: string;
  raw_name: string;
  is_current: boolean;
  is_planned: boolean;
  dose: string | null;
  frequency: string | null;
  verification: string;
}
interface Allergy {
  id: string;
  substance: string;
  reaction: string | null;
  verification: string;
}

export default function PatientHome() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    (async () => {
      try {
        const p = await api<Profile>("/v1/patients/me/profile");
        setProfile(p);
        setMeds(await api<Medication[]>(`/v1/patients/${p.id}/medications`));
        setAllergies(await api<Allergy[]>(`/v1/patients/${p.id}/allergies`));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được hồ sơ");
      }
    })();
  }, []);

  if (!profile && !error) {
    return (
      <main className="login-wrap">
        <p className="muted">Đang tải hồ sơ…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="login-wrap">
        <div className="login-card">
          <div className="login-logo">
            <div className="brand-dot">🌊</div>
          </div>
          <p className="error-text" style={{ textAlign: "center" }}>
            {error}
          </p>
          <a className="btn btn-primary" href="/login" style={{ width: "100%", marginTop: 14 }}>
            Về trang đăng nhập
          </a>
        </div>
        <div className="container" />
      </main>
    );
  }

  const currentMeds = meds.filter((m) => m.is_current && !m.is_planned).length;
  const plannedMeds = meds.filter((m) => m.is_planned).length;

  return (
    <AppShell role="patient" icon="🏠" title={`Xin chào, ${profile?.full_name?.split(" ").slice(-1)}`} subtitle="Hồ sơ và theo dõi của bạn">
      <EmergencyBanner />

      <div className="grid-2">
        <a className="card" href="/patient/triage" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card-title">
            <span className="t-ico">🚦</span> Phân luồng AI
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Khai triệu chứng — hệ thống phân luồng xanh/vàng/đỏ ngay lập tức.
          </div>
        </a>
        <a className="card" href="/patient/guides" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card-title">
            <span className="t-ico">📖</span> Hướng dẫn dùng thuốc
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Hướng dẫn do AI soạn, bác sĩ duyệt — xác nhận "Tôi đã hiểu".
          </div>
        </a>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="s-num">{currentMeds}</div>
          <div className="s-label">Thuốc đang dùng</div>
        </div>
        <div className="stat">
          <div className="s-num">{plannedMeds}</div>
          <div className="s-label">Thuốc dự kiến</div>
        </div>
        <div className="stat">
          <div className="s-num">{allergies.length}</div>
          <div className="s-label">Dị ứng ghi nhận</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            <span className="t-ico">💊</span> Thuốc của tôi
          </div>
          {meds.length === 0 && <EmptyState icon="💊" text="Chưa khai báo thuốc nào." />}
          {meds.map((m) => (
            <div className="list-row" key={m.id}>
              <div className="list-main">
                <div className="list-title">{m.raw_name}</div>
                <div className="list-sub">
                  {m.is_planned ? "Thuốc dự kiến" : "Đang dùng"}
                  {m.frequency ? ` · ${m.frequency}` : ""}
                </div>
              </div>
              <VerifiedBadge verification={m.verification} />
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">
            <span className="t-ico">🚫</span> Dị ứng / tiền sử
          </div>
          {allergies.length === 0 && (
            <EmptyState icon="✅" text="Chưa có tiền sử dị ứng nào được ghi nhận." />
          )}
          {allergies.map((a) => (
            <div className="list-row" key={a.id}>
              <div className="list-main">
                <div className="list-title">{a.substance}</div>
                <div className="list-sub">{a.reaction ?? "—"}</div>
              </div>
              <VerifiedBadge verification={a.verification} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span className="t-ico">📋</span> Hướng dẫn dùng thuốc an toàn
        </div>
        <ul style={{ paddingLeft: 20, color: "var(--text-secondary)", lineHeight: 1.9 }}>
          <li>Uống đúng liều theo hướng dẫn của bác sĩ, không tự tăng/giảm liều.</li>
          <li>Quên một liều: không uống gấp đôi để bù.</li>
          <li>
            Gặp nổi mẩn, khó thở, sưng mặt/môi: ngừng thuốc và gọi <strong>115</strong> hoặc đến cơ
            sở y tế gần nhất.
          </li>
          <li>Không dùng chung thuốc với người khác; bảo quản nơi khô mát, tránh nắng.</li>
        </ul>
      </div>
    </AppShell>
  );
}
