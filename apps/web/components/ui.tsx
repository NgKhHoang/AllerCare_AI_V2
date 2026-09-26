"use client";

import Link from "next/link";
import { api, clearSession, getUser } from "../lib/api";
import { pwaLogoutCleanup, usePwaInstall } from "../lib/pwa";
import { useEffect, useState } from "react";

/* ---------- Badge trạng thái — đúng 5 trạng thái MedSafe ---------- */

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    has_alerts: { cls: "badge badge-danger", label: "⚠️ Có cảnh báo" },
    no_alerts_in_scope: {
      cls: "badge badge-neutral",
      label: "✓ Chưa phát hiện cảnh báo trong phạm vi",
    },
    insufficient_data: { cls: "badge badge-warning", label: "ℹ️ Chưa đủ dữ liệu" },
    out_of_scope: { cls: "badge badge-neutral", label: "Ngoài phạm vi hỗ trợ" },
    failed: { cls: "badge badge-danger", label: "✕ Kiểm tra thất bại" },
  };
  const item = map[status] ?? { cls: "badge badge-neutral", label: status };
  return <span className={item.cls}>{item.label}</span>;
}

export function VerifiedBadge({ verification }: { verification: string }) {
  if (verification === "verified") {
    return <span className="badge badge-ok">✓ Đã xác minh</span>;
  }
  return (
    <span className="badge badge-unverified" title="Chưa được chuyên môn xác minh">
      ? Chưa xác minh
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    high: "badge badge-danger",
    medium: "badge badge-warning",
    low: "badge badge-neutral",
  };
  const labels: Record<string, string> = {
    high: "Mức cao (Đỏ)",
    medium: "Mức vừa (Vàng)",
    low: "Mức thấp",
  };
  return <span className={map[severity] ?? "badge badge-neutral"}>{labels[severity] ?? severity}</span>;
}

/* ---------- Khối cảnh báo MedSafe ---------- */

export interface AlertItem {
  rule_code: string;
  rule_version: string;
  severity: string;
  message: string;
  source: string;
  detail?: Record<string, unknown>;
}

export function AlertCard({ alert }: { alert: AlertItem }) {
  const cls =
    alert.severity === "high"
      ? "badge badge-danger"
      : alert.severity === "medium"
      ? "badge badge-warning"
      : "badge badge-neutral";
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: alert.severity === "high" ? "var(--status-danger-bg)" : "var(--status-warning-bg)", border: `1px solid ${alert.severity === "high" ? "var(--status-danger-border)" : "var(--status-warning-border)"}`, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: alert.severity === "high" ? "var(--status-danger)" : "var(--status-warning)" }}>
          {alert.severity === "high" ? "🚨 CẢNH BÁO NGUY HIỂM" : "⚠️ CẢNH BÁO THẬN TRỌNG"}
        </div>
        <span className={cls}>{alert.rule_code}</span>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.5, marginBottom: 8 }}>
        {alert.message}
      </p>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", opacity: 0.85 }}>
        📚 Căn cứ: {alert.source} (Phiên bản quy tắc {alert.rule_version})
      </div>
    </div>
  );
}

