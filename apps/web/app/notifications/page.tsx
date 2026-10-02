"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, getToken, getUser } from "../../lib/api";
import { AppShell, EmptyState, ErrorBox, SuccessBox } from "../../components/ui";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface KindMeta {
  icon: string;
  label: string;
  type: "red" | "yellow" | "purple" | "blue" | "green" | "neutral";
  badgeCls: string;
}

const KIND_META_MAP: Record<string, KindMeta> = {
  triage_red: {
    icon: "🚨",
    label: "CẢNH BÁO ĐỎ — KHẨN CẤP",
    type: "red",
    badgeCls: "badge-danger",
  },
  triage_yellow: {
    icon: "🟡",
    label: "CẢNH BÁO VÀNG — THEO DÕI",
    type: "yellow",
    badgeCls: "badge-warning",
  },
  triage_green: {
    icon: "🟢",
    label: "TRIỆU CHỨNG ỔN ĐỊNH",
    type: "green",
    badgeCls: "badge-ok",
  },
  guide_ack: {
    icon: "❓",
    label: "PHẢN HỒI — CHƯA HIỂU DÙNG THUỐC",
    type: "purple",
    badgeCls: "badge-purple",
  },
  suspect_ranking: {
    icon: "🔍",
    label: "AI GỢI Ý XẾP HẠNG TÁC NHÂN",
    type: "blue",
    badgeCls: "badge-info",
  },
  suspect_confirmed: {
    icon: "✓",
    label: "XÁC NHẬN TÁC NHÂN DỊ ỨNG",
    type: "blue",
    badgeCls: "badge-ok",
  },
  guide_approved: {
    icon: "📖",
    label: "HƯỚNG DẪN ĐÃ DUYỆT",
    type: "neutral",
    badgeCls: "badge-neutral",
  },
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [role, setRole] = useState<"patient" | "doctor" | "nurse" | "leader" | "admin">("doctor");

  // Filters & Search
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "urgent" | "guide_ack" | "suspect" | "green" | "read">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user) {
      window.location.href = "/login";
      return;
    }
    if (user.role === "patient") {
      setRole("patient");
    } else if (["doctor", "pharmacist", "nurse", "leader", "admin"].includes(user.role)) {
      setRole(user.role === "pharmacist" ? "doctor" : (user.role as "doctor" | "nurse" | "leader" | "admin"));
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await api<Notification[]>("/v1/notifications");
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được thông báo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      // Tự động đồng bộ thời gian thực từ người bệnh mà không giật màn hình
      api<Notification[]>("/v1/notifications")
        .then((data) => setItems(data))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [load]);

  async function markRead(id: string) {
    try {
      await api(`/v1/notifications/${id}/read`, { method: "POST" });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setSuccess("Đã đánh dấu đã đọc");
      setTimeout(() => setSuccess(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được");
    }
  }

  async function markAll() {
    try {
      await api("/v1/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setSuccess("Đã đánh dấu tất cả thông báo là đã đọc");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được");
    }
  }

  // Counts for Metric Cards
  const totalCount = items.length;
  const unreadCount = items.filter((n) => !n.is_read).length;
  const readCount = items.filter((n) => n.is_read).length;
  const urgentCount = items.filter((n) => n.kind === "triage_red" || n.kind === "triage_yellow").length;
  const guideAckCount = items.filter((n) => n.kind === "guide_ack").length;
  const suspectCount = items.filter((n) => n.kind === "suspect_ranking" || n.kind === "suspect_confirmed").length;
  const greenCount = items.filter((n) => n.kind === "triage_green" || n.kind === "guide_approved").length;

  // Live Filtered List
  const filteredItems = useMemo(() => {
    let list = items;

    // Filter by Tab
    if (activeTab === "unread") {
      list = list.filter((n) => !n.is_read);
    } else if (activeTab === "urgent") {
      list = list.filter((n) => n.kind === "triage_red" || n.kind === "triage_yellow");
    } else if (activeTab === "guide_ack") {
      list = list.filter((n) => n.kind === "guide_ack");
    } else if (activeTab === "suspect") {
      list = list.filter((n) => n.kind === "suspect_ranking" || n.kind === "suspect_confirmed");
    } else if (activeTab === "green") {
      list = list.filter((n) => n.kind === "triage_green" || n.kind === "guide_approved");
    } else if (activeTab === "read") {
      list = list.filter((n) => n.is_read);
    }

    // Filter by Search Query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          (n.title && n.title.toLowerCase().includes(q)) ||
          (n.body && n.body.toLowerCase().includes(q)) ||
          (n.kind && n.kind.toLowerCase().includes(q)) ||
          (n.created_at && n.created_at.includes(q))
      );
    }

    return list;
  }, [items, activeTab, searchQuery]);

  return (
    <AppShell
      role={role}
      wide={true}
      icon="🔔"
      title="Trung tâm Thông báo & Cảnh báo Lâm sàng"
      subtitle={
        unreadCount > 0
          ? `Hệ thống ghi nhận ${unreadCount} thông báo và cảnh báo lâm sàng chưa xử lý`
          : "Tất cả thông báo và cảnh báo đã được kiểm tra và xử lý xong"
      }
    >
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {/* 4 STATS OVERVIEW CARDS */}
      <div className="notification-stats-grid">
        <div
          className={`notification-stat-card ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
          title="Xem tất cả thông báo"
        >
          <div className="notification-stat-icon" style={{ background: "#f0f9ff", color: "#0284c7" }}>
            🔔
          </div>
          <div>
            <div className="notification-stat-val">
              {totalCount} <span style={{ fontSize: "0.82rem", color: unreadCount > 0 ? "#dc2626" : "#16a34a", fontWeight: 700 }}>({unreadCount} mới)</span>
            </div>
            <div className="notification-stat-lbl">Tất cả thông báo</div>
          </div>
        </div>

        <div
          className={`notification-stat-card ${activeTab === "urgent" ? "active" : ""}`}
          onClick={() => setActiveTab("urgent")}
          title="Xem cảnh báo đỏ & vàng cần ưu tiên"
        >
          <div className="notification-stat-icon" style={{ background: "#fef2f2", color: "#dc2626" }}>
            🚨
          </div>
          <div>
            <div className="notification-stat-val" style={{ color: urgentCount > 0 ? "#dc2626" : "#0f172a" }}>
              {urgentCount}
            </div>
            <div className="notification-stat-lbl">Cảnh báo khẩn & Triage</div>
          </div>
        </div>

        <div
          className={`notification-stat-card ${activeTab === "guide_ack" ? "active" : ""}`}
          onClick={() => setActiveTab("guide_ack")}
          title="Bệnh nhân phản hồi Chưa hiểu cách dùng thuốc"
        >
          <div className="notification-stat-icon" style={{ background: "#faf5ff", color: "#8b5cf6" }}>
            ❓
          </div>
          <div>
            <div className="notification-stat-val" style={{ color: guideAckCount > 0 ? "#8b5cf6" : "#0f172a" }}>
              {guideAckCount}
            </div>
            <div className="notification-stat-lbl">Chưa hiểu dùng thuốc</div>
          </div>
        </div>

        <div
          className={`notification-stat-card ${activeTab === "suspect" ? "active" : ""}`}
          onClick={() => setActiveTab("suspect")}
          title="AI Gemini phân tích xếp hạng thuốc nghi ngờ dị ứng"
        >
          <div className="notification-stat-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            🔍
          </div>
          <div>
            <div className="notification-stat-val" style={{ color: "#2563eb" }}>
              {suspectCount}
            </div>
            <div className="notification-stat-lbl">AI Gợi ý tác nhân</div>
          </div>
        </div>
      </div>

      {/* FILTER TABS & ACTIONS TOOLBAR */}
      <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: 16, border: "1.5px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.03)", marginBottom: 20 }}>
        {/* TABS */}
        <div className="notification-filter-tabs">
          <button
            type="button"
            className={`notification-filter-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            <span>📋 Tất cả</span>
            <span className="notification-tab-count">{totalCount}</span>
          </button>

          <button
            type="button"
            className={`notification-filter-tab ${activeTab === "unread" ? "active" : ""}`}
            onClick={() => setActiveTab("unread")}
          >
            <span>📬 Chưa đọc</span>
            <span className="notification-tab-count" style={{ background: unreadCount > 0 ? "#dc2626" : undefined, color: unreadCount > 0 ? "#fff" : undefined }}>
              {unreadCount}
            </span>
          </button>

          <button
            type="button"
            className={`notification-filter-tab ${activeTab === "urgent" ? "active" : ""}`}
            onClick={() => setActiveTab("urgent")}
          >
            <span>🚨 Khẩn cấp & Triage</span>
            <span className="notification-tab-count">{urgentCount}</span>
          </button>

          <button
            type="button"
            className={`notification-filter-tab ${activeTab === "guide_ack" ? "active" : ""}`}
            onClick={() => setActiveTab("guide_ack")}
          >
            <span>❓ Chưa hiểu thuốc</span>
            <span className="notification-tab-count">{guideAckCount}</span>
          </button>

          <button
            type="button"
            className={`notification-filter-tab ${activeTab === "suspect" ? "active" : ""}`}
            onClick={() => setActiveTab("suspect")}
          >
            <span>🔍 Gợi ý tác nhân AI</span>
            <span className="notification-tab-count">{suspectCount}</span>
          </button>

          <button
            type="button"
            className={`notification-filter-tab ${activeTab === "green" ? "active" : ""}`}
            onClick={() => setActiveTab("green")}
          >
            <span>🟢 Theo dõi ổn định</span>
            <span className="notification-tab-count">{greenCount}</span>
          </button>

          <button
            type="button"
            className={`notification-filter-tab ${activeTab === "read" ? "active" : ""}`}
            onClick={() => setActiveTab("read")}
          >
            <span>✓ Đã xem</span>
            <span className="notification-tab-count">{readCount}</span>
          </button>
        </div>

        {/* SEARCH BAR & ACTION BUTTONS */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
          <div className="dashboard-search-bar" style={{ margin: 0, flex: 1, minWidth: 260 }}>
            <span className="dashboard-search-icon">🔍</span>
            <input
              type="text"
              className="dashboard-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm thông báo (tên bệnh nhân, tên thuốc, triệu chứng, ngày giờ)..."
            />
            {searchQuery && (
              <button
                type="button"
                className="dashboard-search-clear"
                onClick={() => setSearchQuery("")}
                title="Xóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontWeight: 700, padding: "7px 14px", background: "#f8fafc" }}
                onClick={markAll}
                title="Đánh dấu tất cả là đã đọc"
              >
                ✓ Đánh dấu tất cả đã đọc
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: "7px 12px" }}
              onClick={load}
              disabled={loading}
              title="Làm mới danh sách"
            >
              {loading ? "⏳ Đang tải..." : "🔄 Làm mới"}
            </button>
          </div>
        </div>

        {searchQuery && (
          <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 10 }}>
            Tìm thấy <strong>{filteredItems.length}</strong> / {totalCount} thông báo khớp với &ldquo;<strong>{searchQuery}</strong>&rdquo;
          </div>
        )}
      </div>

      {/* NOTIFICATIONS LIST */}
      <div>
        {filteredItems.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <EmptyState
              icon={searchQuery ? "🔍" : activeTab === "unread" ? "🎉" : "🔔"}
              text={
                searchQuery
                  ? `Không tìm thấy thông báo nào khớp với "${searchQuery}"`
                  : activeTab === "unread"
                  ? "Tuyệt vời! Không còn thông báo nào chưa đọc."
                  : "Chưa có thông báo nào trong danh mục này."
              }
            />
          </div>
        )}

        {filteredItems.map((n) => {
          const meta = KIND_META_MAP[n.kind] ?? {
            icon: "•",
            label: "THÔNG BÁO LÂM SÀNG",
            type: "neutral",
            badgeCls: "badge-neutral",
          };

          const formattedDate = new Date(n.created_at).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });

          return (
            <div
              key={n.id}
              className={`notification-item-card type-${meta.type} ${n.is_read ? "is-read" : ""}`}
            >
              {/* Header */}
              <div className="notification-card-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className={`badge ${meta.badgeCls}`} style={{ fontSize: "0.72rem", fontWeight: 800 }}>
                    {meta.icon} {meta.label}
                  </span>

                  {!n.is_read ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: "#0284c7",
                        background: "#e0f2fe",
                        padding: "2px 8px",
                        borderRadius: 12,
                      }}
                    >
                      <span className="pulse-dot" style={{ width: 6, height: 6, background: "#0284c7" }}></span>
                      Mới chưa đọc
                    </span>
                  ) : (
                    <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>
                      ✓ Đã xem
                    </span>
                  )}
                </div>

                <div className="notification-time-stamp">
                  <span>🕒 {formattedDate}</span>
                </div>
              </div>

              {/* Title */}
              <div className="notification-card-title">
                {n.title}
              </div>

              {/* Body */}
              <div className="notification-card-body">
                {n.body}
              </div>

              {/* Footer Actions */}
              <div className="notification-card-footer">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Link
                    href="/doctor"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.78rem", padding: "4px 10px", color: "#0369a1", fontWeight: 700, textDecoration: "none" }}
                  >
                    🩺 Xem Cổng Bác sĩ →
                  </Link>
                </div>

                <div>
                  {!n.is_read ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: "0.78rem", padding: "4px 14px", fontWeight: 700 }}
                      onClick={() => markRead(n.id)}
                    >
                      ✓ Đánh dấu đã đọc
                    </button>
                  ) : (
                    <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontStyle: "italic" }}>
                      Đã ghi nhận
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
