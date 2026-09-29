"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { EmptyState, ErrorBox, SuccessBox, VerifiedBadge } from "./ui";

export interface TimelineMilestone {
  step: number;
  type: "start" | "medications" | "followup";
  date: string;
  title: string;
  diagnosis?: string;
  badge: string;
  badge_cls: string;
  items?: Array<{
    id: string;
    name: string;
    dose?: string | null;
    timing?: string | null;
    frequency?: string | null;
    prescriber?: string | null;
    verification?: string;
    status?: string;
  }>;
  description: string;
  icon: string;
}

export interface TreatmentTimelineData {
  profile_id: string;
  full_name: string;
  diagnosis: string;
  treatment_status: "active" | "transferred" | "completed";
  treatment_status_label: string;
  treatment_start_date: string;
  followup_date: string | null;
  admission_note: string | null;
  active_medications: Array<{
    id: string;
    name: string;
    dose?: string | null;
    timing?: string | null;
    frequency?: string | null;
    prescriber?: string | null;
    verification?: string;
    status?: string;
  }>;
  allergies: Array<{
    id: string;
    substance: string;
    severity?: string | null;
    reaction?: string | null;
    verification?: string;
  }>;
  milestones: TimelineMilestone[];
}

interface Props {
  profileId: string;
  isDoctor?: boolean;
  onRefresh?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string; color: string; bg: string }> = {
  active: {
    label: "Đang điều trị",
    badge: "badge badge-ok",
    color: "#16a34a",
    bg: "#f0fdf4",
  },
  transferred: {
    label: "Đã chuyển viện",
    badge: "badge badge-warning",
    color: "#ea580c",
    bg: "#fff7ed",
  },
  completed: {
    label: "Kết thúc điều trị",
    badge: "badge badge-neutral",
    color: "#475569",
    bg: "#f1f5f9",
  },
};