export function ResultBox({ result }: { result: Record<string, unknown> }) {
  const status = result.status as string;
  const note = (result.note as string) ?? "";
  const alerts = (result.alerts as AlertItem[]) ?? [];

  return (
    <div style={{ marginTop: 12, padding: 16, background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Kết quả kiểm tra MedSafe:</span>
        <StatusBadge status={status} />
      </div>
      {note && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>{note}</p>}
      {alerts.map((a, i) => (
        <AlertCard key={i} alert={a} />
      ))}
    </div>
  );
}

/* ---------- Điều hướng chung ---------- */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const PATIENT_NAV: NavItem[] = [
  { href: "/patient", label: "Trang chủ", icon: "🏠" },
  { href: "/patient/updates", label: "Đối soát thuốc", icon: "📝" },
  { href: "/patient/chat", label: "Hỏi đáp AI", icon: "💬" },
  { href: "/patient/appointments", label: "Lịch hẹn", icon: "📅" },
  { href: "/notifications", label: "Thông báo", icon: "🔔" },
];

export const DOCTOR_NAV: NavItem[] = [
  { href: "/doctor", label: "Danh sách ca", icon: "🩺" },
  { href: "/pharmacist", label: "Quy tắc", icon: "📋" },
  { href: "/notifications", label: "Thông báo", icon: "🔔" },
];

export const NURSE_NAV: NavItem[] = [
  { href: "/nurse", label: "Hàng đợi", icon: "🚦" },
  { href: "/notifications", label: "Thông báo", icon: "🔔" },
];

export const LEADER_NAV: NavItem[] = [
  { href: "/leader", label: "Dashboard", icon: "📊" },
  { href: "/notifications", label: "Thông báo", icon: "🔔" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Quản trị", icon: "🛠" },
  { href: "/notifications", label: "Thông báo", icon: "🔔" },
];

/* ---------- Badge phân luồng TriageGuard ---------- */

export function TriageBadge({ level }: { level: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    red: { cls: "badge badge-danger", label: "🔴 ĐỎ — Cấp cứu 115" },
    yellow: { cls: "badge badge-warning", label: "🟡 VÀNG — Cần bác sĩ đánh giá" },
    green: { cls: "badge badge-ok", label: "🟢 XANH — Theo dõi tại nhà" },
  };
  const item = map[level] ?? { cls: "badge badge-neutral", label: level };
  return <span className={item.cls}>{item.label}</span>;
}

export function AppShell({
  children,
  role,
  title,
  subtitle,
  icon,
}: {
  children: React.ReactNode;
  role: "patient" | "doctor" | "nurse" | "leader" | "admin";
  title?: string;
  subtitle?: string;
  icon?: string;
}) {
  const [user, setUser] = useState<{ full_name?: string; role: string } | null>(null);
  const [path, setPath] = useState("");
  const [unread, setUnread] = useState(0);
  const { canInstall, installed, install } = usePwaInstall();
  const navByRole: Record<string, NavItem[]> = {
    patient: PATIENT_NAV,
    doctor: DOCTOR_NAV,
    pharmacist: DOCTOR_NAV,
    nurse: NURSE_NAV,
    leader: LEADER_NAV,
    admin: ADMIN_NAV,
  };
  const nav = navByRole[role] ?? PATIENT_NAV;

  useEffect(() => {
    setUser(getUser());
    setPath(window.location.pathname);
    api<{ id: string; is_read: boolean }[]>("/v1/notifications")
      .then((ns) => setUnread(ns.filter((n) => !n.is_read).length))
      .catch(() => {});
  }, []);

  function logout() {
    clearSession();
    pwaLogoutCleanup();
    window.location.href = "/login";
  }

  const initials = (user?.full_name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const roleLabels: Record<string, string> = {
    doctor: "Bác sĩ",
    pharmacist: "Dược sĩ",
    patient: "Người bệnh",
    nurse: "Điều dưỡng",
    leader: "Lãnh đạo khoa",
    admin: "Quản trị viên",
    caregiver: "Người nhà",
  };
  const roleLabel = roleLabels[user?.role ?? ""] ?? "";

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href={role === "patient" ? "/patient" : `/${role}`} className="brand-link">
            <div className="brand-shield">🛡️</div>
            <div>
              <div className="brand-title">
                AllerCare <span className="brand-ai-chip">AI v2.5</span>
              </div>
            </div>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* AI Status Pill */}
            <div className="ai-status-pill" title="Mô hình Gemini & Kho 633 tương tác thuốc Bộ Y tế đang hoạt động">
              <span className="pulse-dot"></span>
              <span style={{ fontSize: 11 }}>Gemini Grounded</span>
            </div>

            {canInstall && !installed && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => install()}
                title="Cài AllerCare lên màn hình chính"
              >
                ⬇ Cài app
              </button>
            )}

            <Link
              href="/notifications"
              className="btn btn-secondary btn-sm"
              title="Thông báo"
              style={{ position: "relative", padding: "6px 10px" }}
            >
              🔔
              {unread > 0 && (
                <span
                  style={{
                    marginLeft: 4,
                    background: "var(--status-danger)",
                    color: "white",
                    borderRadius: "50%",
                    padding: "1px 6px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {unread}
                </span>
              )}
            </Link>

            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 6, borderLeft: "1px solid var(--border-default)" }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--brand-100)",
                  color: "var(--brand-700)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {initials || "U"}
              </span>
              <div style={{ display: "none" }} className="who">
                <div style={{ fontSize: 13, fontWeight: 700 }}>{user?.full_name ?? "…"}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{roleLabel}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={logout} style={{ fontSize: 12, padding: "5px 10px" }}>
                Thoát
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container">
        {(title || icon) && (
          <div className="page-hero">
            <div>
              <div className="page-hero-title">
                {icon && <span>{icon}</span>}
                {title}
              </div>
              {subtitle && <div className="page-hero-subtitle">{subtitle}</div>}
            </div>
          </div>
        )}
        {children}
      </div>

      <nav className="floating-bottom-nav">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={`bottom-nav-item ${path === n.href ? "active" : ""}`}>
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

export function EmergencyBanner() {
  return (
    <div className="emergency-banner">
      <div className="emergency-text">
        <span style={{ fontSize: 20 }}>🚨</span>
        <span>
          <strong>Dấu hiệu khẩn cấp?</strong> Khó thở, sưng môi lưỡi, choáng váng hãy gọi ngay <strong>115</strong>.
        </span>
      </div>
      <a href="tel:115" className="emergency-btn">
        📞 GỌI 115
      </a>
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-secondary)" }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{text}</div>
    </div>
  );
}

export function SuccessBox({ text }: { text: string }) {
  return (
    <div style={{ padding: "12px 16px", borderRadius: 12, background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", marginBottom: 16, fontSize: 14 }}>
      ✓ {text}
    </div>
  );
}

export function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ padding: "12px 16px", borderRadius: 12, background: "var(--status-danger-bg)", color: "var(--status-danger)", border: "1px solid var(--status-danger-border)", marginBottom: 16, fontSize: 14 }}>
      ✕ {text}
    </div>
  );
}
