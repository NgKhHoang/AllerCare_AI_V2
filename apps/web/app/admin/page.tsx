"use client";

/**
 * Quản trị hệ thống (tài liệu CHI TIẾT mục 3): quản lý tài khoản + nhật ký.
 * Admin KHÔNG tự xem dữ liệu lâm sàng — giới hạn vai trò được kiểm tra ở backend.
 */
import { useCallback, useEffect, useState } from "react";
import { api, getToken, getUser } from "../../lib/api";
import { AppShell, EmptyState, ErrorBox, SuccessBox } from "../../components/ui";

interface AdminUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface AuditEvent {
  id: string;
  username: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  detail: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  patient: "Người bệnh",
  doctor: "Bác sĩ",
  nurse: "Điều dưỡng",
  pharmacist: "Dược sĩ",
  leader: "Lãnh đạo khoa",
  admin: "Quản trị viên",
  caregiver: "Người nhà",
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [log, setLog] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user || user.role !== "admin") {
      window.location.href = "/login";
      return;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setUsers(await api<AdminUser[]>("/v1/admin/users"));
      setLog(await api<AuditEvent[]>("/v1/admin/audit-log"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu quản trị");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(u: AdminUser) {
    setError("");
    setSuccess("");
    try {
      const r = await api<{ id: string; is_active: boolean }>(
        `/v1/admin/users/${u.id}/active?is_active=${!u.is_active}`,
        { method: "POST" }
      );
      setUsers((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: r.is_active } : x)));
      setSuccess(r.is_active ? `Đã mở khóa ${u.username}.` : `Đã khóa ${u.username}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được tài khoản");
    }
  }

  return (
    <AppShell role="admin" icon="🛠" title="Quản trị hệ thống" subtitle="Tài khoản & nhật ký — không có quyền truy cập hồ sơ lâm sàng">
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      <div className="card">
        <div className="card-title">
          <span className="t-ico">👤</span> Tài khoản ({users.length})
        </div>
        {users.length === 0 && <EmptyState icon="👤" text="Chưa có tài khoản." />}
        {users.map((u) => (
          <div className="list-row" key={u.id}>
            <div className="list-main">
              <div className="list-title">
                {u.full_name} <span className="muted">({u.username})</span>
              </div>
              <div className="list-sub">{ROLE_LABELS[u.role] ?? u.role}</div>
            </div>
            {u.role === "admin" ? (
              <span className="badge badge-neutral">—</span>
            ) : u.is_active ? (
              <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(u)}>
                Khóa
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="badge badge-danger">Bị khóa</span>
                <button className="btn btn-primary btn-sm" onClick={() => toggleActive(u)}>
                  Mở khóa
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">
          <span className="t-ico">📜</span> Nhật ký hệ thống (100 sự kiện gần nhất)
        </div>
        {log.length === 0 && <EmptyState icon="📜" text="Chưa có sự kiện nào." />}
        {log.map((e) => (
          <div className="list-row" key={e.id}>
            <div className="list-main">
              <div className="list-title">
                {e.action} <span className="muted">· {e.object_type}</span>
              </div>
              <div className="list-sub">
                {e.username ?? "—"} · {new Date(e.created_at).toLocaleString("vi-VN")}
                {e.detail ? ` · ${e.detail}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
