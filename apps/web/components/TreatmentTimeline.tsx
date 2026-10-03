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
  route?: string | null;
  prescriber?: string | null;
  source_label?: string | null;
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

// Helper phân loại thuốc theo từng loại bệnh
export function isMedForCondition(
  med: ActiveMedicationItem,
  condition: DiseaseCondition,
  allConditions: DiseaseCondition[] = []
): boolean {
  if (!med || !condition) return false;
  const condName = (condition.name || "").toLowerCase().trim();
  const src = (med.source_label || "").toLowerCase();
  const prescriber = (med.prescriber || "").toLowerCase();
  const medName = (med.name || "").toLowerCase();

  // 1. Khớp chính xác tên bệnh trong nguồn gốc hoặc người kê
  if (src.includes(condName) || prescriber.includes(condName)) {
    return true;
  }

  // 2. Bộ từ khóa lâm sàng ánh xạ thuốc với diện bệnh
  const rules: Array<{ keywords: string[]; medKeywords: string[] }> = [
    {
      keywords: ["đái tháo đường", "tiểu đường", "diabetes"],
      medKeywords: ["glucophage", "metformin", "gliclazide", "diamicron", "insulin", "januvia", "forxiga", "jardiance", "glimepiride"],
    },
    {
      keywords: ["tăng huyết áp", "huyết áp", "hypertension", "tim mạch", "suy tim", "rung nhĩ", "mạch vành", "tim"],
      medKeywords: ["amlodipin", "losartan", "enalapril", "captopril", "bisoprolol", "concor", "nebivolol", "telmisartan", "micardis", "aspirin", "warfarin", "clopidogrel", "plavix", "atorvastatin", "rosuvastatin", "lipitor", "crestor"],
    },
    {
      keywords: ["dạ dày", "ruột", "tiêu hóa", "viêm loét", "trào ngược", "gastro", "gerd", "đại tràng"],
      medKeywords: ["smecta", "berberin", "omeprazole", "nexium", "esomeprazole", "pantoprazole", "gaviscon", "phosphalugel", "domperidone", "motilium", "spasfon", "men vi sinh", "probiotic", "enterogermina"],
    },
    {
      keywords: ["dị ứng", "viêm da", "viêm mũi", "mày đay", "allergy", "dermatitis", "asthma", "hen suyễn"],
      medKeywords: ["fexofenadine", "cetirizine", "loratadine", "telfast", "clarityne", "singulair", "montelukast", "hydrocortisone", "prednisolone", "medrol", "seretide", "symbicort", "ventolin"],
    },
    {
      keywords: ["nhiễm trùng", "nhiễm khuẩn", "viêm họng", "viêm phế quản", "viêm phổi"],
      medKeywords: ["augmentin", "amoxicillin", "azithromycin", "ciprofloxacin", "cefixime", "klacid", "zithromax"],
    },
    {
      keywords: ["xương khớp", "thoái hóa", "gout", "viêm khớp"],
      medKeywords: ["colchicine", "allopurinol", "febuxostat", "celebrex", "meloxicam", "glucosamine", "paracetamol", "efferalgan"],
    },
  ];

  for (const r of rules) {
    const condMatches = r.keywords.some((k) => condName.includes(k));
    if (condMatches) {
      if (r.medKeywords.some((mk) => medName.includes(mk) || src.includes(mk))) {
        return true;
      }
    }
  }

  // 3. Nếu thuốc này khớp với một bệnh khác trong danh sách của bệnh nhân, không gán cho bệnh hiện tại
  const matchesOther = (allConditions || []).some((c) => {
    if (c.id === condition.id) return false;
    const otherName = (c.name || "").toLowerCase().trim();
    if (src.includes(otherName) || prescriber.includes(otherName)) return true;
    for (const r of rules) {
      if (r.keywords.some((k) => otherName.includes(k))) {
        if (r.medKeywords.some((mk) => medName.includes(mk) || src.includes(mk))) {
          return true;
        }
      }
    }
    return false;
  });

  if (matchesOther) {
    return false;
  }

  // 4. Mặc định: nếu bệnh nhân chỉ có đúng 1 loại bệnh, hiển thị toàn bộ
  if (!allConditions || allConditions.length <= 1) {
    return true;
  }

  return false;
}

