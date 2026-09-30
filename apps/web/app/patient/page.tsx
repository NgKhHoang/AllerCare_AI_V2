"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getToken } from "../../lib/api";
import { AppShell, EmergencyBanner } from "../../components/ui";
import { TreatmentTimeline } from "../../components/TreatmentTimeline";

interface Profile {
  id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  assigned_doctor_id: string | null;
}

export default function PatientHome() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  async function reload() {
    try {
      const p = await api<Profile>("/v1/patients/me/profile");
      setProfile(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được hồ sơ");
    }
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    reload();
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

  return (
    <AppShell
      role="patient"
      icon="👋"
      title={`Xin chào, ${profile?.full_name}`}
      subtitle="Trung tâm theo dõi an toàn thuốc & Trợ lý Gemini AI cá thể hóa"
    >
      <EmergencyBanner />

      {/* 2 Phím tắt thiết yếu nhất */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Link className="smart-tile" href="/patient/updates">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="tile-icon" style={{ background: "var(--brand-50)", color: "var(--brand-600)" }}>
              💊
            </div>
            <div>
              <div className="tile-title">Đơn thuốc & Khai báo thuốc</div>
              <div className="tile-desc">Xem đơn thuốc bác sĩ kê và khai báo thuốc đang dùng từ các nguồn</div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-600)" }}>Xem đơn thuốc →</span>
        </Link>

        <Link className="smart-tile" href="/patient/triage" style={{ border: "1.5px solid #fed7aa", background: "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="tile-icon" style={{ background: "#ffedd5", color: "#ea580c" }}>
              🚦
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span className="tile-title">Phân luồng TriageGuard</span>
                <span className="badge badge-warning" style={{ fontSize: 11, padding: "2px 7px" }}>Quy tắc hàng ngày</span>
              </div>
              <div className="tile-desc">Người bệnh/Người nhà nhập mô tả triệu chứng mỗi ngày để AI phân luồng</div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#ea580c" }}>Khai báo triệu chứng hôm nay →</span>
        </Link>
      </div>

      {/* CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ, CÁC LOẠI BỆNH & TIỀN SỬ DỊ ỨNG */}
      {profile?.id && (
        <TreatmentTimeline
          profileId={profile.id}
          isDoctor={false}
          onRefresh={reload}
        />
      )}

      {/* Nguyên tắc an toàn sử dụng thuốc tinh gọn */}
      <div className="card" style={{ borderLeft: "4px solid var(--brand-500)", marginTop: 10 }}>
        <div className="card-title">
          <span className="t-ico">🛡️</span> Nguyên tắc an toàn sử dụng thuốc
        </div>
        <ul style={{ paddingLeft: 20, color: "var(--text-secondary)", lineHeight: 1.8, fontSize: 13.5, margin: 0 }}>
          <li>Uống thuốc đúng liều lượng và thời điểm bác sĩ hướng dẫn; không tự ý ngừng hoặc đổi liều.</li>
          <li>Khi quên liều: <strong>Tuyệt đối không uống gấp đôi</strong> ở lần tiếp theo để bù liều.</li>
          <li>Khi gặp triệu chứng khó thở, sưng môi lưỡi hoặc nổi mày đay cấp: <strong>Gọi ngay 115</strong>.</li>
        </ul>
      </div>
    </AppShell>
  );
}
