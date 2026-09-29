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

export interface DiseaseCondition {
  id: string;
  name: string;
  status: "active" | "transferred" | "completed";
  status_label: string;
  start_date: string;
  followup_date: string | null;
  note?: string | null;
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
  conditions: DiseaseCondition[];
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

const STATUS_CONFIG: Record<string, { label: string; badge: string; color: string; bg: string; border: string }> = {
  active: {
    label: "Đang điều trị",
    badge: "badge badge-ok",
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
  },
  transferred: {
    label: "Đã chuyển viện",
    badge: "badge badge-warning",
    color: "#ea580c",
    bg: "#fff7ed",
    border: "#fed7aa",
  },
  completed: {
    label: "Kết thúc điều trị",
    badge: "badge badge-neutral",
    color: "#475569",
    bg: "#f8fafc",
    border: "#e2e8f0",
  },
};

export function TreatmentTimeline({ profileId, isDoctor = false, onRefresh }: Props) {
  const [data, setData] = useState<TreatmentTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Navigation state: null = Trang 1 (Danh sách bệnh & Dị ứng), string = Trang 2 (Chi tiết bệnh được chọn)
  const [selectedConditionId, setSelectedConditionId] = useState<string | null>(null);

  // Form edit selected condition
  const [isEditing, setIsEditing] = useState(false);
  const [editDiagnosis, setEditDiagnosis] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "transferred" | "completed">("active");
  const [editStartDate, setEditStartDate] = useState("");
  const [editFollowupDate, setEditFollowupDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Form add new condition
  const [isAdding, setIsAdding] = useState(false);
  const [newCondName, setNewCondName] = useState("");
  const [newCondStatus, setNewCondStatus] = useState<"active" | "transferred" | "completed">("active");
  const [newCondStartDate, setNewCondStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [newCondFollowupDate, setNewCondFollowupDate] = useState("");
  const [newCondNote, setNewCondNote] = useState("");
  const [adding, setAdding] = useState(false);

  async function loadTimeline(maintainSelection = true) {
    if (!profileId) return;
    try {
      setLoading(true);
      const res = await api<TreatmentTimelineData>(`/v1/patients/${profileId}/timeline`);
      setData(res);
      if (!maintainSelection) {
        setSelectedConditionId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tải tiến trình điều trị");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTimeline(false);
  }, [profileId]);

  // Lấy condition đang được chọn xem chi tiết
  const activeCondition: DiseaseCondition | undefined = data?.conditions?.find(
    (c) => c.id === selectedConditionId
  );

  function startEditCondition(cond: DiseaseCondition) {
    setEditDiagnosis(cond.name);
    setEditStatus(cond.status || "active");
    setEditStartDate(cond.start_date || "");
    setEditFollowupDate(cond.followup_date || "");
    setEditNote(cond.note || "");
    setIsEditing(true);
  }

  async function handleSaveCondition(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCondition) return;
    try {
      setSaving(true);
      setError("");
      await api(`/v1/patients/${profileId}/treatment`, {
        method: "PUT",
        body: {
          condition_id: activeCondition.id,
          diagnosis: editDiagnosis,
          treatment_status: editStatus,
          treatment_start_date: editStartDate,
          followup_date: editFollowupDate,
          admission_note: editNote,
        },
      });
      setSuccess("Cập nhật phác đồ điều trị thành công!");
      setIsEditing(false);
      await loadTimeline(true);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu tiến trình");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCondition(e: React.FormEvent) {
    e.preventDefault();
    if (!newCondName.trim()) {
      setError("Vui lòng nhập tên loại bệnh điều trị");
      return;
    }
    try {
      setAdding(true);
      setError("");
      await api(`/v1/patients/${profileId}/treatment`, {
        method: "PUT",
        body: {
          new_condition_name: newCondName.trim(),
          treatment_status: newCondStatus,
          treatment_start_date: newCondStartDate,
          followup_date: newCondFollowupDate,
          admission_note: newCondNote,
        },
      });
      setSuccess(`Đã thêm bệnh "${newCondName}" vào danh sách điều trị!`);
      setIsAdding(false);
      setNewCondName("");
      setNewCondNote("");
      await loadTimeline(true);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể thêm loại bệnh");
    } finally {
      setAdding(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <p className="muted">Đang tải thông tin điều trị…</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // ==========================================
  // VIEW 2: TRANG 2 - CHI TIẾT LOẠI BỆNH & CÂY TIMELINE
  // ==========================================
  if (selectedConditionId && activeCondition) {
    const statusCfg = STATUS_CONFIG[activeCondition.status] || STATUS_CONFIG.active;
    const condStartDate = activeCondition.start_date || data.treatment_start_date || "2026-09-01";
    const condFollowupDate = activeCondition.followup_date || data.followup_date || "Chưa hẹn";

    return (
      <div className="card" style={{ marginBottom: 20, border: "1px solid var(--border-default)", boxShadow: "0 4px 16px rgba(0,0,0,0.04)" }}>
        {error && <ErrorBox text={error} />}
        {success && <SuccessBox text={success} />}

        {/* Nút quay lại Trang 1 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSelectedConditionId(null);
              setIsEditing(false);
              setError("");
              setSuccess("");
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}
          >
            ← Quay lại danh sách bệnh của {data.full_name}
          </button>

          {isDoctor && !isEditing && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => startEditCondition(activeCondition)}
              style={{ fontSize: "0.85rem", padding: "6px 14px" }}
            >
              ✏️ Chỉnh sửa phác đồ bệnh này
            </button>
          )}
        </div>

        {/* HEADER CHI TIẾT BỆNH */}
        <div
          style={{
            padding: "16px 20px",
            background: statusCfg.bg,
            borderRadius: 12,
            border: `1px solid ${statusCfg.border}`,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4 }}>
              Chi tiết loại bệnh đang điều trị
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem", color: "var(--text-primary)", fontWeight: 800 }}>
                🩺 {activeCondition.name}
              </h3>
              <span className={statusCfg.badge} style={{ fontSize: "0.85rem", padding: "3px 10px" }}>
                ● {statusCfg.label}
              </span>
            </div>
            {activeCondition.note && (
              <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                Lời dặn / Ghi chú: {activeCondition.note}
              </p>
            )}
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Khởi phát điều trị: <strong>{condStartDate}</strong></div>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Hẹn tái khám: <strong style={{ color: "#d97706" }}>{condFollowupDate}</strong></div>
          </div>
        </div>

        {/* MODAL FORM CHỈNH SỬA PHÁC ĐỒ BỆNH NÀY */}
        {isEditing && (
          <form
            onSubmit={handleSaveCondition}
            style={{
              padding: 18,
              marginBottom: 20,
              background: "var(--bg-elevated, #f8fafc)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
            }}
          >
            <h4 style={{ margin: "0 0 14px", fontSize: "1rem", color: "var(--text-primary)" }}>
              ✏️ Cập nhật phác đồ: {activeCondition.name}
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Tên loại bệnh / Chẩn đoán</label>
                <input
                  type="text"
                  className="input"
                  value={editDiagnosis}
                  onChange={(e) => setEditDiagnosis(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Trạng thái điều trị</label>
                <select
                  className="input"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as "active" | "transferred" | "completed")}
                >
                  <option value="active">🟢 Đang điều trị</option>
                  <option value="transferred">🟡 Đã chuyển viện</option>
                  <option value="completed">⚪ Kết thúc điều trị</option>
                </select>
              </div>

              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Thời gian bắt đầu (YYYY-MM-DD)</label>
                <input
                  type="date"
                  className="input"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Mốc tái khám dự kiến (YYYY-MM-DD)</label>
                <input
                  type="date"
                  className="input"
                  value={editFollowupDate}
                  onChange={(e) => setEditFollowupDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Ghi chú diễn biến / Lời dặn của bác sĩ</label>
              <textarea
                className="input"
                rows={2}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="VD: Tiếp tục dùng thuốc kháng tiết, hẹn nội soi kiểm tra sau 1 tháng..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Đang lưu…" : "💾 Lưu thay đổi"}
              </button>
            </div>
          </form>
        )}

        {/* CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ (1 CỘT NGANG) */}
        <div style={{ marginTop: 10, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h4 style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              📈 CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ (CỘT NGANG)
            </h4>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Bắt đầu: <strong>{condStartDate}</strong> ➔ Tái khám: <strong>{condFollowupDate}</strong>
            </span>
          </div>

          {/* THANH TIMELINE NGANG VỚI 3 MỐC KẾT NỐI */}
          <div style={{ position: "relative", padding: "24px 10px 10px" }}>
            {/* Đường ray gradient nối 3 trạm */}
            <div
              style={{
                position: "absolute",
                top: 45,
                left: "15%",
                right: "15%",
                height: 6,
                background: "linear-gradient(90deg, #0284C7 0%, #10B981 50%, #F59E0B 100%)",
                borderRadius: 4,
                zIndex: 1,
                opacity: 0.85,
              }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
                position: "relative",
                zIndex: 2,
              }}
            >
              {/* MỐC 1: BẮT ĐẦU ĐIỀU TRỊ */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "#0284C7",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.3rem",
                    boxShadow: "0 0 0 6px #e0f2fe, 0 4px 8px rgba(0,0,0,0.1)",
                    marginBottom: 12,
                  }}
                >
                  🚩
                </div>
                <span className="badge badge-info" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
                  Mốc 1: Khởi đầu
                </span>
                <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>Bắt đầu điều trị</strong>
                <span style={{ fontSize: "0.8rem", color: "#0284c7", fontWeight: 600 }}>{condStartDate}</span>
                <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "4px 0 0", maxWidth: 180 }}>
                  Chẩn đoán: {activeCondition.name}
                </p>
              </div>

              {/* MỐC 2: CÁC MỐC SỬ DỤNG THUỐC */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "#10B981",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.3rem",
                    boxShadow: "0 0 0 6px #d1fae5, 0 4px 8px rgba(0,0,0,0.1)",
                    marginBottom: 12,
                  }}
                >
                  💊
                </div>
                <span className="badge badge-ok" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
                  Mốc 2: Dùng thuốc
                </span>
                <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>Mốc sử dụng thuốc</strong>
                <span style={{ fontSize: "0.8rem", color: "#059669", fontWeight: 600 }}>
                  {data.active_medications?.length || 0} loại thuốc đang dùng
                </span>
                <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "4px 0 0", maxWidth: 180 }}>
                  Tuân thủ đúng liều lượng và thời điểm uống thuốc
                </p>
              </div>

              {/* MỐC 3: MỐC TÁI KHÁM */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "#F59E0B",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.3rem",
                    boxShadow: "0 0 0 6px #fef3c7, 0 4px 8px rgba(0,0,0,0.1)",
                    marginBottom: 12,
                  }}
                >
                  🗓️
                </div>
                <span className="badge badge-warning" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
                  Mốc 3: Tái khám
                </span>
                <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>Mốc hẹn tái khám</strong>
                <span style={{ fontSize: "0.8rem", color: "#d97706", fontWeight: 700 }}>{condFollowupDate}</span>
                <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "4px 0 0", maxWidth: 180 }}>
                  Khám định kỳ & đánh giá đáp ứng phác đồ
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CÁC LOẠI THUỐC ĐANG DÙNG TRONG ĐỢT ĐIỀU TRỊ */}
        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border-default)" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: "0.95rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            💊 DANH MỤC THUỐC ĐANG DÙNG ({data.active_medications?.length || 0})
          </h4>

          {data.active_medications && data.active_medications.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
              {data.active_medications.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: "10px 14px",
                    background: "var(--bg-surface, #ffffff)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 10,
                    boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <strong style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>{m.name}</strong>
                    <VerifiedBadge verification={m.verification || "verified"} />
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
                    Liều dùng: <strong>{m.dose || "Theo chỉ định"}</strong> • {m.frequency || "Hàng ngày"}
                  </div>
                  {m.timing && (
                    <div style={{ fontSize: "0.78rem", color: "#0284c7", marginTop: 2 }}>
                      ⏰ Thời điểm: {m.timing}
                    </div>
                  )}
                  {m.prescriber && (
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>
                      Nguồn: {m.prescriber}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
              Chưa có đơn thuốc nào được ghi nhận cho đợt điều trị này.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 1: TRANG 1 - DANH SÁCH BỆNH & TIỀN SỬ DỊ ỨNG
  // ==========================================
  return (
    <div className="card" style={{ marginBottom: 20, border: "1px solid var(--border-default)", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {/* 1. MỤC TIỀN SỬ DỊ ỨNG */}
      <div style={{ paddingBottom: 16, borderBottom: "1px solid var(--border-default)", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            ⚠️ TIỀN SỬ DỊ ỨNG ({data.allergies?.length || 0})
          </h4>
        </div>

        {data.allergies && data.allergies.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {data.allergies.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: "6px 12px",
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  borderRadius: 8,
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <strong style={{ color: "#e11d48" }}>{a.substance}</strong>
                {a.reaction && <span style={{ color: "#881337" }}>({a.reaction})</span>}
                <VerifiedBadge verification={a.verification || "unverified"} />
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
            ✅ Chưa ghi nhận tiền sử dị ứng thuốc/thực phẩm.
          </p>
        )}
      </div>

      {/* 2. MỤC CÁC LOẠI BỆNH ĐANG ĐIỀU TRỊ */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              🩺 CÁC LOẠI BỆNH ĐANG ĐIỀU TRỊ ({data.conditions?.length || 0})
            </h4>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Chọn một loại bệnh bên dưới để xem chi tiết phác đồ & cây timeline
            </span>
          </div>

          {isDoctor && !isAdding && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setIsAdding(true);
                setError("");
                setSuccess("");
              }}
              style={{ fontSize: "0.85rem", padding: "6px 14px" }}
            >
              ➕ Thêm loại bệnh điều trị
            </button>
          )}
        </div>

        {/* MODAL THÊM BỆNH MỚI */}
        {isAdding && (
          <form
            onSubmit={handleAddCondition}
            style={{
              padding: 18,
              marginBottom: 16,
              background: "var(--bg-elevated, #f8fafc)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
            }}
          >
            <h4 style={{ margin: "0 0 14px", fontSize: "0.95rem", color: "var(--text-primary)" }}>
              ➕ Thêm loại bệnh điều trị mới cho {data.full_name}
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Tên loại bệnh / Chẩn đoán</label>
                <input
                  type="text"
                  className="input"
                  placeholder="VD: Viêm loét dạ dày tá tràng, Bệnh mạch vành..."
                  value={newCondName}
                  onChange={(e) => setNewCondName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Trạng thái điều trị</label>
                <select
                  className="input"
                  value={newCondStatus}
                  onChange={(e) => setNewCondStatus(e.target.value as "active" | "transferred" | "completed")}
                >
                  <option value="active">🟢 Đang điều trị</option>
                  <option value="transferred">🟡 Đã chuyển viện</option>
                  <option value="completed">⚪ Kết thúc điều trị</option>
                </select>
              </div>

              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Thời gian bắt đầu (YYYY-MM-DD)</label>
                <input
                  type="date"
                  className="input"
                  value={newCondStartDate}
                  onChange={(e) => setNewCondStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Mốc tái khám dự kiến (YYYY-MM-DD)</label>
                <input
                  type="date"
                  className="input"
                  value={newCondFollowupDate}
                  onChange={(e) => setNewCondFollowupDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>Ghi chú diễn biến / Lời dặn</label>
              <textarea
                className="input"
                rows={2}
                placeholder="VD: Theo dõi triệu chứng đau thượng vị, uống thuốc trước ăn..."
                value={newCondNote}
                onChange={(e) => setNewCondNote(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsAdding(false)}
                disabled={adding}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary" disabled={adding}>
                {adding ? "Đang thêm…" : "💾 Xác nhận thêm bệnh"}
              </button>
            </div>
          </form>
        )}

        {/* DANH SÁCH CÁC THẺ LOẠI BỆNH (TRANG 1) */}
        {data.conditions && data.conditions.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {data.conditions.map((cond, index) => {
              const cfg = STATUS_CONFIG[cond.status] || STATUS_CONFIG.active;
              return (
                <div
                  key={cond.id}
                  onClick={() => setSelectedConditionId(cond.id)}
                  style={{
                    padding: "16px 18px",
                    background: "var(--bg-surface, #ffffff)",
                    border: `1px solid ${cfg.border}`,
                    borderRadius: 12,
                    cursor: "pointer",
                    transition: "all 0.2s ease-in-out",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)";
                    e.currentTarget.style.borderColor = "#0284c7";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.03)";
                    e.currentTarget.style.borderColor = cfg.border;
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
                        Loại {index + 1}
                      </span>
                      <span className={cfg.badge} style={{ fontSize: "0.75rem" }}>
                        ● {cfg.label}
                      </span>
                    </div>

                    <h4 style={{ margin: "0 0 6px", fontSize: "1.05rem", color: "var(--text-primary)", fontWeight: 700 }}>
                      🩺 {cond.name}
                    </h4>

                    {cond.note && (
                      <p style={{ margin: "0 0 8px", fontSize: "0.82rem", color: "var(--text-secondary)", fontStyle: "italic", lineClamp: 2 }}>
                        {cond.note}
                      </p>
                    )}

                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6 }}>
                      <div>🚩 Bắt đầu: <strong>{cond.start_date || "2026-09-01"}</strong></div>
                      <div>🗓️ Tái khám: <strong style={{ color: "#d97706" }}>{cond.followup_date || "Chưa hẹn"}</strong></div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 10,
                      borderTop: "1px dashed var(--border-default)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      color: "#0284c7",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    <span>Xem Timeline & phác đồ</span>
                    <span>➔</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="🩺"
            text="Chưa có thông tin loại bệnh điều trị. Bác sĩ có thể bấm nút 'Thêm loại bệnh điều trị' ở trên để khởi tạo phác đồ cho bệnh nhân."
          />
        )}
      </div>
    </div>
  );
}
