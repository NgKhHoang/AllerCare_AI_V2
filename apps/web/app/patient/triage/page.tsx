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

  const todayFormatted = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const QUICK_SYMPTOM_SUGGESTIONS = [
    "Khỏe, tổn thương da đỡ hơn, không ngứa",
    "Còn ngứa rát, tổn thương da chưa giảm",
    "Bắt đầu nổi mẩn đỏ, ngứa nhiều",
    "Sốt nhẹ, mệt mỏi sau khi uống thuốc",
    "🚨 Cấp cứu: Khó thở, tức ngực, sưng phù môi lưỡi",
  ];

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
      const todayStr = new Date().toISOString().slice(0, 10);
      try {
        localStorage.setItem(`allercare_triage_done_${todayStr}`, "true");
      } catch {
        // LocalStorage not accessible
      }
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
      title="Phân luồng TriageGuard AI"
      subtitle="Khai báo triệu chứng hàng ngày — hệ thống hỗ trợ phân luồng 3 mức (xanh / vàng / đỏ)"
    >
      {isRed && <EmergencyBanner />}

      {/* BANNER QUY TẮC BẮT BUỘC HÀNG NGÀY */}
      <div
        style={{
          background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
          border: "1px solid #bae6fd",
          borderRadius: "var(--radius-card)",
          padding: "16px 20px",
          marginBottom: 18,
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          boxShadow: "0 2px 4px rgba(2, 132, 199, 0.06)",
        }}
      >
        <div style={{ fontSize: 24, lineHeight: 1 }}>📌</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, color: "#0369a1", marginBottom: 4 }}>
            QUY TẮC THEO DÕI SỨC KHỎE HÀNG NGÀY:
          </div>
          <div style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.6 }}>
            Mỗi ngày, <strong>Bệnh nhân hoặc Người nhà</strong> bắt buộc phải nhập <strong>&quot;Mô tả triệu chứng hôm nay&quot;</strong> tại đây để hệ thống AI tự động phân luồng cấp cứu kịp thời và Bác sĩ theo dõi sát sao tiến triển điều trị.
          </div>
          <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#0284c7", backgroundColor: "#ffffff", padding: "4px 10px", borderRadius: 8, border: "1px solid #bae6fd" }}>
            <span>🗓</span>
            <span style={{ textTransform: "capitalize" }}>{todayFormatted}</span>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="card">
        <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span>🗣 Hôm nay bạn thấy thế nào?</span>
          <span className="badge badge-info" style={{ fontSize: 12 }}>Khai báo ngày</span>
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <label className="label" style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8, display: "block" }}>
            Mô tả triệu chứng hôm nay : <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <textarea
            className="textarea"
            style={{
              width: "100%",
              minHeight: 140,
              padding: "14px 16px",
              fontSize: 15,
              lineHeight: 1.6,
              borderRadius: 12,
              border: "1.5px solid #cbd5e1",
              backgroundColor: "#ffffff",
              boxSizing: "border-box",
            }}
            placeholder="Mô tả chi tiết triệu chứng hôm nay. VD: Vùng da cẳng chân đã bớt đỏ, không còn ngứa rát / Bắt đầu xuất hiện ban đỏ mới ở bắp tay / Sau khi uống thuốc thấy chóng mặt, mệt mỏi..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>

        {/* GỢI Ý TRIỆU CHỨNG NHANH */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
            💡 Gợi ý nhanh (Bấm để thêm vào mô tả):
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_SYMPTOM_SUGGESTIONS.map((sug) => (
              <button
                key={sug}
                type="button"
                className="btn btn-secondary btn-sm"
                style={{
                  fontSize: 12,
                  padding: "5px 12px",
                  borderRadius: 20,
                  backgroundColor: sug.includes("🚨") ? "#fef2f2" : "#f8fafc",
                  borderColor: sug.includes("🚨") ? "#fecaca" : "#e2e8f0",
                  color: sug.includes("🚨") ? "#dc2626" : "#334155",
                  fontWeight: sug.includes("🚨") ? 700 : 500,
                }}
                onClick={() => {
                  setMessage((prev) => (prev ? `${prev}. ${sug}` : sug));
                }}
              >
                + {sug}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorBox text={error} />}

        <button className="btn btn-primary" disabled={loading} style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 700 }}>
          {loading ? "⏳ Đang phân luồng triệu chứng..." : "🚦 Gửi khai báo & Phân luồng AI"}
        </button>

        <p className="muted" style={{ marginTop: 10, fontSize: 13, textAlign: "center" }}>
          Hệ thống hỗ trợ phân luồng ban đầu theo phác đồ khoa đã duyệt — không thay thế chẩn đoán của bác sĩ. Trường hợp khẩn cấp hãy gọi <strong>115</strong> ngay.
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
