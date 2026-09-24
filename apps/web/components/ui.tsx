"use client";

import Link from "next/link";
import { api, clearSession, getUser } from "../lib/api";
import { pwaLogoutCleanup, usePwaInstall } from "../lib/pwa";
import { useEffect, useState } from "react";

/* ---------- Badge trạng thái — đúng 5 trạng thái MedSafe ---------- */

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    has_alerts: { cls: "badge badge-danger", label: "⚠ Có cảnh báo" },
    no_alerts_in_scope: {
      cls: "badge badge-neutral",
      label: "Chưa phát hiện trong phạm vi đã kiểm tra",
    },
    insufficient_data: { cls: "badge badge-missing", label: "ⓘ Chưa đủ dữ liệu" },
    out_of_scope: { cls: "badge badge-scope", label: "Ngoài phạm vi hỗ trợ" },
    failed: { cls: "badge badge-error", label: "✕ Kiểm tra thất bại" },
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
    high: "Mức cao",
    medium: "Mức trung bình",
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
      ? "alertbox alertbox-danger"
      : alert.severity === "medium"
      ? "alertbox alertbox-warning"
      : "alertbox alertbox-neutral";
  return (
    <div className={cls}>
      <div className="alertbox-title">
        {alert.severity === "high" ? "⚠" : "•"} {alert.message}
      </div>
      {alert.detail && Object.keys(alert.detail).length > 0 && (
        <div style={{ fontSize: 14 }}>
          {Object.entries(alert.detail).map(([k, v]) => (
            <span key={k} style={{ marginRight: 12 }}>
              <strong>{k}:</strong> {String(v)}
            </span>
          ))}
        </div>
      )}
      <div className="source">
        Nguồn: {alert.source} · Quy tắc {alert.rule_code} v{alert.rule_version}
      </div>
    </div>
  );
}

export function ResultBox({ result }: { result: Record<string, unknown> }) {
  const status = result.status as string;
  const note = (result.note as string) ?? "";
  const alerts = (result.alerts as AlertItem[]) ?? [];
  const missing = (result.missing_data as string[]) ?? [];
  const outOfScope = (result.out_of_scope as string[]) ?? [];

  const boxCls =
    status === "has_alerts"
      ? "alertbox alertbox-danger"
      : status === "insufficient_data"
      ? "alertbox alertbox-missing"
      : status === "out_of_scope"
      ? "alertbox alertbox-scope"
      : status === "failed"
      ? "alertbox alertbox-error"
      : "alertbox alertbox-neutral";

  return (
    <div>
      {alerts.map((a, i) => (
        <AlertCard key={i} alert={a} />
      ))}
      <div className={boxCls}>
        <div className="alertbox-title">
          <StatusBadge status={status} />
        </div>
        <div style={{ fontSize: 14 }}>{note}</div>
        {missing.length > 0 && (
          <div style={{ fontSize: 14, marginTop: 6 }}>
            <strong>Thiếu dữ liệu:</strong> {missing.join(", ")}
          </div>
        )}
        {outOfScope.length > 0 && (
          <div style={{ fontSize: 14, marginTop: 6 }}>
            <strong>Thuốc ngoài danh mục (cần xác nhận):</strong> {outOfScope.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Header + Bottom nav — dùng chung mọi vai trò ---------- */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const PATIENT_NAV: NavItem[] = [
  { href: "/patient", label: "Trang chủ", icon: "🏠" },
  { href: "/patient/triage", label: "Phân luồng", icon: "🚦" },
  { href: "/patient/updates", label: "Cập nhật", icon: "📝" },
  { href: "/patient/chat", label: "Hỏi đáp AI", icon: "💬" },
  { href: "/patient/appointments", label: "Lịch hẹn", icon: "📅" },
];

export const DOCTOR_NAV: NavItem[] = [
  { href: "/doctor", label: "Danh sách ca", icon: "👥" },
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
    pwaLogoutCleanup(); // dọn cache SW khi đăng xuất (an toàn bảo mật)
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
          <div className="brand">
            <span className="brand-dot">🌊</span> AllerCare AI
          </div>
          <div className="userchip">
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
              style={{ position: "relative", minWidth: 40 }}
            >
              🔔{unread > 0 && <span style={{ marginLeft: 4, fontWeight: 700 }}>{unread}</span>}
            </Link>
            <div className="who">
              <div className="name">{user?.full_name ?? "…"}</div>
              <div className="role">{roleLabel}</div>
            </div>
            <span className="avatar">{initials || "？"}</span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              Thoát
            </button>
          </div>
        </div>
      </header>

      <div className="container">
        {(title || icon) && (
          <div className="page-head">
            {icon && <span className="icon-chip">{icon}</span>}
            <div>
              <h2>{title}</h2>
              {subtitle && <div className="sub">{subtitle}</div>}
            </div>
          </div>
        )}
        {children}
      </div>

      <nav className="bottomnav">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? "active" : ""}>
            <span className="n-ico">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function EmergencyBanner() {
  return (
    <div className="emergency-banner">
      <span style={{ fontSize: 20 }}>🚨</span>
      <span>
        Khẩn cấp? Gọi ngay <strong>115</strong> — ứng dụng không thay thế kênh cấp cứu.
      </span>
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="empty">
      <div className="e-ico">{icon}</div>
      <div>{text}</div>
    </div>
  );
}

export function SuccessBox({ text }: { text: string }) {
  return <div className="alertbox alertbox-success">✓ {text}</div>;
}

export function ErrorBox({ text }: { text: string }) {
  return <div className="alertbox alertbox-error">{text}</div>;
}