export function TreatmentTimeline({ profileId, isDoctor = false, onRefresh }: Props) {
  const [data, setData] = useState<TreatmentTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Form edit state
  const [editDiagnosis, setEditDiagnosis] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "transferred" | "completed">("active");
  const [editStartDate, setEditStartDate] = useState("");
  const [editFollowupDate, setEditFollowupDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadTimeline() {
    if (!profileId) return;
    try {
      setLoading(true);
      const res = await api<TreatmentTimelineData>(`/v1/patients/${profileId}/timeline`);
      setData(res);
      setEditDiagnosis(res.diagnosis || "");
      setEditStatus(res.treatment_status || "active");
      setEditStartDate(res.treatment_start_date || "");
      setEditFollowupDate(res.followup_date || "");
      setEditNote(res.admission_note || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tải tiến trình điều trị");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTimeline();
  }, [profileId]);

  async function handleSaveTreatment(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      await api(`/v1/patients/${profileId}/treatment`, {
        method: "PUT",
        body: JSON.stringify({
          diagnosis: editDiagnosis,
          treatment_status: editStatus,
          treatment_start_date: editStartDate,
          followup_date: editFollowupDate,
          admission_note: editNote,
        }),
      });
      setSuccess("Cập nhật tiến trình & loại bệnh điều trị thành công!");
      setIsEditing(false);
      await loadTimeline();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu tiến trình");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <p className="muted">Đang tải timeline điều trị…</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const currentStatus = STATUS_CONFIG[data.treatment_status] || STATUS_CONFIG.active;

  return (
    <div className="card" style={{ marginBottom: 20, border: "1px solid var(--border-default)", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {/* HEADER: Loại bệnh đang điều trị & Trạng thái */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          paddingBottom: 14,
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>🩺</span>
            <span style={{ fontSize: 13, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", color: "var(--brand-primary, #0284C7)" }}>
              Bệnh lý đang điều trị
            </span>
            <span className={currentStatus.badge} style={{ fontSize: 13, padding: "4px 10px" }}>
              {currentStatus.label}
            </span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", marginTop: 6, marginBottom: 2 }}>
            {data.diagnosis || "Chưa ghi nhận chẩn đoán chính"}
          </h2>
          {data.admission_note && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              📝 {data.admission_note}
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setIsEditing(!isEditing)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span>{isEditing ? "✕ Đóng chỉnh sửa" : "✏️ Cập nhật loại bệnh & Mốc điều trị"}</span>
        </button>
      </div>

      {/* FORM CHỈNH SỬA LOẠI BỆNH & TIẾN TRÌNH */}
      {isEditing && (
        <form
          onSubmit={handleSaveTreatment}
          style={{
            marginTop: 16,
            marginBottom: 16,
            padding: 16,
            background: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "var(--text-primary)" }}>
            {isDoctor ? "🩺 Bác sĩ cập nhật loại bệnh & kế hoạch điều trị" : "📝 Cập nhật loại bệnh đang điều trị"}
          </div>

          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field">
              <label className="label">Loại bệnh / Chẩn đoán đang điều trị</label>
              <input
                className="input"
                placeholder="VD: Đái tháo đường típ 2 & Tăng huyết áp mạn tính, Viêm da tiếp xúc..."
                value={editDiagnosis}
                onChange={(e) => setEditDiagnosis(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="label">Trạng thái điều trị</label>
              <select
                className="input"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as "active" | "transferred" | "completed")}
              >
                <option value="active">🟢 Đang điều trị</option>
                <option value="transferred">🟠 Đã chuyển viện</option>
                <option value="completed">🟣 Kết thúc điều trị</option>
              </select>
            </div>
          </div>

          <div className="grid-2" style={{ gap: 12, marginTop: 10 }}>
            <div className="field">
              <label className="label">Thời gian bắt đầu điều trị (YYYY-MM-DD)</label>
              <input
                className="input"
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">Mốc tái khám dự kiến (YYYY-MM-DD)</label>
              <input
                className="input"
                type="date"
                value={editFollowupDate}
                onChange={(e) => setEditFollowupDate(e.target.value)}
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <label className="label">Ghi chú diễn biến điều trị / Lời dặn</label>
            <input
              className="input"
              placeholder="VD: Tiếp tục theo dõi đường huyết đói, kiểm tra chức năng thận sau 1 tháng..."
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditing(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Đang lưu…" : "💾 Lưu thay đổi"}
            </button>
          </div>
        </form>
      )}

      {/* CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ (CỘT NGANG - HORIZONTAL TIMELINE) */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>📈 CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ (CỘT NGANG)</span>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Bắt đầu: <strong>{data.treatment_start_date}</strong> → Tái khám: <strong>{data.followup_date || "Chưa hẹn"}</strong>
          </span>
        </div>

        {/* Horizontal Timeline Container */}
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
            padding: "20px 10px 10px",
            background: "linear-gradient(to right, #f8fafc, #f1f5f9)",
            borderRadius: 12,
            border: "1px solid var(--border-default)",
          }}
        >
          {/* Continuous horizontal connecting line */}
          <div
            style={{
              position: "absolute",
              top: 36,
              left: "16%",
              right: "16%",
              height: 4,
              background: "linear-gradient(90deg, #0284C7 0%, #10B981 50%, #F59E0B 100%)",
              zIndex: 1,
              borderRadius: 2,
            }}
          />

          {/* MỐC 1: BẮT ĐẦU ĐIỀU TRỊ */}
          <div
            style={{
              position: "relative",
              zIndex: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#0284C7",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                boxShadow: "0 0 0 4px #e0f2fe",
                marginBottom: 10,
              }}
            >
              🚩
            </div>
            <span className="badge badge-info" style={{ fontSize: 11, marginBottom: 4 }}>
              1. Bắt đầu điều trị
            </span>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {data.treatment_start_date}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, maxWidth: 220 }}>
              Tiếp nhận bệnh án: <strong>{data.diagnosis || "Chẩn đoán ban đầu"}</strong>
            </p>
          </div>

          {/* MỐC 2: CÁC MỐC SỬ DỤNG THUỐC */}
          <div
            style={{
              position: "relative",
              zIndex: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#10B981",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                boxShadow: "0 0 0 4px #d1fae5",
                marginBottom: 10,
              }}
            >
              💊
            </div>
            <span className="badge badge-ok" style={{ fontSize: 11, marginBottom: 4 }}>
              2. Các mốc dùng thuốc ({data.active_medications.length})
            </span>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {data.active_medications.length > 0 ? "Đang uống theo giờ" : "Chưa có thuốc"}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, maxWidth: 220 }}>
              {data.active_medications.slice(0, 2).map((m) => m.name).join(", ") || "Chưa có thuốc chỉ định"}
              {data.active_medications.length > 2 ? ` và ${data.active_medications.length - 2} thuốc khác` : ""}
            </p>
          </div>

          {/* MỐC 3: MỐC TÁI KHÁM */}
          <div
            style={{
              position: "relative",
              zIndex: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: data.followup_date ? "#F59E0B" : "#94A3B8",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                boxShadow: data.followup_date ? "0 0 0 4px #fef3c7" : "0 0 0 4px #f1f5f9",
                marginBottom: 10,
              }}
            >
              🗓️
            </div>
            <span
              className={data.followup_date ? "badge badge-warning" : "badge badge-neutral"}
              style={{ fontSize: 11, marginBottom: 4 }}
            >
              3. Mốc tái khám
            </span>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {data.followup_date || "Chưa hẹn ngày"}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, maxWidth: 220 }}>
              {data.followup_date ? "Tái khám đánh giá hiệu quả & đáp ứng thuốc" : "Bác sĩ sẽ chỉ định ngày tái khám"}
            </p>
          </div>
        </div>
      </div>

      {/* CHI TIẾT: THUỐC ĐANG DÙNG TRONG ĐỢT ĐIỀU TRỊ & DỊ ỨNG */}
      <div className="grid-2" style={{ marginTop: 20, gap: 14 }}>
        {/* Thuốc đang dùng */}
        <div style={{ background: "#ffffff", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
            <span>💊 Thuốc trong đợt điều trị ({data.active_medications.length})</span>
            <span className="badge badge-ok">Đang dùng</span>
          </div>
          {data.active_medications.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0 }}>Chưa có thuốc nào trong đợt điều trị này.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.active_medications.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: "8px 10px",
                    background: "#f8fafc",
                    borderRadius: 6,
                    border: "1px solid #edf2f7",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#166534" }}>
                      💊 {m.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                      {m.dose ? `Liều: ${m.dose}` : ""} {m.timing ? `· ⏰ ${m.timing}` : ""} {m.frequency ? `· 🔄 ${m.frequency}` : ""}
                    </div>
                  </div>
                  {m.verification && <VerifiedBadge verification={m.verification} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tiền sử dị ứng */}
        <div style={{ background: "#ffffff", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
            <span>🚫 Tiền sử dị ứng ({data.allergies.length})</span>
            <span className="badge badge-danger">Cần cảnh giác</span>
          </div>
          {data.allergies.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0 }}>Chưa ghi nhận dị ứng thuốc nào.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.allergies.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: "8px 10px",
                    background: "#fff5f5",
                    borderRadius: 6,
                    border: "1px solid #fed7d7",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#c53030" }}>
                      🚫 {a.substance}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                      Phản ứng: {a.reaction || "Dị ứng thuốc"} {a.severity ? `(Mức độ: ${a.severity})` : ""}
                    </div>
                  </div>
                  {a.verification && <VerifiedBadge verification={a.verification} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
