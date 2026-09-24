"use client";

/**
 * Quality Dashboard (tài liệu CHI TIẾT mục 6): chỉ số tổng hợp ẩn danh cho lãnh đạo khoa.
 * Không hiển thị dữ liệu lâm sàng từng ca — đúng giới hạn vai trò leader.
 */
import { useEffect, useState } from "react";
import { api, getToken, getUser } from "../../lib/api";
import { AppShell, EmptyState, ErrorBox } from "../../components/ui";

interface QualityData {
  triage: { total: number; by_level: Record<string, number>; last_7_days: number };
  safety_checks: { total: number; by_status: Record<string, number> };
  alerts: { by_severity: Record<string, number>; top_rules: [string, number][] };
  response_time: { avg_hours_to_review: number | null; reviews_total: number };
  suspect_rankings: { total: number; confirmed: number };
  note: string;
}

const LEVEL_LABELS: Record<string, string> = {
  red: "🔴 Đỏ (cấp cứu)",
  yellow: "🟡 Vàng (cần đánh giá)",
  green: "🟢 Xanh (theo dõi)",
};

const CHECK_STATUS: Record<string, string> = {
  has_alerts: "Có cảnh báo",
  no_alerts_in_scope: "Không phát hiện trong phạm vi",
  insufficient_data: "Chưa đủ dữ liệu",
  out_of_scope: "Ngoài phạm vi",
  failed: "Thất bại",
};

const SEVERITY: Record<string, string> = {
  high: "⚠ Cao",
  medium: "Trung bình",
  low: "Thấp",
};

export default function LeaderPage() {
  const [data, setData] = useState<QualityData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user || user.role !== "leader") {
      window.location.href = "/login";
      return;
    }
    api<QualityData>("/v1/dashboard/quality")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được dashboard"));
  }, []);

  return (
    <AppShell
      role="leader"
      icon="📊"
      title="Quality Dashboard"
      subtitle="Chỉ số an toàn người bệnh — số liệu tổng hợp ẩn danh"
    >
      {error && <ErrorBox text={error} />}
      {!data && !error && <EmptyState icon="⏳" text="Đang tải chỉ số…" />}
      {data && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="s-num">{data.triage.total}</div>
              <div className="s-label">Phân luồng tổng</div>
            </div>
            <div className="stat">
              <div className="s-num">{data.triage.last_7_days}</div>
              <div className="s-label">Trong 7 ngày</div>
            </div>
            <div className="stat">
              <div className="s-num">
                {data.response_time.avg_hours_to_review !== null
                  ? `${data.response_time.avg_hours_to_review}h`
                  : "—"}
              </div>
              <div className="s-label">TB thời gian phản hồi</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-title">
                <span className="t-ico">🚦</span> Phân luồng theo mức
              </div>
              {Object.keys(data.triage.by_level).length === 0 && (
                <EmptyState icon="🚦" text="Chưa có dữ liệu phân luồng." />
              )}
              {Object.entries(data.triage.by_level).map(([lvl, n]) => (
                <div className="list-row" key={lvl}>
                  <div className="list-main">
                    <div className="list-title">{LEVEL_LABELS[lvl] ?? lvl}</div>
                  </div>
                  <span className="badge badge-info">{n}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title">
                <span className="t-ico">🛡</span> Kiểm tra an toàn (MedSafe)
              </div>
              <div className="list-sub" style={{ marginBottom: 8 }}>
                Tổng: {data.safety_checks.total} lần kiểm tra
              </div>
              {Object.entries(data.safety_checks.by_status).map(([s, n]) => (
                <div className="list-row" key={s}>
                  <div className="list-main">
                    <div className="list-title">{CHECK_STATUS[s] ?? s}</div>
                  </div>
                  <span className="badge badge-info">{n}</span>
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                <div className="list-title" style={{ fontSize: 14 }}>
                  Cảnh báo theo mức độ
                </div>
                {Object.entries(data.alerts.by_severity).map(([s, n]) => (
                  <div className="list-row" key={s}>
                    <div className="list-main">
                      <div className="list-title">{SEVERITY[s] ?? s}</div>
                    </div>
                    <span className="badge badge-neutral">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span className="t-ico">🔍</span> Xếp hạng tác nhân nghi ngờ
            </div>
            <div className="list-row">
              <div className="list-main">
                <div className="list-title">Tổng lần xếp hạng</div>
              </div>
              <span className="badge badge-info">{data.suspect_rankings.total}</span>
            </div>
            <div className="list-row">
              <div className="list-main">
                <div className="list-title">Đã bác sĩ xác nhận</div>
              </div>
              <span className="badge badge-ok">{data.suspect_rankings.confirmed}</span>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 13 }}>
            {data.note}
          </p>
        </>
      )}
    </AppShell>
  );
}
