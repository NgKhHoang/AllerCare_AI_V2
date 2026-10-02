"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { EmptyState, ErrorBox, SuccessBox, VerifiedBadge } from "./ui";

export type TreatmentStatus = "active" | "transferred" | "completed";

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
  status: TreatmentStatus;
  status_label: string;
  start_date: string;
  followup_date: string | null;
  note?: string | null;
}

export interface ActiveMedicationItem {
  id: string;
  name: string;
  dose?: string | null;
  timing?: string | null;
  frequency?: string | null;
  prescriber?: string | null;
  verification?: string;
  status?: string;
}

export interface TreatmentTimelineData {
  profile_id: string;
  full_name: string;
  diagnosis: string;
  treatment_status: TreatmentStatus;
  treatment_status_label: string;
  treatment_start_date: string;
  followup_date: string | null;
  admission_note: string | null;
  conditions: DiseaseCondition[];
  active_medications: ActiveMedicationItem[];
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
  readonly profileId: string;
  readonly isDoctor?: boolean;
  readonly onRefresh?: () => void;
}

const STATUS_CONFIG: Record<TreatmentStatus, { label: string; badge: string; color: string; bg: string; border: string }> = {
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

// Helper tính toán tiến trình Real-time theo ngày thực tế
function calcLiveTreatmentProgress(startDateStr?: string, followupDateStr?: string | null) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start = startDateStr ? new Date(startDateStr) : today;
  if (Number.isNaN(start.getTime())) start = today;
  const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  let followup = followupDateStr && followupDateStr !== "Chưa hẹn" ? new Date(followupDateStr) : null;
  if (followup && Number.isNaN(followup.getTime())) followup = null;

  // Nếu chưa có ngày tái khám, mặc định 14 ngày
  const targetDate = followup
    ? new Date(followup.getFullYear(), followup.getMonth(), followup.getDate())
    : new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.round((targetDate.getTime() - startDate.getTime()) / msPerDay));
  const elapsedDays = Math.round((today.getTime() - startDate.getTime()) / msPerDay);

  // Ngày thứ mấy trong đợt điều trị (1-indexed)
  const currentDay = Math.max(1, Math.min(totalDays, elapsedDays + 1));
  const daysLeft = Math.max(0, Math.round((targetDate.getTime() - today.getTime()) / msPerDay));

  let percent = 0;
  if (totalDays > 0) {
    if (elapsedDays <= 0) {
      percent = Math.max(8, Math.round((1 / totalDays) * 100 * 0.6));
    } else if (elapsedDays >= totalDays) {
      percent = 100;
    } else {
      percent = Math.min(95, Math.max(10, Math.round(((elapsedDays + 0.5) / totalDays) * 100)));
    }
  }

  const formatDateVi = (d: Date) => {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  };

  return {
    todayStr: formatDateVi(today),
    startDateStr: formatDateVi(startDate),
    followupDateStr: followup ? formatDateVi(targetDate) : (followupDateStr || "Chưa hẹn"),
    totalDays,
    currentDay,
    elapsedDays,
    daysLeft,
    percent,
    isStarted: today >= startDate,
    isCompleted: today >= targetDate,
  };
}

