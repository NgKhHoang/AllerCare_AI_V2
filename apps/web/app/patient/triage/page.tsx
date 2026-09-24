"use client";

/**
 * TriageGuard AI — người bệnh khai triệu chứng → phân luồng 3 mức (xanh/vàng/đỏ).
 * Mức đỏ luôn hiển thị kêu gọi gọi 115 NGAY — không chờ duyệt (tài liệu CHI TIẾT mục 3).
 */
import { useEffect, useState } from "react";
import { api, getToken } from "../../../lib/api";
import { AppShell, EmptyState, ErrorBox, TriageBadge, EmergencyBanner } from "../../../components/ui";

interface TriageResult {
  id: string;
  level: "red" | "yellow" | "green";
  reason: string;
  action_patient: string;
  matched_labels: string[];
  status: string;
  created_at: string;
  message?: string;
}

export default function TriagePage() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<TriageResult | null>(null);
  const [history, setHistory] = useState<TriageResult[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    api<TriageResult[]>("/v1/triage/mine")
      .then(setHistory)
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await api<TriageResult>("/v1/triage", {
        method: "POST",
        body: { message: message.trim() },
      });
      setResult(r);
      setHistory((prev) => [r, ...prev].slice(0, 30));
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được khai báo");
    } finally {
      setLoading(false);
    }
  }

  const isRed = result?.level === "red";

  return (
    <AppShell
      role="patient"
      icon="🚦"
      title="Phân luồng AI"
      subtitle="Khai triệu chứng — hệ thống hỗ trợ phân luồng ban đầu (xanh / vàng / đỏ)"
    >
      {isRed && <EmergencyBanner />}

      <form onSubmit={submit} className="card">
        <div className="card-title">
          <span className="t-ico">🗣</span> Hôm nay bạn thấy thế nào?
        </div>
        <div className="field">
          <textarea
            className="textarea"
            rows={4}
            placeholder="Mô tả triệu chứng hôm nay. VD: Vùng da cũ đỡ hơn / Bắt đầu nổi mẩn đỏ hai cánh tay, ngứa nhiều / Uống thuốc xong bị khó thở, sưng môi…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>
        {error && <ErrorBox text={error} />}
        <button className="btn btn-primary" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Đang phân luồng…" : "🚦 Gửi khai báo"}
        </button>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Hệ thống chỉ hỗ trợ phân luồng ban đầu theo quy tắc khoa đã duyệt — không thay thế chẩn
          đoán của bác sĩ. Khẩn cấp: gọi <strong>115</strong> trực tiếp.
        </p>
      </form>

      {result && (
        <div
          className="card"
          style={{
            borderLeft:
              result.level === "red"
                ? "4px solid var(--danger, #dc2626)"
                : result.level === "yellow"
                ? "4px solid var(--warning, #d97706)"
                : "4px solid var(--ok, #16a34a)",
          }}
        >
          <div className="card-title">
            <span className="t-ico">📋</span> Kết quả phân luồng
          </div>
          <TriageBadge level={result.level} />
          <div
            className={isRed ? "alertbox alertbox-danger" : "alertbox alertbox-neutral"}
            style={{ marginTop: 10 }}
          >
            <div className="alertbox-title">
              {isRed ? "🚨 " : ""}
              {result.action_patient}
            </div>
            <div style={{ fontSize: 14 }}>{result.reason}</div>
            {result.matched_labels.length > 0 && (
              <div style={{ fontSize: 14, marginTop: 6 }}>
                <strong>Dấu hiệu nhận diện:</strong> {result.matched_labels.join(", ")}
              </div>
            )}
          </div>
          {isRed && (
            <a
              href="tel:115"
              className="btn btn-danger"
              style={{ width: "100%", marginTop: 10, textAlign: "center", fontSize: 18 }}
            >
              📞 GỌI CẤP CỨU 115 NGAY
            </a>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span className="t-ico">🕘</span> Lịch sử khai báo
        </div>
        {history.length === 0 && <EmptyState icon="🗂" text="Chưa có khai báo nào." />}
        {history.map((h) => (
          <div className="list-row" key={h.id}>
            <div className="list-main">
              <div className="list-title">{h.message ?? h.reason}</div>
              <div className="list-sub">{new Date(h.created_at).toLocaleString("vi-VN")}</div>
            </div>
            <TriageBadge level={h.level} />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
