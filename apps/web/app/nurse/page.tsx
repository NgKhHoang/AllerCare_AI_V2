"use client";

/**
 * Cổng điều dưỡng (tài liệu CHI TIẾT mục 3): hàng đợi phân luồng VÀNG cần kiểm tra,
 * xác nhận/từ chối kết quả TriageGuard, và thông báo kênh vai trò.
 */
import { useCallback, useEffect, useState } from "react";
import { api, getToken, getUser } from "../../lib/api";
import { AppShell, EmptyState, ErrorBox, SuccessBox, TriageBadge } from "../../components/ui";

interface QueueItem {
  id: string;
  profile_id: string;
  patient_name: string;
  message: string;
  reason: string;
  matched_labels: string[];
  status: string;
  created_at: string;
}

export default function NursePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user || user.role !== "nurse") {
      window.location.href = "/login";
      return;
    }
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      setQueue(await api<QueueItem[]>("/v1/triage/queue"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được hàng đợi");
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function confirm(id: string, decision: "confirmed" | "dismissed") {
    setError("");
    setSuccess("");
    try {
      await api(`/v1/triage/${id}/confirm`, { method: "POST", body: { decision } });
      setSuccess(decision === "confirmed" ? "Đã xác nhận phân luồng." : "Đã từ chối phân luồng (có ghi nhận).");
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được");
    }
  }

  return (
    <AppShell
      role="nurse"
      icon="🚦"
      title="Hàng đợi phân luồng"
      subtitle="Các khai báo mức VÀNG cần điều dưỡng/bác sĩ kiểm tra"
    >
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      <div className="card">
        <div className="card-title">
          <span className="t-ico">🟡</span> Chờ xác nhận ({queue.length})
        </div>
        {queue.length === 0 && (
          <EmptyState icon="✅" text="Không có khai báo nào chờ kiểm tra." />
        )}
        {queue.map((q) => (
          <div className="list-row" key={q.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div>
                <div className="list-title">{q.patient_name}</div>
                <div className="list-sub">{new Date(q.created_at).toLocaleString("vi-VN")}</div>
              </div>
              <TriageBadge level="yellow" />
            </div>
            <div className="alertbox alertbox-warning">
              <div className="alertbox-title">🗣 Khai báo</div>
              <div style={{ fontSize: 14 }}>{q.message}</div>
              <div style={{ fontSize: 13, marginTop: 6, color: "var(--text-secondary)" }}>
                <strong>Phân luồng:</strong> {q.reason}
                {q.matched_labels.length > 0 && (
                  <>
                    {" · "}
                    <strong>Dấu hiệu:</strong> {q.matched_labels.join(", ")}
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => confirm(q.id, "confirmed")}>
                ✓ Đã kiểm tra
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => confirm(q.id, "dismissed")}>
                ✕ Không xác nhận
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">
          <span className="t-ico">ℹ️</span> Phân công của bạn
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Các mức ĐỎ đã được hệ thống báo ngay cho bác sĩ điều trị + người nhà, không nằm trong
          hàng đợi này. Hãy kiểm tra mục <strong>Thông báo</strong> thường xuyên.
        </p>
      </div>
    </AppShell>
  );
}