// ----------------------------------------------------------------------
// SUB-COMPONENT: THẺ BỆNH ĐIỀU TRỊ TRONG DANH SÁCH (VIEW 1)
// ----------------------------------------------------------------------
function DiseaseCardButton({
  cond,
  index,
  onSelect,
}: {
  readonly cond: DiseaseCondition;
  readonly index: number;
  readonly onSelect: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[cond.status] || STATUS_CONFIG.active;
  const cardStats = calcLiveTreatmentProgress(cond.start_date, cond.followup_date);

  return (
    <button
      type="button"
      onClick={() => onSelect(cond.id)}
      style={{
        padding: "16px 18px",
        background: "var(--bg-surface, #ffffff)",
        border: `1.5px solid ${cfg.border}`,
        borderRadius: 12,
        cursor: "pointer",
        transition: "all 0.2s ease-in-out",
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        textAlign: "left",
        width: "100%",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(2, 132, 199, 0.12)";
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
          <span style={{ fontSize: "0.78rem", color: "#0284c7", fontWeight: 800, background: "#e0f2fe", padding: "2px 8px", borderRadius: 6 }}>
            Loại {index + 1}
          </span>
          <span className={cfg.badge} style={{ fontSize: "0.75rem" }}>
            ● {cfg.label}
          </span>
        </div>

        <h4 style={{ margin: "0 0 6px", fontSize: "1.1rem", color: "var(--text-primary)", fontWeight: 700 }}>
          🩺 {cond.name}
        </h4>

        {cond.note && (
          <p style={{ margin: "0 0 8px", fontSize: "0.82rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
            {cond.note}
          </p>
        )}

        <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6 }}>
          <div>🚩 Bắt đầu: <strong>{cardStats.startDateStr}</strong></div>
          <div>🗓️ Tái khám: <strong style={{ color: "#d97706" }}>{cardStats.followupDateStr}</strong></div>
        </div>

        {/* Live Progress Mini-Bar */}
        <div style={{ marginTop: 10, padding: "8px 10px", backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", marginBottom: 4 }}>
            <span style={{ color: "#0369a1", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
              Live: Ngày {cardStats.currentDay}/{cardStats.totalDays} ({cardStats.percent}%)
            </span>
            <span style={{ color: "#d97706", fontWeight: 700 }}>
              Còn {cardStats.daysLeft} ngày
            </span>
          </div>
          <div style={{ width: "100%", height: 6, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                width: `${cardStats.percent}%`,
                height: "100%",
                background: "linear-gradient(90deg, #0284c7 0%, #10b981 100%)",
                borderRadius: 4,
              }}
            />
          </div>
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
          fontWeight: 700,
        }}
      >
        <span>Xem chi tiết phác đồ & Timeline</span>
        <span>➔</span>
      </div>
    </button>
  );
}

// ----------------------------------------------------------------------
// SUB-COMPONENT: THẺ UỐNG THUỐC HÔM NAY (VIEW 2)
// ----------------------------------------------------------------------
function MedicationAdherenceItem({
  med,
  isTaken,
  onToggle,
}: {
  readonly med: ActiveMedicationItem;
  readonly isTaken: boolean;
  readonly onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(med.id)}
      style={{
        padding: "12px 14px",
        background: isTaken ? "#f0fdf4" : "var(--bg-surface, #ffffff)",
        border: isTaken ? "1.5px solid #86efac" : "1px solid var(--border-default)",
        borderRadius: 12,
        boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        width: "100%",
        fontFamily: "inherit",
      }}
    >
      <input
        type="checkbox"
        checked={isTaken}
        onChange={() => onToggle(med.id)}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#10b981" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <strong style={{ color: "var(--text-primary)", fontSize: "0.9rem", textDecoration: isTaken ? "line-through" : "none" }}>
            {med.name}
          </strong>
          <VerifiedBadge verification={med.verification || "verified"} />
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 3 }}>
          Liều dùng: <strong>{med.dose || "Theo chỉ định"}</strong> • {med.frequency || "Hàng ngày"}
        </div>
        {med.timing && (
          <div style={{ fontSize: "0.78rem", color: isTaken ? "#16a34a" : "#0284c7", marginTop: 2, fontWeight: 600 }}>
            ⏰ Thời điểm uống: {med.timing} {isTaken && " (✓ Đã uống)"}
          </div>
        )}
      </div>
    </button>
  );
}

// ----------------------------------------------------------------------
// SUB-COMPONENT: CHI TIẾT LOẠI BỆNH & CÂY TIMELINE REAL-TIME (VIEW 2)
// ----------------------------------------------------------------------
function ConditionDetailView({
  data,
  activeCondition,
  isDoctor,
  isEditing,
  setIsEditing,
  onBack,
  onStartEdit,
  editForm,
  setEditForm,
  onSaveCondition,
  saving,
  takenMeds,
  onToggleMed,
}: {
  readonly data: TreatmentTimelineData;
  readonly activeCondition: DiseaseCondition;
  readonly isDoctor: boolean;
  readonly isEditing: boolean;
  readonly setIsEditing: (v: boolean) => void;
  readonly onBack: () => void;
  readonly onStartEdit: () => void;
  readonly editForm: { diagnosis: string; status: TreatmentStatus; startDate: string; followupDate: string; note: string };
  readonly setEditForm: React.Dispatch<React.SetStateAction<{ diagnosis: string; status: TreatmentStatus; startDate: string; followupDate: string; note: string }>>;
  readonly onSaveCondition: (e: React.FormEvent) => void;
  readonly saving: boolean;
  readonly takenMeds: Record<string, boolean>;
  readonly onToggleMed: (id: string) => void;
}) {
  const statusCfg = STATUS_CONFIG[activeCondition.status] || STATUS_CONFIG.active;
  const condStartDate = activeCondition.start_date || data.treatment_start_date || "2026-09-01";
  const condFollowupDate = activeCondition.followup_date || data.followup_date || "Chưa hẹn";

  const liveStats = calcLiveTreatmentProgress(condStartDate, condFollowupDate);
  const takenCount = Object.values(takenMeds).filter(Boolean).length;
  const totalMeds = data.active_medications?.length || 0;

  return (
    <div className="card" style={{ marginBottom: 20, border: "1px solid var(--border-default)", boxShadow: "0 4px 16px rgba(0,0,0,0.04)" }}>
      {/* Nút quay lại */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}
        >
          ← Quay lại danh sách bệnh của {data.full_name}
        </button>

        {isDoctor && !isEditing && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onStartEdit}
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
          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Khởi phát điều trị: <strong>{liveStats.startDateStr}</strong></div>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Hẹn tái khám: <strong style={{ color: "#d97706" }}>{liveStats.followupDateStr}</strong></div>
        </div>
      </div>

      {/* FORM CHỈNH SỬA PHÁC ĐỒ */}
      {isEditing && (
        <form
          onSubmit={onSaveCondition}
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
              <label htmlFor="edit-diag" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                Tên loại bệnh / Chẩn đoán
              </label>
              <input
                id="edit-diag"
                type="text"
                className="input"
                value={editForm.diagnosis}
                onChange={(e) => setEditForm((prev) => ({ ...prev, diagnosis: e.target.value }))}
                required
              />
            </div>

            <div>
              <label htmlFor="edit-st" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                Trạng thái điều trị
              </label>
              <select
                id="edit-st"
                className="input"
                value={editForm.status}
                onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as TreatmentStatus }))}
              >
                <option value="active">🟢 Đang điều trị</option>
                <option value="transferred">🟡 Đã chuyển viện</option>
                <option value="completed">⚪ Kết thúc điều trị</option>
              </select>
            </div>

            <div>
              <label htmlFor="edit-start" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                Thời gian bắt đầu (YYYY-MM-DD)
              </label>
              <input
                id="edit-start"
                type="date"
                className="input"
                value={editForm.startDate}
                onChange={(e) => setEditForm((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>

            <div>
              <label htmlFor="edit-followup" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                Mốc tái khám dự kiến (YYYY-MM-DD)
              </label>
              <input
                id="edit-followup"
                type="date"
                className="input"
                value={editForm.followupDate}
                onChange={(e) => setEditForm((prev) => ({ ...prev, followupDate: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="edit-notes" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
              Ghi chú diễn biến / Lời dặn của bác sĩ
            </label>
            <textarea
              id="edit-notes"
              className="input"
              rows={2}
              value={editForm.note}
              onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
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

      {/* CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ REAL-TIME LIVE */}
      <div style={{ marginTop: 10, marginBottom: 24, padding: "18px 20px", background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)", borderRadius: 16, border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.25)" }} />
            <h4 style={{ margin: 0, fontSize: "0.98rem", color: "#0f172a", fontWeight: 800 }}>
              📈 TIẾN TRÌNH ĐIỀU TRỊ REAL-TIME (LIVE THEO NGÀY)
            </h4>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}>
            <span className="badge badge-ok" style={{ fontWeight: 700 }}>
              📍 Hôm nay ({liveStats.todayStr}): Ngày {liveStats.currentDay}/{liveStats.totalDays}
            </span>
            <span style={{ color: "#d97706", fontWeight: 700 }}>
              ⏳ Còn {liveStats.daysLeft} ngày tái khám
            </span>
          </div>
        </div>

        {/* LIVE PROGRESS BAR */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "#64748b", marginBottom: 6, fontWeight: 600 }}>
            <span>🚩 Ngày bắt đầu: {liveStats.startDateStr} (Ngày 1)</span>
            <span style={{ color: "#0284c7", fontWeight: 800 }}>Tiến độ: {liveStats.percent}%</span>
            <span>🗓️ Ngày tái khám: {liveStats.followupDateStr}</span>
          </div>

          <div style={{ position: "relative", width: "100%", height: 12, backgroundColor: "#e2e8f0", borderRadius: 8, overflow: "visible" }}>
            <div
              style={{
                width: `${liveStats.percent}%`,
                height: "100%",
                background: "linear-gradient(90deg, #0284c7 0%, #10b981 60%, #38bdf8 100%)",
                borderRadius: 8,
                transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
              }}
            />

            {/* Pulsing Live Marker */}
            <div
              style={{
                position: "absolute",
                top: -6,
                left: `calc(${liveStats.percent}% - 12px)`,
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: "#ffffff",
                border: "3px solid #10b981",
                boxShadow: "0 0 0 4px rgba(16, 185, 129, 0.3), 0 2px 8px rgba(0,0,0,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
                transition: "left 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              title={`Hôm nay là Ngày ${liveStats.currentDay}/${liveStats.totalDays} của đợt điều trị`}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#10b981" }} />
            </div>
          </div>
        </div>

        {/* 3 MỐC TRẠM CHÍNH */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {/* Mốc 1 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "12px 14px", backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#0284C7", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", boxShadow: "0 0 0 4px #e0f2fe", marginBottom: 8 }}>
              🚩
            </div>
            <span className="badge badge-info" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
              Mốc 1: Khởi đầu (Ngày 1)
            </span>
            <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>Bắt đầu điều trị</strong>
            <span style={{ fontSize: "0.8rem", color: "#0284c7", fontWeight: 700 }}>{liveStats.startDateStr}</span>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "4px 0 0" }}>
              Chẩn đoán: {activeCondition.name}
            </p>
          </div>

          {/* Mốc 2 (LIVE) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "12px 14px", backgroundColor: "#f0fdf4", border: "2px solid #86efac", borderRadius: 12, boxShadow: "0 4px 12px rgba(16, 185, 129, 0.12)", position: "relative" }}>
            <div style={{ position: "absolute", top: -10, background: "#16a34a", color: "#fff", fontSize: "0.7rem", fontWeight: 800, padding: "2px 8px", borderRadius: 10, letterSpacing: 0.5 }}>
              🔴 LIVE HÔM NAY
            </div>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#10B981", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", boxShadow: "0 0 0 4px #d1fae5", marginBottom: 8, marginTop: 4 }}>
              💊
            </div>
            <span className="badge badge-ok" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
              Mốc 2: Ngày {liveStats.currentDay}/{liveStats.totalDays}
            </span>
            <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>Uống thuốc & Theo dõi</strong>
            <span style={{ fontSize: "0.8rem", color: "#059669", fontWeight: 700 }}>
              {totalMeds} loại thuốc đang dùng ({takenCount}/{totalMeds} cữ đã uống)
            </span>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "4px 0 0" }}>
              Tuân thủ đúng liều lượng và thời điểm uống hôm nay
            </p>
          </div>

          {/* Mốc 3 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "12px 14px", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#F59E0B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", boxShadow: "0 0 0 4px #fef3c7", marginBottom: 8 }}>
              🗓️
            </div>
            <span className="badge badge-warning" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
              Mốc 3: Tái khám
            </span>
            <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>Mốc hẹn tái khám</strong>
            <span style={{ fontSize: "0.8rem", color: "#d97706", fontWeight: 700 }}>{liveStats.followupDateStr}</span>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "4px 0 0" }}>
              Còn <strong>{liveStats.daysLeft} ngày</strong> đến lượt khám định kỳ
            </p>
          </div>
        </div>
      </div>

      {/* TIẾN TRÌNH UỐNG THUỐC HÔM NAY */}
      <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            💊 TIẾN TRÌNH UỐNG THUỐC HÔM NAY ({totalMeds} loại thuốc)
          </h4>
          <span style={{ fontSize: "0.82rem", color: takenCount === totalMeds && totalMeds > 0 ? "#16a34a" : "#0284c7", fontWeight: 700 }}>
            {totalMeds > 0 && takenCount === totalMeds ? "✓ Đã hoàn thành uống thuốc hôm nay!" : `Đã uống: ${takenCount}/${totalMeds} thuốc`}
          </span>
        </div>

        {data.active_medications && data.active_medications.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {data.active_medications.map((m) => (
              <MedicationAdherenceItem
                key={m.id}
                med={m}
                isTaken={!!takenMeds[m.id]}
                onToggle={onToggleMed}
              />
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

// ----------------------------------------------------------------------
// SUB-COMPONENT: DANH SÁCH BỆNH & TIỀN SỬ DỊ ỨNG (VIEW 1)
// ----------------------------------------------------------------------
function ConditionListView({
  data,
  isDoctor,
  isAdding,
  setIsAdding,
  onSelectCondition,
  addForm,
  setAddForm,
  onAddCondition,
  adding,
}: {
  readonly data: TreatmentTimelineData;
  readonly isDoctor: boolean;
  readonly isAdding: boolean;
  readonly setIsAdding: (v: boolean) => void;
  readonly onSelectCondition: (id: string) => void;
  readonly addForm: { name: string; status: TreatmentStatus; startDate: string; followupDate: string; note: string };
  readonly setAddForm: React.Dispatch<React.SetStateAction<{ name: string; status: TreatmentStatus; startDate: string; followupDate: string; note: string }>>;
  readonly onAddCondition: (e: React.FormEvent) => void;
  readonly adding: boolean;
}) {
  return (
    <div className="card" style={{ marginBottom: 20, border: "1px solid var(--border-default)", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
      {/* 1. MỤC CÁC LOẠI BỆNH ĐANG ĐIỀU TRỊ */}
      <div style={{ paddingBottom: 18, borderBottom: "1px solid var(--border-default)", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              🩺 CÁC LOẠI BỆNH ĐANG ĐIỀU TRỊ ({data.conditions?.length || 0})
            </h4>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Bấm vào từng loại bệnh bên dưới để xem chi tiết phác đồ, mốc thời gian & cây timeline
            </span>
          </div>

          {isDoctor && !isAdding && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsAdding(true)}
              style={{ fontSize: "0.85rem", padding: "6px 14px" }}
            >
              ➕ Thêm loại bệnh điều trị
            </button>
          )}
        </div>

        {/* FORM THÊM BỆNH MỚI */}
        {isAdding && (
          <form
            onSubmit={onAddCondition}
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
                <label htmlFor="new-name" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  Tên loại bệnh / Chẩn đoán
                </label>
                <input
                  id="new-name"
                  type="text"
                  className="input"
                  placeholder="VD: Viêm loét dạ dày tá tràng, Đái tháo đường..."
                  value={addForm.name}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label htmlFor="new-st" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  Trạng thái điều trị
                </label>
                <select
                  id="new-st"
                  className="input"
                  value={addForm.status}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, status: e.target.value as TreatmentStatus }))}
                >
                  <option value="active">🟢 Đang điều trị</option>
                  <option value="transferred">🟡 Đã chuyển viện</option>
                  <option value="completed">⚪ Kết thúc điều trị</option>
                </select>
              </div>

              <div>
                <label htmlFor="new-start" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  Thời gian bắt đầu (YYYY-MM-DD)
                </label>
                <input
                  id="new-start"
                  type="date"
                  className="input"
                  value={addForm.startDate}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="new-followup" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  Mốc tái khám dự kiến (YYYY-MM-DD)
                </label>
                <input
                  id="new-followup"
                  type="date"
                  className="input"
                  value={addForm.followupDate}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, followupDate: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="new-notes" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                Ghi chú diễn biến / Lời dặn
              </label>
              <textarea
                id="new-notes"
                className="input"
                rows={2}
                placeholder="VD: Theo dõi triệu chứng đau thượng vị, uống thuốc trước ăn..."
                value={addForm.note}
                onChange={(e) => setAddForm((prev) => ({ ...prev, note: e.target.value }))}
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

        {/* DANH SÁCH CÁC THẺ LOẠI BỆNH */}
        {data.conditions && data.conditions.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {data.conditions.map((cond, index) => (
              <DiseaseCardButton
                key={cond.id}
                cond={cond}
                index={index}
                onSelect={onSelectCondition}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🩺"
            text="Chưa có thông tin loại bệnh điều trị. Bác sĩ có thể bấm nút 'Thêm loại bệnh điều trị' ở trên để khởi tạo phác đồ cho bệnh nhân."
          />
        )}
      </div>

      {/* 2. MỤC TIỀN SỬ DỊ ỨNG */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            ⚠️ TIỀN SỬ DỊ ỨNG ({data.allergies?.length || 0})
          </h4>
        </div>

        {data.allergies && data.allergies.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {data.allergies.map((a) => (
              <span
                key={a.id}
                className="badge badge-danger"
                style={{ fontSize: "0.82rem", padding: "5px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span>🚫 {a.substance}</span>
                {a.reaction && <span style={{ opacity: 0.85 }}>({a.reaction})</span>}
                <VerifiedBadge verification={a.verification || "verified"} />
              </span>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
            Không ghi nhận tiền sử dị ứng thuốc/thức ăn.
          </p>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// SUB-COMPONENT: THANH GHI CHÚ BỆNH NHÂN THEO TỪNG LOẠI BỆNH (BÁC SĨ)
// ----------------------------------------------------------------------
function DiseaseNoteSidePanel({
  conditions,
  selectedConditionId,
  onSelectCondition,
  profileId,
  onNoteUpdated,
}: {
  readonly conditions: DiseaseCondition[];
  readonly selectedConditionId: string | null;
  readonly onSelectCondition: (id: string) => void;
  readonly profileId: string;
  readonly onNoteUpdated: () => void;
}) {
  const currentCondition =
    conditions.find((c) => c.id === selectedConditionId) || conditions[0];
  const [noteText, setNoteText] = useState(currentCondition?.note || "");
  const [isSaving, setIsSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setNoteText(currentCondition?.note || "");
    setSavedStatus(null);
  }, [currentCondition?.id, currentCondition?.note]);

  async function handleSaveNote() {
    if (!currentCondition) return;
    try {
      setIsSaving(true);
      await api(`/v1/patients/${profileId}/treatment`, {
        method: "PUT",
        body: {
          condition_id: currentCondition.id,
          admission_note: noteText,
        },
      });
      setSavedStatus("Đã lưu");
      setTimeout(() => setSavedStatus(null), 3000);
      onNoteUpdated();
    } catch {
      setSavedStatus("Lỗi lưu");
    } finally {
      setIsSaving(false);
    }
  }

  if (!currentCondition) return null;

  return (
    <>
      {/* Nút Toggle mở nhanh khi đang thu gọn */}
      {isCollapsed && (
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 20,
            zIndex: 60,
            background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
            color: "#ffffff",
            padding: "10px 16px",
            borderRadius: 30,
            border: "none",
            boxShadow: "0 4px 16px rgba(2, 132, 199, 0.4)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            fontSize: "0.9rem",
          }}
        >
          <span>📝 Mở ghi chú bệnh</span>
          <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.2)", padding: "2px 6px", borderRadius: 10 }}>
            {currentCondition.name.slice(0, 14)}...
          </span>
        </button>
      )}

      {!isCollapsed && (
        <aside
          className="disease-note-dock"
          aria-label="Thanh ghi chú bệnh nhân theo loại bệnh"
        >
          {/* Header thanh ghi chú */}
          <div
            style={{
              padding: "14px 16px",
              background: "linear-gradient(135deg, #fff1f2 0%, #fef2f2 100%)",
              borderBottom: "1.5px solid #fecdd3",
              borderTopLeftRadius: 15,
              borderTopRightRadius: 15,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1.3rem" }}>✍️</span>
              <strong style={{ fontSize: "1.15rem", color: "#dc2626", fontWeight: 800, letterSpacing: "-0.01em" }}>
                Ghi chú:
              </strong>
            </div>

            <span className="badge badge-danger" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
              Riêng từng bệnh
            </span>
          </div>

          {/* Selector loại bệnh đang ghi chú */}
          <div style={{ padding: "12px 14px 8px", background: "#ffffff" }}>
            <label
              htmlFor="condition-note-select"
              style={{
                display: "block",
                fontSize: "0.76rem",
                fontWeight: 800,
                color: "#475569",
                marginBottom: 5,
                textTransform: "uppercase",
                letterSpacing: "0.4px",
              }}
            >
              🩺 Bệnh đang ghi chú:
            </label>
            {conditions.length > 1 ? (
              <select
                id="condition-note-select"
                value={currentCondition.id}
                onChange={(e) => onSelectCondition(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1.5px solid #7dd3fc",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "#0369a1",
                  background: "#f0f9ff",
                }}
              >
                {conditions.map((c, i) => (
                  <option key={c.id} value={c.id}>
                    {i + 1}. {c.name} ({STATUS_CONFIG[c.status]?.label || "Đang điều trị"})
                  </option>
                ))}
              </select>
            ) : (
              <div
                style={{
                  fontSize: "0.88rem",
                  fontWeight: 800,
                  color: "#0369a1",
                  background: "#f0f9ff",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1.5px solid #bae6fd",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={currentCondition.name}
              >
                🩺 {currentCondition.name}
              </div>
            )}
            <p style={{ margin: "6px 0 0", fontSize: "0.74rem", color: "#64748b", fontStyle: "italic" }}>
              * Thanh ghi chú này thuộc loại bệnh riêng, không dùng chung cho tất cả loại bệnh.
            </p>
          </div>

          {/* Thân Textarea ghi chú */}
          <div style={{ padding: "8px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
            <textarea
              className="note-paper-area"
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                setSavedStatus(null);
              }}
              onBlur={handleSaveNote}
              placeholder="Ghi chú về Bệnh Nhân..."
              rows={10}
              style={{
                width: "100%",
                minHeight: "180px",
                fontSize: "0.92rem",
                lineHeight: "26px",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Footer lưu & trạng thái */}
          <div
            style={{
              padding: "10px 14px",
              background: "#f8fafc",
              borderTop: "1px solid #e2e8f0",
              borderBottomLeftRadius: 15,
              borderBottomRightRadius: 15,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ fontSize: "0.78rem" }}>
              {isSaving && <span style={{ color: "#0284c7" }}>⏳ Đang lưu...</span>}
              {!isSaving && savedStatus && (
                <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ {savedStatus}</span>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSaveNote}
              disabled={isSaving}
              style={{ fontSize: "0.82rem", padding: "5px 14px" }}
            >
              {isSaving ? "Đang lưu..." : "💾 Lưu ghi chú"}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

// ----------------------------------------------------------------------
// MAIN CONTROLLER COMPONENT: TREATMENT TIMELINE
// ----------------------------------------------------------------------
export function TreatmentTimeline({ profileId, isDoctor = false, onRefresh }: Props) {
  const [data, setData] = useState<TreatmentTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [takenMeds, setTakenMeds] = useState<Record<string, boolean>>({});
  const [selectedConditionId, setSelectedConditionId] = useState<string | null>(null);

  // Form edit selected condition
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ diagnosis: string; status: TreatmentStatus; startDate: string; followupDate: string; note: string }>({
    diagnosis: "",
    status: "active",
    startDate: "",
    followupDate: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  // Form add new condition
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<{ name: string; status: TreatmentStatus; startDate: string; followupDate: string; note: string }>({
    name: "",
    status: "active",
    startDate: new Date().toISOString().slice(0, 10),
    followupDate: "",
    note: "",
  });
  const [adding, setAdding] = useState(false);

  function toggleMedTaken(medId: string) {
    setTakenMeds((prev) => ({
      ...prev,
      [medId]: !prev[medId],
    }));
  }

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
    void loadTimeline(false);
  }, [profileId]);

  const activeCondition = data?.conditions?.find((c) => c.id === selectedConditionId);

  function startEditCondition() {
    if (!activeCondition) return;
    setEditForm({
      diagnosis: activeCondition.name,
      status: activeCondition.status || "active",
      startDate: activeCondition.start_date || "",
      followupDate: activeCondition.followup_date || "",
      note: activeCondition.note || "",
    });
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
          diagnosis: editForm.diagnosis,
          treatment_status: editForm.status,
          treatment_start_date: editForm.startDate,
          followup_date: editForm.followupDate,
          admission_note: editForm.note,
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
    if (!addForm.name.trim()) {
      setError("Vui lòng nhập tên loại bệnh điều trị");
      return;
    }
    try {
      setAdding(true);
      setError("");
      await api(`/v1/patients/${profileId}/treatment`, {
        method: "PUT",
        body: {
          new_condition_name: addForm.name.trim(),
          treatment_status: addForm.status,
          treatment_start_date: addForm.startDate,
          followup_date: addForm.followupDate,
          admission_note: addForm.note,
        },
      });
      setSuccess(`Đã thêm bệnh "${addForm.name}" vào danh sách điều trị!`);
      setIsAdding(false);
      setAddForm({
        name: "",
        status: "active",
        startDate: new Date().toISOString().slice(0, 10),
        followupDate: "",
        note: "",
      });
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

  if (!data) return null;

  return (
    <>
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {selectedConditionId && activeCondition ? (
        <ConditionDetailView
          data={data}
          activeCondition={activeCondition}
          isDoctor={isDoctor}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          onBack={() => {
            setSelectedConditionId(null);
            setIsEditing(false);
            setError("");
            setSuccess("");
          }}
          onStartEdit={startEditCondition}
          editForm={editForm}
          setEditForm={setEditForm}
          onSaveCondition={handleSaveCondition}
          saving={saving}
          takenMeds={takenMeds}
          onToggleMed={toggleMedTaken}
        />
      ) : (
        <ConditionListView
          data={data}
          isDoctor={isDoctor}
          isAdding={isAdding}
          setIsAdding={(v) => {
            setIsAdding(v);
            setError("");
            setSuccess("");
          }}
          onSelectCondition={(id) => setSelectedConditionId(id)}
          addForm={addForm}
          setAddForm={setAddForm}
          onAddCondition={handleAddCondition}
          adding={adding}
        />
      )}
    </>
  );
}

