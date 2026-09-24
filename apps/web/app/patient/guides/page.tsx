"use client";

/**
 * Hướng dẫn dùng thuốc đã bác sĩ duyệt (tài liệu CHI TIẾT mục 4).
 * Người bệnh bấm "Tôi đã hiểu cách sử dụng thuốc" hoặc "Chưa hiểu" → tự chuyển câu hỏi cho NVYT.
 */
import { useEffect, useState } from "react";
import { api, getToken } from "../../../lib/api";
import { AppShell, EmptyState, ErrorBox, SuccessBox } from "../../../components/ui";

interface GuideContent {
  drug_name: string;
  ingredient: string;
  purpose: string;
  dose: string;
  timing: string;
  howto: string;
  warnings: string[];
  warning_signs: string[];
  followup: string;
  source_label: string;
}

interface Guide {
  id: string;
  content: GuideContent;
  status: string;
  acknowledgment: string;
  created_at: string;
}

export default function GuidesPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [error, setError] = useState("");
  const [ack, setAck] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    api<Guide[]>("/v1/guides/mine")
      .then(setGuides)
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được hướng dẫn"));
  }, []);

  async function respond(guideId: string, value: "understood" | "not_understood") {
    setError("");
    try {
      await api(`/v1/guides/${guideId}/acknowledge`, {
        method: "POST",
        body: { acknowledgment: value },
      });
      setAck((prev) => ({ ...prev, [guideId]: value }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được xác nhận");
    }
  }

  return (
    <AppShell
      role="patient"
      icon="📖"
      title="Hướng dẫn dùng thuốc"
      subtitle="Do AI soạn từ toa thuốc và đã được bác sĩ duyệt"
    >
      {error && <ErrorBox text={error} />}
      {guides.length === 0 && !error && (
        <EmptyState icon="📖" text="Chưa có hướng dẫn nào được bác sĩ gửi cho bạn." />
      )}
      {guides.map((g) => {
        const c = g.content;
        const state = ack[g.id] ?? g.acknowledgment;
        return (
          <div className="card" key={g.id}>
            <div className="card-title">
              <span className="t-ico">💊</span> {c.drug_name}
              {state === "understood" && <span style={{ marginLeft: "auto" }}><span className="badge badge-ok">✓ Đã hiểu</span></span>}
              {state === "not_understood" && <span style={{ marginLeft: "auto" }}><span className="badge badge-warning">Đã gửi câu hỏi cho NVYT</span></span>}
            </div>
            <div className="list-sub" style={{ marginBottom: 10 }}>
              Hoạt chất: {c.ingredient} · Mục đích: {c.purpose}
            </div>

            <div className="alertbox alertbox-neutral" style={{ marginBottom: 10 }}>
              <div className="alertbox-title">
                💊 Liều: {c.dose} · Thời điểm: {c.timing}
              </div>
              <div style={{ fontSize: 14 }}>{c.howto}</div>
            </div>

            {c.warning_signs?.length > 0 && (
              <div className="alertbox alertbox-danger" style={{ marginBottom: 10 }}>
                <div className="alertbox-title">🚨 Dấu hiệu cần dừng thuốc / cấp cứu</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 20, fontSize: 14 }}>
                  {c.warning_signs.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {c.warnings?.length > 0 && (
              <div style={{ fontSize: 14, marginBottom: 10 }}>
                <strong>Lưu ý khi dùng:</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                  {c.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ fontSize: 14, marginBottom: 10 }}>
              <strong>📅 Tái khám:</strong> {c.followup}
            </div>
            <div className="source" style={{ marginBottom: 12 }}>
              Nguồn: {c.source_label} · Ngày gửi: {new Date(g.created_at).toLocaleDateString("vi-VN")}
            </div>

            {state === "understood" ? (
              <SuccessBox text="Bạn đã xác nhận hiểu cách sử dụng thuốc này." />
            ) : state === "not_understood" ? (
              <SuccessBox text="Đã chuyển câu hỏi của bạn cho bác sĩ/điều dưỡng. Bạn sẽ được liên hệ giải thích lại." />
            ) : (
              <>
                <div className="label" style={{ marginBottom: 6 }}>
                  Bạn đã hiểu cách sử dụng thuốc này chưa?
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={() => respond(g.id, "understood")}>
                    ✓ Tôi đã hiểu cách sử dụng thuốc
                  </button>
                  <button className="btn btn-secondary" onClick={() => respond(g.id, "not_understood")}>
                    ✕ Tôi chưa hiểu — cần giải thích lại
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {guides.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span className="t-ico">🛡</span> An toàn chung
          </div>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Gặp nổi mẩn, ngứa nhiều, sưng mặt/môi hoặc khó thở sau khi dùng thuốc:{" "}
            <strong>ngừng thuốc</strong>, dùng mục <strong>Phân luồng AI</strong> hoặc gọi{" "}
            <strong>115</strong> ngay nếu khó thở nặng.
          </p>
        </div>
      )}
    </AppShell>
  );
}
