"use client";

/**
 * Thông báo — kênh riêng theo vai trò/tài khoản (tài liệu CHI TIẾT mục 2, 6):
 * đỏ → bác sĩ + điều dưỡng + người bệnh + người nhà; vàng → bác sĩ + điều dưỡng.
 */
import { useCallback, useEffect, useState } from "react";
import { api, getToken, getUser } from "../../lib/api";
import { AppShell, EmptyState, ErrorBox } from "../../components/ui";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

const KIND_STYLE: Record<string, { icon: string; cls: string }> = {
  triage_red: { icon: "🚨", cls: "alertbox-danger" },
  triage_yellow: { icon: "🟡", cls: "alertbox-warning" },
  triage_green: { icon: "🟢", cls: "alertbox-neutral" },
  suspect_ranking: { icon: "🔍", cls: "alertbox-warning" },
  suspect_confirmed: { icon: "✓", cls: "alertbox-neutral" },
  guide_approved: { icon: "📖", cls: "alertbox-neutral" },
  guide_ack: { icon: "❓", cls: "alertbox-warning" },
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user) {
      window.location.href = "/login";
      return;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setItems(await api<Notification[]>("/v1/notifications"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được thông báo");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    try {
      await api(`/v1/notifications/${id}/read`, { method: "POST" });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được");
    }
  }

  async function markAll() {
    try {
      await api("/v1/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được");
    }
  }

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <AppShell
      role={getUser()?.role === "patient" ? "patient" : "doctor"}
      icon="🔔"
      title="Thông báo"
      subtitle={unread > 0 ? `${unread} thông báo chưa đọc` : "Bạn đã đọc hết thông báo"}
    >
      {error && <ErrorBox text={error} />}
      {unread > 0 && (
        <button className="btn btn-secondary btn-sm" onClick={markAll} style={{ marginBottom: 12 }}>
          Đánh dấu tất cả đã đọc
        </button>
      )}
      <div className="card">
        {items.length === 0 && <EmptyState icon="🔔" text="Chưa có thông báo nào." />}
        {items.map((n) => {
          const st = KIND_STYLE[n.kind] ?? { icon: "•", cls: "alertbox-neutral" };
          return (
            <div className={`alertbox ${st.cls}`} key={n.id} style={{ marginBottom: 10, opacity: n.is_read ? 0.65 : 1 }}>
              <div className="alertbox-title">
                {st.icon} {n.title}
              </div>
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{n.body}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span className="source">{new Date(n.created_at).toLocaleString("vi-VN")}</span>
                {!n.is_read && (
                  <button className="btn btn-secondary btn-sm" onClick={() => markRead(n.id)}>
                    Đã đọc
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
