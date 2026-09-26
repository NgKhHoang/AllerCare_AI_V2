"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  timing: string | null;
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
        <div style={{ textAlign: "center" }}>
          <div className="brand-dot" style={{ margin: "0 auto 12px" }}>🛡️</div>
          <p className="muted">Đang tải hồ sơ thông minh…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="login-wrap">
        <div className="login-card">
          <div className="brand-dot">🛡️</div>
          <p className="error-text" style={{ textAlign: "center" }}>
            {error}
          </p>
          <a className="btn btn-primary" href="/login" style={{ width: "100%", marginTop: 14 }}>
            Về trang đăng nhập
          </a>
        </div>
      </main>
    );
  }

  const currentMeds = meds.filter((m) => m.is_current && !m.is_planned).length;
  const plannedMeds = meds.filter((m) => m.is_planned).length;

  return (
    <AppShell
      role="patient"
      icon="👋"
      title={`Xin chào, ${profile?.full_name}`}
      subtitle="Trung tâm theo dõi an toàn thuốc & Trợ lý Gemini AI cá thể hóa"
    >
      <EmergencyBanner />

      {/* 4 Smart Action Tiles */}
      <div className="grid-2">
        <Link className="smart-tile" href="/patient/updates">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="tile-icon" style={{ background: "var(--brand-50)", color: "var(--brand-600)" }}>
              📸
            </div>
            <div>
              <div className="tile-title">Quét đơn thuốc AI</div>
              <div className="tile-desc">Chụp ảnh đơn thuốc — Gemini tự động nhận diện và đối soát</div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-600)" }}>Thực hiện ngay →</span>
        </Link>

        <Link className="smart-tile" href="/patient/chat">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="tile-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
              💬
            </div>
            <div>
              <div className="tile-title">Hỏi đáp AI & Giọng nói</div>
              <div className="tile-desc">Tra cứu liều dùng, tương tác thuốc chuẩn Bộ Y tế & nghe đọc</div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>Trò chuyện ngay →</span>
        </Link>

        <Link className="smart-tile" href="/patient/triage">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="tile-icon" style={{ background: "#fff7ed", color: "#ea580c" }}>
              🚦
            </div>
            <div>
              <div className="tile-title">Phân luồng TriageGuard</div>
              <div className="tile-desc">Khai báo triệu chứng bất thường để phân luồng cấp cứu 3 mức</div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#ea580c" }}>Kiểm tra triệu chứng →</span>
        </Link>

        <Link className="smart-tile" href="/patient/guides">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="tile-icon" style={{ background: "#f5f3ff", color: "#7c3aed" }}>
              📖
            </div>
            <div>
              <div className="tile-title">Hướng dẫn dùng thuốc</div>
              <div className="tile-desc">Xem hướng dẫn chi tiết theo giờ do Bác sĩ đã phê duyệt</div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed" }}>Xem hướng dẫn →</span>
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid-3">
        <div className="card" style={{ padding: 16, textAlign: "center", background: "linear-gradient(135deg, #ffffff 0%, var(--brand-50) 100%)" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--brand-600)" }}>{currentMeds}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Thuốc đang sử dụng</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: "center", background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#16a34a" }}>{plannedMeds}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Thuốc dự kiến kê</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: "center", background: "linear-gradient(135deg, #ffffff 0%, #fff1f2 100%)" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#e11d48" }}>{allergies.length}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Dị ứng đã ghi nhận</div>
        </div>
      </div>

      {/* Main Content Columns */}
      <div className="grid-2">
        {/* Thuốc của tôi */}
        <div className="card">
          <div className="card-title">
            <span className="t-ico">💊</span> Danh sách thuốc của tôi
          </div>
          {meds.length === 0 && <EmptyState icon="💊" text="Chưa khai báo thuốc nào." />}
          {meds.map((m) => (
            <div className="list-row" key={m.id}>
              <div className="list-main">
                <div className="list-title">{m.raw_name}</div>
                <div className="list-sub">
                  {m.dose ? `Liều: ${m.dose}` : ""} {m.timing ? `· ${m.timing}` : ""}
                </div>
              </div>
              <VerifiedBadge verification={m.verification} />
            </div>
          ))}
          <div style={{ marginTop: 12, textAlign: "right" }}>
            <Link href="/patient/updates" className="btn btn-secondary btn-sm">
              + Khai báo thêm thuốc
            </Link>
          </div>
        </div>

        {/* Tiền sử dị ứng */}
        <div className="card">
          <div className="card-title">
            <span className="t-ico">🚫</span> Tiền sử dị ứng thuốc
          </div>
          {allergies.length === 0 && (
            <EmptyState icon="✅" text="Chưa có tiền sử dị ứng nào được ghi nhận." />
          )}
          {allergies.map((a) => (
            <div className="list-row" key={a.id} style={{ background: "#fff5f5", borderColor: "#fed7d7" }}>
              <div className="list-main">
                <div className="list-title" style={{ color: "#c53030" }}>{a.substance}</div>
                <div className="list-sub">Biểu hiện: {a.reaction ?? "Phản ứng dị ứng"}</div>
              </div>
              <VerifiedBadge verification={a.verification} />
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-secondary)" }}>
            ℹ️ Mọi thuốc nghi ngờ dị ứng đều được MedSafe tự động chặn trong đơn thuốc mới.
          </div>
        </div>
      </div>

      {/* Safety Rules Banner */}
      <div className="card" style={{ borderLeft: "4px solid var(--brand-500)" }}>
        <div className="card-title">
          <span className="t-ico">🛡️</span> Nguyên tắc an toàn sử dụng thuốc
        </div>
        <ul style={{ paddingLeft: 20, color: "var(--text-secondary)", lineHeight: 1.8, fontSize: 13.5 }}>
          <li>Uống thuốc đúng liều lượng và thời điểm bác sĩ hướng dẫn; không tự ý ngừng hoặc đổi liều.</li>
          <li>Khi quên liều: <strong>Tuyệt đối không uống gấp đôi</strong> ở lần tiếp theo để bù liều.</li>
          <li>Khi gặp triệu chứng khó thở, sưng môi lưỡi hoặc nổi mày đay cấp: <strong>Gọi ngay 115</strong>.</li>
        </ul>
      </div>
    </AppShell>
  );
}