// Tìm tên bệnh tương ứng của thuốc trong danh sách bệnh
export function getConditionForMed(med: ActiveMedicationItem, allConditions: DiseaseCondition[] = []): string | null {
  for (const cond of allConditions) {
    if (isMedForCondition(med, cond, allConditions)) {
      return cond.name;
    }
  }
  if (med.source_label?.startsWith("Điều trị: ")) {
    return med.source_label.replace("Điều trị: ", "").trim();
  }
  return null;
}

// Helper tính toán tiến trình Real-time theo ngày thực tế
function calcLiveTreatmentProgress(startDateStr?: string, followupDateStr?: string | null) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start = startDateStr ? new Date(startDateStr) : today;
  if (Number.isNaN(start.getTime())) start = today;
  const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  let followup = followupDateStr && followupDateStr !== "Chưa hẹn" ? new Date(followupDateStr) : null;
  if (followup && Number.isNaN(followup.getTime())) followup = null;

  const targetDate = followup
    ? new Date(followup.getFullYear(), followup.getMonth(), followup.getDate())
    : new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.round((targetDate.getTime() - startDate.getTime()) / msPerDay));
  const elapsedDays = Math.round((today.getTime() - startDate.getTime()) / msPerDay);

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
  isDoctor,
  onSelect,
  onResolve,
  onDelete,
}: {
  readonly cond: DiseaseCondition;
  readonly index: number;
  readonly isDoctor?: boolean;
  readonly onSelect: (id: string) => void;
  readonly onResolve?: (id: string) => void;
  readonly onDelete?: (id: string, name: string) => void;
}) {
  const cfg = STATUS_CONFIG[cond.status] || STATUS_CONFIG.active;
  const cardStats = calcLiveTreatmentProgress(cond.start_date, cond.followup_date);

  return (
    <div
      style={{
        padding: "16px 18px",
        background: "#ffffff",
        border: "1.5px solid var(--border-default)",
        borderRadius: 14,
        boxShadow: "0 3px 10px rgba(0,0,0,0.03)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div>
        {/* HEADER THẺ */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#f0f9ff",
                color: "#0284c7",
                fontSize: "0.75rem",
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #bae6fd",
              }}
            >
              {index + 1}
            </span>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Bệnh {index + 1}
            </span>
          </div>
          <span className={cfg.badge} style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
            ● {cfg.label}
          </span>
        </div>

        {/* TÊN BỆNH */}
        <button
          type="button"
          onClick={() => onSelect(cond.id)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            textAlign: "left",
            width: "100%",
            fontFamily: "inherit",
            fontSize: "1.05rem",
            fontWeight: 800,
            color: "var(--text-primary)",
            marginBottom: 6,
            cursor: "pointer",
            lineHeight: 1.3,
          }}
        >
          🩺 {cond.name}
        </button>

        {cond.note && (
          <p style={{ margin: "0 0 10px", fontSize: "0.82rem", color: "var(--text-secondary)", fontStyle: "italic", lineClamp: 2 }}>
            "{cond.note}"
          </p>
        )}

        {/* TIẾN ĐỘ THỜI GIAN NHANH */}
        <div style={{ background: "#f8fafc", padding: "8px 10px", borderRadius: 8, border: "1px solid #f1f5f9", marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", color: "#64748b", marginBottom: 4 }}>
            <span>Bắt đầu: <strong>{cardStats.startDateStr}</strong></span>
            <span style={{ color: "#d97706", fontWeight: 700 }}>Tái khám: {cardStats.followupDateStr}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "#0284c7", fontWeight: 700, marginBottom: 2 }}>
            <span>Hôm nay: Ngày {cardStats.currentDay}/{cardStats.totalDays}</span>
            <span>Tiến độ: {cardStats.percent}%</span>
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

      {/* FOOTER ACTIONS */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: "1px dashed var(--border-default)",
        }}
      >
        {isDoctor ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onSelect(cond.id)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "0.78rem", padding: "4px 8px", color: "#0284c7", borderColor: "#bae6fd", background: "#f0f9ff", fontWeight: 700 }}
              title="Xem chi tiết phác đồ và dòng thời gian điều trị"
            >
              🔍 Xem phác đồ →
            </button>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResolve?.(cond.id);
                }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "0.76rem", padding: "4px 8px", color: "#16a34a", borderColor: "#86efac", background: "#f0fdf4", fontWeight: 700 }}
                title="Kết thúc đợt điều trị cho loại bệnh này (bảo toàn lịch sử)"
              >
                ✅ Kết thúc
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(cond.id, cond.name);
                }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "0.76rem", padding: "4px 8px", color: "#dc2626", borderColor: "#fca5a5", background: "#fef2f2", fontWeight: 700 }}
                title="Xóa loại bệnh này khỏi danh sách điều trị"
              >
                🗑️ Xóa
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(cond.id)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#0284c7",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <span>Xem chi tiết phác đồ & Timeline</span>
            <span>➔</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// SUB-COMPONENT: THẺ UỐNG THUỐC CHO BỆNH NHÂN (CHECKIN HÔM NAY)
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
// SUB-COMPONENT: THẺ QUẢN TRỊ THUỐC CHO BÁC SĨ (THÊM, SỬA, XÓA)
// ----------------------------------------------------------------------
function DoctorMedicationCard({
  med,
  onEdit,
  onDelete,
}: {
  readonly med: ActiveMedicationItem;
  readonly onEdit: (med: ActiveMedicationItem) => void;
  readonly onDelete: (medId: string, medName: string) => void;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "#ffffff",
        border: "1.5px solid #e2e8f0",
        borderRadius: 12,
        boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>💊 {med.name}</strong>
          <VerifiedBadge verification={med.verification || "verified"} />
        </div>
        <div style={{ fontSize: "0.83rem", color: "#475569", marginTop: 4 }}>
          Liều dùng: <strong>{med.dose || "1 viên/lần"}</strong> • Tần suất: <strong>{med.frequency || "Hàng ngày"}</strong>
        </div>
        {med.timing && (
          <div style={{ fontSize: "0.8rem", color: "#0284c7", marginTop: 3, fontWeight: 600 }}>
            ⏰ Thời điểm: {med.timing}
          </div>
        )}
        {med.prescriber && (
          <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: 2 }}>
            👨‍⚕️ {med.prescriber}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, borderTop: "1px dashed #f1f5f9", paddingTop: 8 }}>
        <button
          type="button"
          onClick={() => onEdit(med)}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: "0.78rem", padding: "4px 10px", color: "#0284c7", borderColor: "#bae6fd", background: "#f0f9ff", fontWeight: 700 }}
          title="Chỉnh sửa liều lượng, tần suất hoặc giờ uống"
        >
          ✏️ Sửa
        </button>
        <button
          type="button"
          onClick={() => onDelete(med.id, med.name)}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: "0.78rem", padding: "4px 10px", color: "#dc2626", borderColor: "#fca5a5", background: "#fef2f2", fontWeight: 700 }}
          title="Xóa thuốc khỏi đơn điều trị"
        >
          🗑️ Xóa
        </button>
      </div>
    </div>
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
  onResolveCondition,
  onOpenDeleteModal,
  onOpenPrescribeModal,
  onOpenEditMedModal,
  onOpenDeleteMedModal,
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
  readonly onResolveCondition?: (id: string) => void;
  readonly onOpenDeleteModal?: (id: string, name: string) => void;
  readonly onOpenPrescribeModal?: (conditionName: string) => void;
  readonly onOpenEditMedModal?: (med: ActiveMedicationItem) => void;
  readonly onOpenDeleteMedModal?: (medId: string, medName: string) => void;
}) {
  const statusCfg = STATUS_CONFIG[activeCondition.status] || STATUS_CONFIG.active;
  const condStartDate = activeCondition.start_date || data.treatment_start_date || "2026-09-01";
  const condFollowupDate = activeCondition.followup_date || data.followup_date || "Chưa hẹn";

  const liveStats = calcLiveTreatmentProgress(condStartDate, condFollowupDate);
  const conditionIndex = data.conditions?.findIndex((c) => c.id === activeCondition.id) ?? -1;
  const conditionOrderLabel = conditionIndex >= 0 ? `Loại ${conditionIndex + 1}` : "Bệnh lý";

  // LỌC CHÍNH XÁC DANH MỤC THUỐC CHO LOẠI BỆNH NÀY
  const conditionMeds = (data.active_medications || []).filter((m) =>
    isMedForCondition(m, activeCondition, data.conditions || [])
  );
  const conditionTakenCount = conditionMeds.filter((m) => !!takenMeds[m.id]).length;
  const conditionTotalMeds = conditionMeds.length;

  return (
    <div className="card" style={{ marginBottom: 20, border: "1px solid var(--border-default)", boxShadow: "0 4px 16px rgba(0,0,0,0.04)" }}>
      {/* Nút quay lại & Hành động Bác sĩ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}
        >
          ← Quay lại danh sách bệnh của {data.full_name}
        </button>

        {isDoctor && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onOpenPrescribeModal?.(activeCondition.name)}
              style={{ fontSize: "0.85rem", padding: "6px 14px", background: "#0284c7", borderColor: "#0284c7" }}
            >
              ➕ 🩺 Kê đơn thuốc cho bệnh này
            </button>
            {!isEditing && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onStartEdit}
                style={{ fontSize: "0.85rem", padding: "6px 14px" }}
              >
                ✏️ Chỉnh sửa phác đồ
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onResolveCondition?.(activeCondition.id)}
              style={{ fontSize: "0.85rem", padding: "6px 14px", color: "#16a34a", borderColor: "#86efac", background: "#f0fdf4", fontWeight: 700 }}
              title="Đánh dấu bệnh nhân đã khỏi / kết thúc đợt điều trị"
            >
              ✅ Kết thúc điều trị
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onOpenDeleteModal?.(activeCondition.id, activeCondition.name)}
              style={{ fontSize: "0.85rem", padding: "6px 14px", color: "#dc2626", borderColor: "#fca5a5", background: "#fef2f2", fontWeight: 700 }}
              title="Xóa bệnh điều trị do ghi nhầm"
            >
              🗑️ Xóa bệnh
            </button>
          </div>
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
              {conditionTotalMeds} loại thuốc đang dùng ({conditionTakenCount}/{conditionTotalMeds} cữ đã uống)
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

      {/* DANH MỤC THUỐC RIÊNG CHO TỪNG LOẠI BỆNH */}
      <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "0.98rem", color: "#0f172a", display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
              💊 DANH MỤC THUỐC — {conditionOrderLabel.toUpperCase()}: {activeCondition.name.toUpperCase()} ({conditionTotalMeds} THUỐC)
            </h4>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Phác đồ thuốc được kê riêng cho điều trị bệnh {activeCondition.name}
            </span>
          </div>

          {isDoctor ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onOpenPrescribeModal?.(activeCondition.name)}
              style={{ fontSize: "0.8rem", padding: "4px 12px", background: "#0284c7", borderColor: "#0284c7" }}
            >
              ➕ Kê thêm thuốc cho bệnh này
            </button>
          ) : (
            <span style={{ fontSize: "0.82rem", color: conditionTotalMeds > 0 && conditionTakenCount === conditionTotalMeds ? "#16a34a" : "#0284c7", fontWeight: 700 }}>
              {conditionTotalMeds > 0 && conditionTakenCount === conditionTotalMeds ? "✓ Đã hoàn thành uống thuốc cho bệnh này!" : `Đã uống: ${conditionTakenCount}/${conditionTotalMeds} thuốc`}
            </span>
          )}
        </div>

        {conditionMeds.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {conditionMeds.map((m) =>
              isDoctor ? (
                <DoctorMedicationCard
                  key={m.id}
                  med={m}
                  onEdit={(med) => onOpenEditMedModal?.(med)}
                  onDelete={(id, name) => onOpenDeleteMedModal?.(id, name)}
                />
              ) : (
                <MedicationAdherenceItem
                  key={m.id}
                  med={m}
                  isTaken={!!takenMeds[m.id]}
                  onToggle={onToggleMed}
                />
              )
            )}
          </div>
        ) : (
          <div style={{ padding: "16px 18px", background: "#f8fafc", borderRadius: 12, border: "1px dashed #cbd5e1" }}>
            <p className="muted" style={{ fontSize: "0.86rem", fontStyle: "italic", margin: "0 0 6px" }}>
              Chưa có thuốc nào được kê riêng cho {activeCondition.name}.
            </p>
            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
              {isDoctor
                ? "Bác sĩ có thể bấm nút 'Kê đơn thuốc cho bệnh này' ở trên để bổ sung thuốc điều trị."
                : "Bác sĩ chưa kê đơn thuốc riêng cho mặt bệnh này."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// SUB-COMPONENT: DANH SÁCH BỆNH & TIỀN SỬ DỊ ỨNG & TOÀN BỘ THUỐC (VIEW 1 - TỔNG QUAN)
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
  onResolveCondition,
  onOpenDeleteModal,
  onOpenPrescribeModal,
  onOpenEditMedModal,
  onOpenDeleteMedModal,
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
  readonly onResolveCondition?: (id: string) => void;
  readonly onOpenDeleteModal?: (id: string, name: string) => void;
  readonly onOpenPrescribeModal?: (conditionName?: string) => void;
  readonly onOpenEditMedModal?: (med: ActiveMedicationItem) => void;
  readonly onOpenDeleteMedModal?: (medId: string, medName: string) => void;
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
              Bấm vào từng loại bệnh bên dưới để xem chi tiết phác đồ, mốc thời gian & danh mục thuốc riêng
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
                isDoctor={isDoctor}
                onSelect={onSelectCondition}
                onResolve={onResolveCondition}
                onDelete={onOpenDeleteModal}
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
      <div style={{ paddingBottom: 18, borderBottom: "1px solid var(--border-default)", marginBottom: 18 }}>
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

      {/* 3. MỤC DANH MỤC THUỐC ĐANG ĐIỀU TRỊ (TỔNG HỢP TOÀN DIỆN - TRANG CHỦ) */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              💊 DANH MỤC THUỐC ĐANG ĐIỀU TRỊ (TỔNG HỢP TẤT CẢ CÁC BỆNH: {data.active_medications?.length || 0} THUỐC)
            </h4>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              Hiển thị toàn bộ thuốc được kê cho các mặt bệnh của bệnh nhân
            </span>
          </div>

          {isDoctor && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onOpenPrescribeModal?.()}
              style={{ fontSize: "0.8rem", padding: "4px 12px", background: "#0284c7", borderColor: "#0284c7" }}
            >
              ➕ 🩺 Kê đơn thuốc mới
            </button>
          )}
        </div>

        {data.active_medications && data.active_medications.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {data.active_medications.map((m) => {
              const matchedCondName = getConditionForMed(m, data.conditions || []);
              return isDoctor ? (
                <div key={m.id} style={{ position: "relative" }}>
                  {matchedCondName && (
                    <div style={{ marginBottom: 4 }}>
                      <span className="badge badge-info" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                        🩺 Điều trị: {matchedCondName}
                      </span>
                    </div>
                  )}
                  <DoctorMedicationCard
                    med={m}
                    onEdit={(med) => onOpenEditMedModal?.(med)}
                    onDelete={(id, name) => onOpenDeleteMedModal?.(id, name)}
                  />
                </div>
              ) : (
                <div
                  key={m.id}
                  className="list-row"
                  style={{
                    padding: "12px 14px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    background: "#ffffff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div className="list-main">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>💊 {m.name}</span>
                      {matchedCondName && (
                        <span className="badge badge-info" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                          🩺 {matchedCondName}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 2 }}>
                      {m.dose || "1 viên"} · {m.timing || "Sau ăn"} · {m.prescriber || "Bác sĩ kê"}
                    </div>
                  </div>
                  <span className="badge badge-ok" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                    Đang dùng
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
            Chưa có đơn thuốc nào đang điều trị.
          </p>
        )}
      </div>
    </div>
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

  // Modal Delete Condition State
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; condId: string; condName: string; reason: string }>({
    open: false,
    condId: "",
    condName: "",
    reason: "",
  });

  // Modal Quick Prescribe for Doctor
  const [prescribeModal, setPrescribeModal] = useState<{
    open: boolean;
    conditionName: string;
    rawName: string;
    dose: string;
    frequency: string;
    timing: string;
    route: string;
    instructions: string;
  }>({
    open: false,
    conditionName: "",
    rawName: "",
    dose: "1 viên/lần",
    frequency: "2 lần/ngày",
    timing: "Sau ăn 30 phút",
    route: "uống",
    instructions: "",
  });

  // Modal Edit Medication for Doctor
  const [editMedModal, setEditMedModal] = useState<{
    open: boolean;
    medId: string;
    medName: string;
    dose: string;
    frequency: string;
    timing: string;
    route: string;
    conditionName: string;
  }>({
    open: false,
    medId: "",
    medName: "",
    dose: "",
    frequency: "",
    timing: "",
    route: "uống",
    conditionName: "",
  });

  // Modal Delete Medication for Doctor
  const [deleteMedModal, setDeleteMedModal] = useState<{
    open: boolean;
    medId: string;
    medName: string;
  }>({
    open: false,
    medId: "",
    medName: "",
  });

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

  async function handleResolveCondition(condId: string) {
    if (!confirm("Bác sĩ có chắc chắn muốn KẾT THÚC ĐỢT ĐIỀU TRỊ cho mặt bệnh này? Lịch sử hồ sơ vẫn được bảo toàn vĩnh viễn.")) return;
    try {
      setSaving(true);
      setError("");
      await api(`/v1/patients/${profileId}/treatment`, {
        method: "PUT",
        body: {
          condition_id: condId,
          action: "resolve",
        },
      });
      setSuccess("Đã đánh dấu KẾT THÚC ĐỢT ĐIỀU TRỊ thành công!");
      await loadTimeline(true);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể kết thúc điều trị");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConditionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteModal.reason.trim()) {
      alert("Vui lòng nhập lý do xóa bệnh");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await api(`/v1/patients/${profileId}/treatment`, {
        method: "PUT",
        body: {
          condition_id: deleteModal.condId,
          action: "delete",
          delete_reason: deleteModal.reason.trim(),
        },
      });
      setSuccess(`Đã xóa bệnh "${deleteModal.condName}" khỏi danh sách điều trị!`);
      setDeleteModal({ open: false, condId: "", condName: "", reason: "" });
      setSelectedConditionId(null);
      await loadTimeline(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xóa loại bệnh");
    } finally {
      setSaving(false);
    }
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

  // Doctor Quick Prescribe Submit
  async function handlePrescribeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prescribeModal.rawName.trim()) {
      setError("Vui lòng nhập tên thuốc");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await api(`/v1/patients/${profileId}/prescribe`, {
        method: "POST",
        body: {
          raw_name: prescribeModal.rawName.trim(),
          dose: prescribeModal.dose.trim() || null,
          frequency: prescribeModal.frequency.trim() || null,
          timing: prescribeModal.timing.trim() || null,
          route: prescribeModal.route.trim() || "uống",
          instructions: prescribeModal.instructions.trim() || null,
          condition_name: prescribeModal.conditionName.trim() || null,
        },
      });
      setSuccess(`Bác sĩ đã kê đơn thuốc "${prescribeModal.rawName}" thành công cho bệnh nhân!`);
      setPrescribeModal({
        open: false,
        conditionName: "",
        rawName: "",
        dose: "1 viên/lần",
        frequency: "2 lần/ngày",
        timing: "Sau ăn 30 phút",
        route: "uống",
        instructions: "",
      });
      await loadTimeline(true);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể kê đơn thuốc");
    } finally {
      setSaving(false);
    }
  }

  // Doctor Edit Medication Submit
  async function handleEditMedSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      await api(`/v1/patients/${profileId}/medications/${editMedModal.medId}`, {
        method: "PATCH",
        body: {
          dose: editMedModal.dose.trim() || null,
          frequency: editMedModal.frequency.trim() || null,
          timing: editMedModal.timing.trim() || null,
          route: editMedModal.route.trim() || "uống",
          condition_name: editMedModal.conditionName.trim() || null,
        },
      });
      setSuccess(`Cập nhật đơn thuốc "${editMedModal.medName}" thành công!`);
      setEditMedModal({
        open: false,
        medId: "",
        medName: "",
        dose: "",
        frequency: "",
        timing: "",
        route: "uống",
        conditionName: "",
      });
      await loadTimeline(true);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật đơn thuốc");
    } finally {
      setSaving(false);
    }
  }

  // Doctor Delete Medication Submit
  async function handleDeleteMedSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      await api(`/v1/patients/${profileId}/medications/${deleteMedModal.medId}`, {
        method: "DELETE",
      });
      setSuccess(`Đã xóa thuốc "${deleteMedModal.medName}" khỏi đơn điều trị!`);
      setDeleteMedModal({ open: false, medId: "", medName: "" });
      await loadTimeline(true);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xóa đơn thuốc");
    } finally {
      setSaving(false);
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

      {/* MODAL KÊ ĐƠN THUỐC CHO BÁC SĨ */}
      {prescribeModal.open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              maxWidth: 520,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              border: "1px solid #bae6fd",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>🩺</span>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0284c7" }}>
                Bác sĩ kê đơn thuốc {prescribeModal.conditionName ? `cho bệnh: ${prescribeModal.conditionName}` : ""}
              </h3>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: 16 }}>
              Thuốc sẽ được đồng bộ ngay lập tức sang tài khoản người bệnh và lưu vào hồ sơ điều trị.
            </p>
            <form onSubmit={handlePrescribeSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="prescribe-name" className="label" style={{ fontWeight: 700, fontSize: "0.82rem" }}>
                  Tên thuốc & Hàm lượng (*)
                </label>
                <input
                  id="prescribe-name"
                  type="text"
                  className="input"
                  placeholder="VD: Glucophage 850mg, Amlodipin 5mg, Nexium 40mg..."
                  value={prescribeModal.rawName}
                  onChange={(e) => setPrescribeModal((prev) => ({ ...prev, rawName: e.target.value }))}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label htmlFor="prescribe-dose" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    Liều dùng
                  </label>
                  <input
                    id="prescribe-dose"
                    type="text"
                    className="input"
                    placeholder="VD: 1 viên/lần, 2 gói/ngày"
                    value={prescribeModal.dose}
                    onChange={(e) => setPrescribeModal((prev) => ({ ...prev, dose: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="prescribe-freq" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    Tần suất
                  </label>
                  <input
                    id="prescribe-freq"
                    type="text"
                    className="input"
                    placeholder="VD: 2 lần/ngày, Khi đau"
                    value={prescribeModal.frequency}
                    onChange={(e) => setPrescribeModal((prev) => ({ ...prev, frequency: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label htmlFor="prescribe-timing" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    Thời điểm uống
                  </label>
                  <input
                    id="prescribe-timing"
                    type="text"
                    className="input"
                    placeholder="VD: Sau ăn 30 phút, Trước ngủ"
                    value={prescribeModal.timing}
                    onChange={(e) => setPrescribeModal((prev) => ({ ...prev, timing: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="prescribe-route" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    Đường dùng
                  </label>
                  <select
                    id="prescribe-route"
                    className="input"
                    value={prescribeModal.route}
                    onChange={(e) => setPrescribeModal((prev) => ({ ...prev, route: e.target.value }))}
                  >
                    <option value="uống">Uống</option>
                    <option value="bôi ngoài da">Bôi ngoài da</option>
                    <option value="tiêm dưới da">Tiêm dưới da</option>
                    <option value="xịt họng/mũi">Xịt họng/mũi</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label htmlFor="prescribe-condition" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  Mặt bệnh điều trị liên quan
                </label>
                <input
                  id="prescribe-condition"
                  type="text"
                  className="input"
                  placeholder="VD: Đái tháo đường típ 2, Tăng huyết áp..."
                  value={prescribeModal.conditionName}
                  onChange={(e) => setPrescribeModal((prev) => ({ ...prev, conditionName: e.target.value }))}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPrescribeModal((prev) => ({ ...prev, open: false }))}
                  disabled={saving}
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" style={{ background: "#0284c7", borderColor: "#0284c7" }} disabled={saving}>
                  {saving ? "Đang kê đơn…" : "💾 Xác nhận kê đơn"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CHỈNH SỬA THUỐC CHO BÁC SĨ */}
      {editMedModal.open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              maxWidth: 480,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              border: "1px solid #bae6fd",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>✏️</span>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>
                Chỉnh sửa đơn thuốc: {editMedModal.medName}
              </h3>
            </div>
            <form onSubmit={handleEditMedSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label htmlFor="editmed-dose" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    Liều dùng
                  </label>
                  <input
                    id="editmed-dose"
                    type="text"
                    className="input"
                    value={editMedModal.dose}
                    onChange={(e) => setEditMedModal((prev) => ({ ...prev, dose: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="editmed-freq" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    Tần suất
                  </label>
                  <input
                    id="editmed-freq"
                    type="text"
                    className="input"
                    value={editMedModal.frequency}
                    onChange={(e) => setEditMedModal((prev) => ({ ...prev, frequency: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label htmlFor="editmed-timing" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    Thời điểm uống
                  </label>
                  <input
                    id="editmed-timing"
                    type="text"
                    className="input"
                    value={editMedModal.timing}
                    onChange={(e) => setEditMedModal((prev) => ({ ...prev, timing: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="editmed-route" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    Đường dùng
                  </label>
                  <select
                    id="editmed-route"
                    className="input"
                    value={editMedModal.route}
                    onChange={(e) => setEditMedModal((prev) => ({ ...prev, route: e.target.value }))}
                  >
                    <option value="uống">Uống</option>
                    <option value="bôi ngoài da">Bôi ngoài da</option>
                    <option value="tiêm dưới da">Tiêm dưới da</option>
                    <option value="xịt họng/mũi">Xịt họng/mũi</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label htmlFor="editmed-cond" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  Mặt bệnh điều trị
                </label>
                <input
                  id="editmed-cond"
                  type="text"
                  className="input"
                  value={editMedModal.conditionName}
                  onChange={(e) => setEditMedModal((prev) => ({ ...prev, conditionName: e.target.value }))}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditMedModal((prev) => ({ ...prev, open: false }))}
                  disabled={saving}
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Đang lưu…" : "💾 Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA THUỐC CHO BÁC SĨ */}
      {deleteMedModal.open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              maxWidth: 450,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              border: "1px solid #fecaca",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>🗑️</span>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#991b1b" }}>
                Xác nhận xóa thuốc
              </h3>
            </div>
            <p style={{ fontSize: "0.88rem", color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa thuốc <strong>"{deleteMedModal.medName}"</strong> khỏi phác đồ điều trị của bệnh nhân? Hành động này sẽ được ghi nhận vào Audit Log y khoa.
            </p>
            <form onSubmit={handleDeleteMedSubmit}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeleteMedModal({ open: false, medId: "", medName: "" })}
                  disabled={saving}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: "#dc2626", borderColor: "#dc2626" }}
                  disabled={saving}
                >
                  {saving ? "Đang xóa..." : "🗑️ Xác nhận xóa thuốc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÓA BỆNH ĐIỀU TRỊ */}
      {deleteModal.open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              maxWidth: 480,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              border: "1px solid #fecaca",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>🗑️</span>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#991b1b" }}>
                Xác nhận xóa bệnh điều trị
              </h3>
            </div>
            <p style={{ fontSize: "0.88rem", color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
              Bạn đang yêu cầu xóa mặt bệnh <strong>"{deleteModal.condName}"</strong> khỏi hồ sơ điều trị hiện tại của bệnh nhân. Hành động này chỉ áp dụng khi nhập nhầm chẩn đoán và sẽ được lưu trong Audit Log y khoa.
            </p>
            <form onSubmit={handleDeleteConditionSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="delete-cond-reason" className="label" style={{ fontWeight: 700, fontSize: "0.82rem" }}>
                  Lý do xóa chẩn đoán (*)
                </label>
                <input
                  id="delete-cond-reason"
                  type="text"
                  className="input"
                  placeholder="VD: Nhập nhầm từ hồ sơ bệnh nhân khác, chẩn đoán trùng lặp..."
                  value={deleteModal.reason}
                  onChange={(e) => setDeleteModal((prev) => ({ ...prev, reason: e.target.value }))}
                  required
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeleteModal({ open: false, condId: "", condName: "", reason: "" })}
                  disabled={saving}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: "#dc2626", borderColor: "#dc2626" }}
                  disabled={saving}
                >
                  {saving ? "Đang xóa..." : "🗑️ Xác nhận xóa vĩnh viễn"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          onResolveCondition={handleResolveCondition}
          onOpenDeleteModal={(id, name) => setDeleteModal({ open: true, condId: id, condName: name, reason: "" })}
          onOpenPrescribeModal={(condName) =>
            setPrescribeModal({
              open: true,
              conditionName: condName,
              rawName: "",
              dose: "1 viên/lần",
              frequency: "2 lần/ngày",
              timing: "Sau ăn 30 phút",
              route: "uống",
              instructions: "",
            })
          }
          onOpenEditMedModal={(med) =>
            setEditMedModal({
              open: true,
              medId: med.id,
              medName: med.name,
              dose: med.dose || "",
              frequency: med.frequency || "",
              timing: med.timing || "",
              route: med.route || "uống",
              conditionName: activeCondition.name,
            })
          }
          onOpenDeleteMedModal={(id, name) => setDeleteMedModal({ open: true, medId: id, medName: name })}
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
          onResolveCondition={handleResolveCondition}
          onOpenDeleteModal={(id, name) => setDeleteModal({ open: true, condId: id, condName: name, reason: "" })}
          onOpenPrescribeModal={(condName) =>
            setPrescribeModal({
              open: true,
              conditionName: condName || (data.conditions?.[0]?.name || ""),
              rawName: "",
              dose: "1 viên/lần",
              frequency: "2 lần/ngày",
              timing: "Sau ăn 30 phút",
              route: "uống",
              instructions: "",
            })
          }
          onOpenEditMedModal={(med) =>
            setEditMedModal({
              open: true,
              medId: med.id,
              medName: med.name,
              dose: med.dose || "",
              frequency: med.frequency || "",
              timing: med.timing || "",
              route: med.route || "uống",
              conditionName: getConditionForMed(med, data.conditions || []) || "",
            })
          }
          onOpenDeleteMedModal={(id, name) => setDeleteMedModal({ open: true, medId: id, medName: name })}
        />
      )}
    </>
  );
}
