"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, getUser } from "../../lib/api";
import {
  AppShell,
  EmptyState,
  ErrorBox,
  ResultBox,
  SuccessBox,
  VerifiedBadge,
} from "../../components/ui";
import { TreatmentTimeline } from "../../components/TreatmentTimeline";

interface AssignedPatient {
  profile_id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  unseen_updates: number;
  has_critical?: boolean;
  unseen_obs?: number;
  unseen_meds?: number;
  unseen_triage?: number;
}
interface ClinicalInfo {
  profile_id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  weight: string | null;
  heart_rate: string | null;
  blood_pressure: string | null;
  spo2: string | null;
  clinical_note: string | null;
}
interface Medication {
  id: string;
  raw_name: string;
  is_current: boolean;
  is_planned: boolean;
  frequency: string | null;
  verification: string;
}
interface Allergy {
  id: string;
  substance: string;
  reaction: string | null;
  severity?: string | null;
  verification: string;
}
interface Observation {
  id: string;
  kind: string;
  label: string;
  value: string | null;
  unit: string | null;
  occurred_at: string;
  image_url?: string | null;
  status: string;
  verification: string;
}
interface CheckResult {
  id: string;
  result_status: string;
  result: Record<string, unknown>;
}
interface Appointment {
  id: string;
  patient_user_id: string;
  scheduled_at: string;
  status: string;
  reason: string | null;
}
interface SuspectItem {
  rank: number;
  drug: string;
  score: number;
  level: string;
  reasons: string[];
  source: string;
}
interface SuspectRankingResult {
  id: string;
  summary: string;
  ranking: SuspectItem[];
  status: string;
}
interface GuideContent {
  drug_name: string;
  purpose: string;
  dose: string;
  timing: string;
}
interface Guide {
  id: string;
  medication_id: string | null;
  content: GuideContent;
  status: string;
  acknowledgment: string;
  created_at: string;
}
interface AiSummary {
  summary: string;
  highlights: string[];
  symptoms: string[];
  labs: string[];
  medications_by_source: string[];
  allergies: string[];
  triage_recent: string[];
  disclaimer: string;
}

interface DrugSuggestion {
  name: string;
  clean_name: string;
  strength: string;
  form: string;
  type: string;
  ingredients: string[];
  category: string;
  ai_hint: string;
  interactions_count: number;
  is_allergy: boolean;
  is_current: boolean;
  source: string;
}

interface SideNoteCondition {
  id: string;
  name: string;
  status?: string;
  note?: string;
}

function DoctorPatientSideNotePanel({
  profileId,
  patientName,
}: {
  readonly profileId: string;
  readonly patientName: string;
}) {
  const [conditions, setConditions] = useState<SideNoteCondition[]>([]);
  const [selectedConditionId, setSelectedConditionId] = useState<string>("primary");
  const [noteText, setNoteText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    api<{
      conditions?: SideNoteCondition[];
      admission_note?: string;
      diagnosis?: string;
    }>(`/v1/patients/${profileId}/timeline`)
      .then((res) => {
        const conds = res.conditions || [];
        if (conds.length === 0 && res.diagnosis) {
          conds.push({
            id: "primary",
            name: res.diagnosis,
            note: res.admission_note || "",
          });
        }
        setConditions(conds);
        if (conds.length > 0) {
          setSelectedConditionId(conds[0].id);
          setNoteText(conds[0].note || "");
        }
      })
      .catch(() => {});
  }, [profileId]);

  function handleSelectCondition(id: string) {
    setSelectedConditionId(id);
    const target = conditions.find((c) => c.id === id);
    setNoteText(target?.note || "");
    setSavedStatus(null);
  }

  async function handleSaveNote() {
    try {
      setIsSaving(true);
      await api(`/v1/patients/${profileId}/treatment`, {
        method: "PUT",
        body: {
          condition_id: selectedConditionId,
          admission_note: noteText,
        },
      });
      setConditions((prev) =>
        prev.map((c) => (c.id === selectedConditionId ? { ...c, note: noteText } : c))
      );
      setSavedStatus("Đã lưu");
      setTimeout(() => setSavedStatus(null), 3000);
    } catch {
      setSavedStatus("Lỗi lưu");
    } finally {
      setIsSaving(false);
    }
  }

  const currentCond = conditions.find((c) => c.id === selectedConditionId) || conditions[0];

  return (
    <div
      className="disease-note-dock"
      style={{
        width: "100%",
        background: "#ffffff",
        border: "1.5px solid #0284c7",
        borderRadius: 16,
        boxShadow: "0 8px 30px rgba(2, 132, 199, 0.12)",
        overflow: "hidden",
      }}
    >
      {/* Header đỏ nổi bật theo đúng bản vẽ */}
      <div
        style={{
          padding: "14px 18px",
          background: "linear-gradient(135deg, #fff1f2 0%, #fef2f2 100%)",
          borderBottom: "1.5px solid #fecdd3",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "1.4rem" }}>✍️</span>
          <strong style={{ fontSize: "1.25rem", color: "#dc2626", fontWeight: 900, letterSpacing: "-0.01em" }}>
            Ghi chú:
          </strong>
        </div>
        <span className="badge badge-danger" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
          Riêng từng bệnh
        </span>
      </div>

      {/* Chọn loại bệnh */}
      <div style={{ padding: "12px 16px 8px", background: "#ffffff" }}>
        <label
          htmlFor="side-condition-select"
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
          🩺 BỆNH ĐANG GHI CHÚ:
        </label>
        {conditions.length > 1 ? (
          <select
            id="side-condition-select"
            value={selectedConditionId}
            onChange={(e) => handleSelectCondition(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1.5px solid #7dd3fc",
              fontSize: "0.86rem",
              fontWeight: 700,
              color: "#0369a1",
              background: "#f0f9ff",
            }}
          >
            {conditions.map((c, i) => (
              <option key={c.id} value={c.id}>
                {i + 1}. {c.name}
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
            title={currentCond?.name || patientName}
          >
            🩺 {currentCond?.name || "Bệnh lý chung"}
          </div>
        )}
        <p style={{ margin: "6px 0 0", fontSize: "0.74rem", color: "#64748b", fontStyle: "italic" }}>
          * Thanh ghi chú này thuộc loại bệnh riêng, mỗi loại bệnh Bệnh Nhân có thanh ghi chú riêng để Bác Sĩ nhập, Thanh Ghi chú không dùng chung cho tất cả loại bệnh.
        </p>
      </div>

      {/* Textarea ghi chú */}
      <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column" }}>
        <textarea
          className="note-paper-area"
          value={noteText}
          onChange={(e) => {
            setNoteText(e.target.value);
            setSavedStatus(null);
          }}
          onBlur={handleSaveNote}
          placeholder="Ghi chú về Bệnh Nhân..."
          rows={14}
          style={{
            width: "100%",
            minHeight: "260px",
            fontSize: "0.92rem",
            lineHeight: "26px",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Footer lưu */}
      <div
        style={{
          padding: "10px 16px",
          background: "#f8fafc",
          borderTop: "1px solid #e2e8f0",
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
          style={{ fontSize: "0.85rem", padding: "6px 16px", fontWeight: 700 }}
        >
          {isSaving ? "Đang lưu..." : "💾 Lưu ghi chú"}
        </button>
      </div>
    </div>
  );
}

export default function DoctorPortal() {
  const router = useRouter();
  const [patients, setPatients] = useState<AssignedPatient[]>([]);
  const [selected, setSelected] = useState<AssignedPatient | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [obs, setObs] = useState<Observation[]>([]);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [newDrug, setNewDrug] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reaction, setReaction] = useState("");
  const [prevDrugs, setPrevDrugs] = useState("");
  const [suspect, setSuspect] = useState<SuspectRankingResult | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Thông tin lâm sàng & Chỉ số sinh hiệu của Bệnh nhân
  const [clinicalInfo, setClinicalInfo] = useState<ClinicalInfo | null>(null);
  const [showClinicalModal, setShowClinicalModal] = useState(false);
  const [clinicalForm, setClinicalForm] = useState({
    full_name: "",
    dob: "",
    gender: "Nam",
    weight: "",
    heart_rate: "",
    blood_pressure: "",
    spo2: "",
    clinical_note: "",
  });
  const [savingClinical, setSavingClinical] = useState(false);

  // Kê đơn thuốc mới (10.3)
  const [prescribeName, setPrescribeName] = useState("");
  const [prescribeDose, setPrescribeDose] = useState("1 viên/lần");
  const [prescribeFreq, setPrescribeFreq] = useState("1 lần/ngày");
  const [prescribeRoute, setPrescribeRoute] = useState("uống");
  const [prescribeTiming, setPrescribeTiming] = useState("Sau ăn 30 phút");
  const [prescribeInstructions, setPrescribeInstructions] = useState("");
  const [prescribeConditionName, setPrescribeConditionName] = useState("");
  const [patientConditions, setPatientConditions] = useState<Array<{ id: string; name: string; status?: string }>>([]);
  const [prescribeSuggestions, setPrescribeSuggestions] = useState<DrugSuggestion[]>([]);
  const [showPrescribeSuggestions, setShowPrescribeSuggestions] = useState(false);
  const [prescribeSafetyCheck, setPrescribeSafetyCheck] = useState<{
    status: "idle" | "checking" | "safe" | "warning" | "danger";
    message: string;
    interactions?: any[];
  }>({ status: "idle", message: "" });
  const [prescribing, setPrescribing] = useState(false);
  const [showPrescribeModal, setShowPrescribeModal] = useState(false);

  // Khai báo tiền sử dị ứng mới
  const [showAddAllergyModal, setShowAddAllergyModal] = useState(false);
  const [allergySubstance, setAllergySubstance] = useState("");
  const [allergyReaction, setAllergyReaction] = useState("");
  const [allergySeverity, setAllergySeverity] = useState("medium");
  const [addingAllergy, setAddingAllergy] = useState(false);

  // AI AssistiveTouch Modal
  const [showAiModal, setShowAiModal] = useState(false);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  // Interactive MedSafe Drug Interaction Checker (Nhập 2/3 loại chất & kiểm tra tiền sử bệnh)
  const [medsafeInput, setMedsafeInput] = useState("");
  const [medsafeChecking, setMedsafeChecking] = useState(false);
  const [medsafeSuggestions, setMedsafeSuggestions] = useState<DrugSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [quickCheckResult, setQuickCheckResult] = useState<{
    status: string;
    status_label: string;
    alerts: Array<{
      rule_code: string;
      rule_version: string;
      rule_type: string;
      severity: string;
      message: string;
      source: string;
      detail?: Record<string, unknown>;
    }>;
    checked_drugs: string[];
    patient_allergies: string[];
    patient_conditions: string[];
    out_of_scope: string[];
    missing_data: string[];
    note: string;
  } | null>(null);

  // Collapse / Expand toggle state cho 2 cột tổng quan (Lịch hẹn bên trái, Ca bệnh nhân bên phải)
  const [showAppointments, setShowAppointments] = useState(true);
  const [showPatients, setShowPatients] = useState(true);

  // Live Search Filter cho 2 cột
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [patientSearch, setPatientSearch] = useState("");

  const filteredAppointments = useMemo(() => {
    const q = appointmentSearch.trim().toLowerCase();
    if (!q) return appointments;
    return appointments.filter(
      (a) =>
        (a.scheduled_at && a.scheduled_at.toLowerCase().includes(q)) ||
        (a.reason && a.reason.toLowerCase().includes(q)) ||
        (a.status && a.status.toLowerCase().includes(q))
    );
  }, [appointments, appointmentSearch]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        (p.full_name && p.full_name.toLowerCase().includes(q)) ||
        (p.dob && p.dob.toLowerCase().includes(q)) ||
        (p.gender && p.gender.toLowerCase().includes(q))
    );
  }, [patients, patientSearch]);

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user || (user.role !== "doctor" && user.role !== "pharmacist")) {
      window.location.href = "/login";
      return;
    }
    api<AssignedPatient[]>("/v1/patients/assigned")
      .then(setPatients)
      .catch((e) => setError(e.message));
    api<Appointment[]>("/v1/appointments")
      .then(setAppointments)
      .catch(() => {});
  }, []);

  async function confirmAppointment(id: string) {
    setError("");
    try {
      await api(`/v1/appointments/${id}/confirm`, { method: "POST" });
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "confirmed" } : a)));
      setSuccess("Đã xác nhận lịch hẹn. Người bệnh có thể vào phòng video.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác nhận được lịch");
    }
  }

  const openPatient = useCallback(async (p: AssignedPatient) => {
    setSelected(p);
    setCheck(null);
    setError("");
    setSuccess("");
    try {
      setMeds(await api<Medication[]>(`/v1/patients/${p.profile_id}/medications`));
      setAllergies(await api<Allergy[]>(`/v1/patients/${p.profile_id}/allergies`));
      setObs(await api<Observation[]>(`/v1/patients/${p.profile_id}/observations`));
      setGuides(await api<Guide[]>(`/v1/guides/profile/${p.profile_id}`));
      setAiSummary(null);
      setSuspect(null);
      setReaction("");
      setPrevDrugs("");

      // Tải thông tin lâm sàng & sinh hiệu
      api<ClinicalInfo>(`/v1/patients/${p.profile_id}/clinical-info`)
        .then((res) => {
          setClinicalInfo(res);
          setClinicalForm({
            full_name: res.full_name || p.full_name || "",
            dob: res.dob || p.dob || "",
            gender: res.gender || p.gender || "Nam",
            weight: res.weight || "",
            heart_rate: res.heart_rate || "",
            blood_pressure: res.blood_pressure || "",
            spo2: res.spo2 || "",
            clinical_note: res.clinical_note || "",
          });
        })
        .catch(() => {});

      // Tải các loại bệnh điều trị từ timeline
      api<any>(`/v1/patients/${p.profile_id}/timeline`)
        .then((tRes) => {
          if (tRes && Array.isArray(tRes.conditions)) {
            setPatientConditions(tRes.conditions);
          }
        })
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải hồ sơ");
    }
  }, []);


  async function markSeen(obsId: string) {
    if (!selected) return;
    try {
      await api(`/v1/patients/${selected.profile_id}/observations/${obsId}/status`, {
        method: "POST",
        body: { status: "seen" },
      });
      setObs((prev) => prev.map((o) => (o.id === obsId ? { ...o, status: "seen" } : o)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi cập nhật trạng thái");
    }
  }

  async function verifyMed(medId: string, verify: boolean) {
    if (!selected) return;
    try {
      await api(`/v1/patients/${selected.profile_id}/verify-medication/${medId}`, {
        method: "POST",
        body: { verify },
      });
      setMeds((prev) =>
        prev.map((m) => (m.id === medId ? { ...m, verification: verify ? "verified" : "unverified" } : m))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi xác minh");
    }
  }

  async function verifyAllergy(algId: string, verify: boolean) {
    if (!selected) return;
    try {
      await api(`/v1/patients/${selected.profile_id}/verify-allergy/${algId}`, {
        method: "POST",
        body: { verify },
      });
      setAllergies((prev) =>
        prev.map((a) => (a.id === algId ? { ...a, verification: verify ? "verified" : "unverified" } : a))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi xác minh");
    }
  }

  async function addPlannedMed(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !newDrug.trim()) return;
    try {
      await api(`/v1/patients/${selected.profile_id}/medications`, {
        method: "POST",
        body: { raw_name: newDrug.trim(), is_current: false, is_planned: true },
      });
      setNewDrug("");
      setSuccess("Đã thêm thuốc dự kiến. Hãy chạy kiểm tra an toàn trước khi quyết định.");
      await openPatient(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thêm được thuốc");
    }
  }

  async function handlePrescribeNameInput(val: string) {
    setPrescribeName(val);
    const token = val.trim();
    if (token.length >= 1) {
      try {
        const url = `/v1/safety-checks/suggest-drugs?q=${encodeURIComponent(token)}${selected ? `&profile_id=${selected.profile_id}` : ""}`;
        const res = await api<DrugSuggestion[]>(url);
        setPrescribeSuggestions(res.slice(0, 8));
        setShowPrescribeSuggestions(true);
      } catch {
        setPrescribeSuggestions([]);
      }
      void runPrescribeSafetyCheck(val);
    } else {
      setShowPrescribeSuggestions(false);
      setPrescribeSafetyCheck({ status: "idle", message: "" });
    }
  }

  async function runPrescribeSafetyCheck(drugName: string) {
    if (!selected || !drugName.trim()) {
      setPrescribeSafetyCheck({ status: "idle", message: "" });
      return;
    }
    try {
      setPrescribeSafetyCheck({ status: "checking", message: "AI Gemini đang phân tích tương tác thuốc & tiền sử dị ứng..." });
      const res = await api<any>("/v1/safety-checks/quick-check", {
        method: "POST",
        body: {
          drugs: [drugName.trim()],
          profile_id: selected.profile_id,
        },
      });
      if (res.status === "danger" || res.status === "critical") {
        setPrescribeSafetyCheck({
          status: "danger",
          message: `🔴 CẢNH BÁO NGUY HIỂM / CHỐNG CHỈ ĐỊNH: ${res.summary || "Có tương tác đối kháng nghiêm trọng hoặc trùng tiền sử dị ứng"}`,
          interactions: res.interactions || [],
        });
      } else if (res.status === "warning" || (res.interactions && res.interactions.length > 0)) {
        setPrescribeSafetyCheck({
          status: "warning",
          message: `🟡 THẬN TRỌNG: ${res.summary || "Cần lưu ý theo dõi hoặc giãn cách thời điểm dùng"}`,
          interactions: res.interactions || [],
        });
      } else {
        setPrescribeSafetyCheck({
          status: "safe",
          message: "🟢 AN TOÀN: Không phát hiện tương tác đối kháng với thuốc hiện tại và bệnh lý người bệnh.",
        });
      }
    } catch {
      setPrescribeSafetyCheck({ status: "idle", message: "" });
    }
  }

  function selectPrescribeDrug(item: DrugSuggestion) {
    setPrescribeName(item.name);
    if (item.strength) setPrescribeDose(`1 viên (${item.strength})`);
    if (item.form?.toLowerCase().includes("bôi")) {
      setPrescribeRoute("bôi ngoài da");
      setPrescribeTiming("Sáng & Tối");
    } else if (item.form?.toLowerCase().includes("tiêm")) {
      setPrescribeRoute("tiêm bắp");
    } else {
      setPrescribeRoute("uống");
    }
    setShowPrescribeSuggestions(false);
    void runPrescribeSafetyCheck(item.name);
  }

  async function handleMarkAllSeen() {
    if (!selected) return;
    try {
      await api(`/v1/patients/${selected.profile_id}/mark-all-seen`, { method: "POST" });
      setSuccess("Đã đánh dấu xem tất cả cập nhật mới của bệnh nhân!");
      setSelected((prev) => (prev ? { ...prev, unseen_updates: 0 } : null));
      const res = await api<AssignedPatient[]>("/v1/patients/assigned");
      setPatients(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi khi đánh dấu đã xem");
    }
  }

  async function handlePrescribe(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !prescribeName.trim()) return;
    setPrescribing(true);
    setError("");
    setSuccess("");
    try {
      await api(`/v1/patients/${selected.profile_id}/prescribe`, {
        method: "POST",
        body: {
          raw_name: prescribeName.trim(),
          dose: prescribeDose.trim() || null,
          frequency: prescribeFreq.trim() || null,
          route: prescribeRoute,
          timing: prescribeTiming.trim() || null,
          instructions: prescribeInstructions.trim() || null,
          condition_name: prescribeConditionName.trim() || null,
        },
      });
      setSuccess(`Đã kê đơn thành công thuốc "${prescribeName.trim()}" cho ${selected.full_name}. Người bệnh đã nhận được thông báo!`);
      setPrescribeName("");
      setPrescribeConditionName("");
      setPrescribeSafetyCheck({ status: "idle", message: "" });
      setShowPrescribeModal(false);
      await openPatient(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không kê đơn được thuốc");
    } finally {
      setPrescribing(false);
    }
  }

  async function handleAddAllergy(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !allergySubstance.trim()) return;
    setAddingAllergy(true);
    setError("");
    try {
      await api(`/v1/patients/${selected.profile_id}/allergies`, {
        method: "POST",
        body: {
          substance: allergySubstance.trim(),
          reaction: allergyReaction.trim() || null,
          severity: allergySeverity,
        },
      });
      setSuccess(`Đã ghi nhận tiền sử dị ứng "${allergySubstance.trim()}" cho ${selected.full_name}`);
      setAllergySubstance("");
      setAllergyReaction("");
      setShowAddAllergyModal(false);
      await openPatient(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thêm được tiền sử dị ứng");
    } finally {
      setAddingAllergy(false);
    }
  }

  async function deleteAllergy(allergyId: string, substance: string) {
    if (!selected) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa tiền sử dị ứng "${substance}" của người bệnh?`)) return;
    setError("");
    try {
      await api(`/v1/patients/${selected.profile_id}/allergies/${allergyId}`, { method: "DELETE" });
      setAllergies((prev) => prev.filter((a) => a.id !== allergyId));
      setSuccess(`Đã xóa dị ứng "${substance}"`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được tiền sử dị ứng");
    }
  }

  async function deleteMed(medId: string, name: string) {
    if (!selected) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa thuốc "${name}" khỏi danh sách?`)) return;
    setError("");
    try {
      await api(`/v1/patients/${selected.profile_id}/medications/${medId}`, { method: "DELETE" });
      setMeds((prev) => prev.filter((m) => m.id !== medId));
      setSuccess(`Đã xóa thuốc "${name}" khỏi hồ sơ`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được thuốc");
    }
  }

  async function runInteractiveMedSafeCheck(drugsToCheck?: string[]) {
    setMedsafeChecking(true);
    setError("");
    setSuccess("");
    try {
      let drugList: string[] = [];
      if (drugsToCheck && drugsToCheck.length > 0) {
        drugList = drugsToCheck;
      } else if (medsafeInput.trim()) {
        drugList = medsafeInput
          .split(/[,;\n+]/)
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (meds.length > 0) {
        drugList = meds.map((m) => m.raw_name);
      }

      if (drugList.length === 0) {
        setError("Vui lòng nhập 2 hoặc 3 loại thuốc/hoạt chất hoặc chọn thuốc của bệnh nhân để kiểm tra tương tác.");
        setMedsafeChecking(false);
        return;
      }

      const res = await api<{
        status: string;
        status_label: string;
        alerts: Array<{
          rule_code: string;
          rule_version: string;
          rule_type: string;
          severity: string;
          message: string;
          source: string;
          detail?: Record<string, unknown>;
        }>;
        checked_drugs: string[];
        patient_allergies: string[];
        patient_conditions: string[];
        out_of_scope: string[];
        missing_data: string[];
        note: string;
      }>("/v1/safety-checks/quick-check", {
        method: "POST",
        body: {
          profile_id: selected?.profile_id ?? null,
          drugs: drugList,
        },
      });

      setQuickCheckResult(res);
      setSuccess(`Đã kiểm tra tương tác an toàn cho: ${drugList.join(" + ")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kiểm tra tương tác thất bại");
    } finally {
      setMedsafeChecking(false);
    }
  }

  // Gợi ý thuốc thông minh theo Dược thư & AI Gemini (Hỗ trợ phím Tab hoàn tất tự động)
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  function getCurrentQueryToken(fullText: string): string {
    const trimmed = fullText;
    const lastSep = Math.max(
      trimmed.lastIndexOf(","),
      trimmed.lastIndexOf("+"),
      trimmed.lastIndexOf(";")
    );
    if (lastSep >= 0) {
      return trimmed.substring(lastSep + 1).trim();
    }
    return trimmed.trim();
  }

  async function fetchDrugSuggestions(token: string) {
    try {
      setLoadingSuggestions(true);
      const url = `/v1/safety-checks/suggest-drugs?q=${encodeURIComponent(token)}${selected ? `&profile_id=${selected.profile_id}` : ""}`;
      const list = await api<DrugSuggestion[]>(url);
      setMedsafeSuggestions(list);
      setShowSuggestions(list.length > 0);
      setActiveSuggestionIdx(0);
    } catch {
      setMedsafeSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function handleMedsafeChange(val: string) {
    setMedsafeInput(val);
    const token = getCurrentQueryToken(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchDrugSuggestions(token);
    }, 100);
  }

  function handleSelectSuggestion(s: DrugSuggestion) {
    const trimmed = medsafeInput;
    const lastSep = Math.max(
      trimmed.lastIndexOf(","),
      trimmed.lastIndexOf("+"),
      trimmed.lastIndexOf(";")
    );
    let next = "";
    const cleanName = s.clean_name || s.name;
    if (lastSep >= 0) {
      next = trimmed.substring(0, lastSep + 1) + " " + cleanName + ", ";
    } else {
      next = cleanName + ", ";
    }
    setMedsafeInput(next);
    setShowSuggestions(false);
  }

  function handleMedsafeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSuggestions && medsafeSuggestions.length > 0) {
      if (e.key === "Tab") {
        e.preventDefault();
        const chosen = medsafeSuggestions[activeSuggestionIdx >= 0 && activeSuggestionIdx < medsafeSuggestions.length ? activeSuggestionIdx : 0];
        if (chosen) handleSelectSuggestion(chosen);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIdx((prev) => (prev + 1) % medsafeSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIdx((prev) => (prev - 1 + medsafeSuggestions.length) % medsafeSuggestions.length);
        return;
      }
      if (e.key === "Enter") {
        if (activeSuggestionIdx >= 0 && activeSuggestionIdx < medsafeSuggestions.length) {
          e.preventDefault();
          handleSelectSuggestion(medsafeSuggestions[activeSuggestionIdx]);
          return;
        }
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      setShowSuggestions(false);
      void runInteractiveMedSafeCheck();
    }
  }

  async function runSafetyCheck() {
    if (!selected) return;
    const currentMeds = meds.map((m) => m.raw_name);
    if (currentMeds.length === 0 && !medsafeInput.trim()) {
      setError("Hồ sơ hiện chưa có thuốc. Hãy nhập 2/3 loại chất vào ô bên dưới để kiểm tra tương tác!");
      return;
    }
    await runInteractiveMedSafeCheck(currentMeds.length > 0 ? currentMeds : undefined);
  }


  async function runSuspectRanking() {
    if (!selected || !reaction.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await api<SuspectRankingResult>("/v1/triage/suspect-ranking", {
        method: "POST",
        body: {
          profile_id: selected.profile_id,
          reaction_description: reaction.trim(),
          previous_episode_drugs: prevDrugs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      setSuspect(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xếp hạng được");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveClinicalInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      setSavingClinical(true);
      setError("");
      const updated = await api<ClinicalInfo>(`/v1/patients/${selected.profile_id}/clinical-info`, {
        method: "PUT",
        body: clinicalForm,
      });
      setClinicalInfo(updated);
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              full_name: updated.full_name,
              dob: updated.dob,
              gender: updated.gender,
            }
          : null
      );
      setShowClinicalModal(false);
      setSuccess("Cập nhật thông tin lâm sàng và chỉ số sinh hiệu thành công!");
      api<AssignedPatient[]>("/v1/patients/assigned").then(setPatients).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật thông tin lâm sàng");
    } finally {
      setSavingClinical(false);
    }
  }

  async function confirmSuspect() {
    if (!suspect) return;
    try {
      await api(`/v1/triage/suspect-ranking/${suspect.id}/confirm`, { method: "POST" });
      setSuccess("Đã xác nhận tác nhân nghi ngờ → tự ghi hồ sơ dị ứng (chưa xác minh).");
      setSuspect(null);
      if (selected) await openPatient(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác nhận được");
    }
  }


  async function loadAiSummary() {
    if (!selected) return;
    setSummaryLoading(true);
    setError("");
    try {
      setAiSummary(await api<AiSummary>(`/v1/patients/${selected.profile_id}/ai-summary`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được tóm tắt");
    } finally {
      setSummaryLoading(false);
    }
  }

  function openAiAssistant() {
    setShowAiModal(true);
    if (!aiSummary && !summaryLoading) {
      loadAiSummary();
    }
  }

  async function draftGuide(medId: string) {
    setError("");
    try {
      const g = await api<Guide>(`/v1/guides/draft/${medId}`, { method: "POST" });
      setGuides((prev) => [g, ...prev.filter((x) => x.id !== g.id)]);
      setSuccess("AI đã soạn bản nháp hướng dẫn — hãy xem và duyệt để gửi người bệnh.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không soạn được hướng dẫn");
    }
  }

  async function approveGuide(guideId: string) {
    setError("");
    try {
      const g = await api<Guide>(`/v1/guides/${guideId}/approve`, { method: "POST" });
      setGuides((prev) => prev.map((x) => (x.id === g.id ? g : x)));
      setSuccess("Đã duyệt và gửi hướng dẫn cho người bệnh + người nhà.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không duyệt được");
    }
  }

  async function submitReview(decision: string) {
    if (!check) return;
    try {
      await api(`/v1/safety-checks/${check.id}/reviews`, {
        method: "POST",
        body: { decision, note: reviewNote || null },
      });
      setSuccess(
        decision === "dismissed_with_reason"
          ? "Đã ghi nhận: không áp dụng cảnh báo (có lý do)."
          : "Đã ghi nhận quyết định của bạn."
      );
      setReviewNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không ghi nhận được");
    }
  }

  return (
    <AppShell
      role="doctor"
      wide={true}
      icon={selected ? "🩺" : "👥"}
      title={selected ? selected.full_name : "Danh sách ca"}
      subtitle={
        selected
          ? "Hồ sơ người bệnh — dữ liệu tự khai cần xác minh trước khi dùng"
          : "Các người bệnh được phân công cho bạn"
      }
    >
      {selected && (
        <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)} style={{ marginBottom: 14 }}>
          ← Về danh sách ca
        </button>
      )}

      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {!selected && (
        <div className="doctor-dashboard-grid">
          {/* CỘT BÊN TRÁI: LỊCH HẸN ĐÃ XÁC NHẬN & VÀO PHÒNG VIDEO + CHỜ DUYỆT */}
          <div className="doctor-dashboard-card">
            <div
              className="doctor-dashboard-card-header"
              onClick={() => setShowAppointments((v) => !v)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🎥</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#0f172a", fontWeight: 800 }}>
                    Lịch hẹn đã xác nhận — vào phòng video
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    {appointments.filter((a) => a.status === "confirmed").length} đã xác nhận · {appointments.filter((a) => a.status === "requested").length} chờ duyệt
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="collapse-toggle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAppointments((v) => !v);
                }}
              >
                {showAppointments ? "▲ Ẩn nội dung" : "▼ Mở nội dung"}
              </button>
            </div>

            {showAppointments && (
              <div className="doctor-dashboard-card-body" style={{ padding: 16 }}>
                {/* Thanh tìm kiếm lịch hẹn */}
                <div className="dashboard-search-bar">
                  <span className="dashboard-search-icon">🔍</span>
                  <input
                    type="text"
                    className="dashboard-search-input"
                    value={appointmentSearch}
                    onChange={(e) => setAppointmentSearch(e.target.value)}
                    placeholder="Tìm kiếm lịch hẹn (theo ngày giờ, lý do khám)..."
                  />
                  {appointmentSearch && (
                    <button
                      type="button"
                      className="dashboard-search-clear"
                      onClick={() => setAppointmentSearch("")}
                      title="Xóa tìm kiếm"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {appointmentSearch && (
                  <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 10, paddingLeft: 2 }}>
                    Tìm thấy <strong>{filteredAppointments.length}</strong> / {appointments.length} lịch hẹn
                  </div>
                )}

                {/* Lịch hẹn chờ xác nhận */}
                {filteredAppointments.filter((a) => a.status === "requested").length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#d97706", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>⏳ Chờ xác nhận ({filteredAppointments.filter((a) => a.status === "requested").length})</span>
                    </div>
                    {filteredAppointments
                      .filter((a) => a.status === "requested")
                      .map((a) => (
                        <div
                          className="list-row"
                          key={a.id}
                          style={{
                            borderRadius: 10,
                            marginBottom: 8,
                            background: "#fffbeb",
                            border: "1px solid #fef3c7",
                            padding: "10px 12px",
                          }}
                        >
                          <div className="list-main">
                            <div className="list-title" style={{ fontWeight: 700, fontSize: "0.92rem" }}>
                              {a.scheduled_at}
                            </div>
                            <div className="list-sub" style={{ fontSize: "0.8rem" }}>
                              {a.reason ?? "Tái khám định kỳ"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => confirmAppointment(a.id)}>
                              Xác nhận
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/video/${a.id}`)}>
                              🎥 Vào phòng
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Lịch hẹn đã xác nhận */}
                {filteredAppointments.filter((a) => a.status === "confirmed").length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#0284c7", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>✅ Đã sẵn sàng ({filteredAppointments.filter((a) => a.status === "confirmed").length})</span>
                    </div>
                    {filteredAppointments
                      .filter((a) => a.status === "confirmed")
                      .map((a) => (
                        <div
                          className="list-row"
                          key={a.id}
                          style={{
                            borderRadius: 10,
                            marginBottom: 8,
                            background: "#f0f9ff",
                            border: "1.5px solid #bae6fd",
                            padding: "12px 14px",
                          }}
                        >
                          <div className="list-main">
                            <div className="list-title" style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0369a1" }}>
                              {a.scheduled_at}
                            </div>
                            <div className="list-sub" style={{ fontSize: "0.82rem", color: "#475569" }}>
                              {a.reason ?? "Tái khám định kỳ"}
                            </div>
                          </div>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ fontWeight: 700, padding: "6px 14px" }}
                            onClick={() => router.push(`/video/${a.id}`)}
                          >
                            🎥 Vào phòng
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {filteredAppointments.length === 0 && (
                  <EmptyState
                    icon={appointmentSearch ? "🔍" : "📅"}
                    text={appointmentSearch ? `Không tìm thấy lịch hẹn nào khớp với "${appointmentSearch}"` : "Hiện không có lịch hẹn trực tuyến nào."}
                  />
                )}
              </div>
            )}
          </div>

          {/* CỘT BÊN CÁNH PHẢI: CÁC CA BỆNH NHÂN */}
          <div className="doctor-dashboard-card">
            <div
              className="doctor-dashboard-card-header"
              onClick={() => setShowPatients((v) => !v)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>👥</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#0f172a", fontWeight: 800 }}>
                    Các ca bệnh nhân
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    Tổng cộng {patients.length} bệnh nhân được phân công
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="collapse-toggle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPatients((v) => !v);
                }}
              >
                {showPatients ? "▲ Ẩn nội dung" : "▼ Mở nội dung"}
              </button>
            </div>

            {showPatients && (
              <div className="doctor-dashboard-card-body" style={{ padding: 16 }}>
                {/* Thanh tìm kiếm bệnh nhân */}
                <div className="dashboard-search-bar">
                  <span className="dashboard-search-icon">🔍</span>
                  <input
                    type="text"
                    className="dashboard-search-input"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Tìm kiếm bệnh nhân (theo họ tên, ngày sinh, giới tính)..."
                  />
                  {patientSearch && (
                    <button
                      type="button"
                      className="dashboard-search-clear"
                      onClick={() => setPatientSearch("")}
                      title="Xóa tìm kiếm"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {patientSearch && (
                  <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 10, paddingLeft: 2 }}>
                    Tìm thấy <strong>{filteredPatients.length}</strong> / {patients.length} bệnh nhân
                  </div>
                )}

                {filteredPatients.length === 0 && (
                  <EmptyState
                    icon={patientSearch ? "🔍" : "👥"}
                    text={patientSearch ? `Không tìm thấy bệnh nhân nào khớp với "${patientSearch}"` : "Chưa có ca nào được phân công."}
                  />
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredPatients.map((p) => (
                    <div
                      className="list-row"
                      key={p.profile_id}
                      style={{
                        cursor: "pointer",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                        padding: "12px 14px",
                        transition: "all 0.15s ease",
                        background: "#ffffff",
                      }}
                      onClick={() => openPatient(p)}
                    >
                      <div className="list-main">
                        <div className="list-title" style={{ fontWeight: 800, fontSize: "0.96rem", color: "#0f172a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>{p.full_name}</span>
                          {p.unseen_updates > 0 && (
                            <span
                              className={`badge badge-danger ${p.has_critical ? "pulse-badge-danger" : ""}`}
                              style={{
                                fontSize: "0.78rem",
                                fontWeight: 800,
                                padding: "2px 8px",
                                borderRadius: 9999,
                                background: p.has_critical ? "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                                color: "#ffffff",
                                boxShadow: "0 2px 6px rgba(220, 38, 38, 0.3)",
                              }}
                              title={`${p.unseen_updates} cập nhật mới (triệu chứng mới, thuốc OTC tự dùng, nhật ký check-in)`}
                            >
                              {p.has_critical ? "🚨" : "🔔"} {p.unseen_updates}
                            </span>
                          )}
                        </div>
                        <div className="list-sub" style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 2 }}>
                          {p.gender ?? "—"} · {p.dob ?? "—"}
                        </div>
                      </div>
                      {p.unseen_updates > 0 ? (
                        <span className="badge badge-danger" style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                          {p.unseen_updates} biến động mới
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.82rem", color: "#0284c7", fontWeight: 700 }}>
                          Xem hồ sơ →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selected && (
        <div className="doctor-patient-two-column-layout">
          <div className="doctor-patient-main-col">
            {/* THÔNG TIN LÂM SÀNG & CHỈ SỐ SINH HIỆU BỆNH NHÂN */}
            <div className="vitals-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, borderBottom: "1px solid #f1f5f9", paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>🩺</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.08rem", color: "#0f172a", fontWeight: 800 }}>
                    Thông tin Lâm sàng & Chỉ số Sinh hiệu
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    Bệnh nhân: <strong>{selected.full_name}</strong> • Giới tính: <strong>{clinicalInfo?.gender || selected.gender || "—"}</strong> • Ngày sinh / Tuổi: <strong>{clinicalInfo?.dob || selected.dob || "—"}</strong>
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {selected.unseen_updates > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleMarkAllSeen}
                    style={{ fontSize: "0.84rem", fontWeight: 700, borderColor: "#22c55e", color: "#16a34a", background: "#f0fdf4" }}
                    title="Đánh dấu đã xem toàn bộ cập nhật mới từ bệnh nhân này"
                  >
                    ✓ Đã xem toàn bộ ({selected.unseen_updates} biến động mới)
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setClinicalForm({
                      full_name: clinicalInfo?.full_name || selected.full_name || "",
                      dob: clinicalInfo?.dob || selected.dob || "",
                      gender: clinicalInfo?.gender || selected.gender || "Nam",
                      weight: clinicalInfo?.weight || "",
                      heart_rate: clinicalInfo?.heart_rate || "",
                      blood_pressure: clinicalInfo?.blood_pressure || "",
                      spo2: clinicalInfo?.spo2 || "",
                      clinical_note: clinicalInfo?.clinical_note || "",
                    });
                    setShowClinicalModal(true);
                  }}
                  style={{ fontSize: "0.84rem", fontWeight: 700, borderColor: "#0284c7", color: "#0284c7" }}
                >
                  ✏️ Nhập / Sửa thông tin lâm sàng & sinh hiệu
                </button>
              </div>
            </div>

            {/* Lưới các chỉ số sinh hiệu (Vitals) */}
            <div className="vitals-grid">
              <div className="vital-box">
                <span className="vital-lbl">⚖️ Cân nặng</span>
                <span className="vital-val" style={{ color: clinicalInfo?.weight ? "#0284c7" : "#94a3b8" }}>
                  {clinicalInfo?.weight ? `${clinicalInfo.weight} kg` : "— Chưa nhập"}
                </span>
              </div>

              <div className="vital-box">
                <span className="vital-lbl">❤️ Nhịp tim / Mạch</span>
                <span className="vital-val" style={{ color: clinicalInfo?.heart_rate ? "#dc2626" : "#94a3b8" }}>
                  {clinicalInfo?.heart_rate ? `${clinicalInfo.heart_rate} bpm` : "— Chưa nhập"}
                </span>
              </div>

              <div className="vital-box">
                <span className="vital-lbl">🩸 Huyết áp (HA)</span>
                <span className="vital-val" style={{ color: clinicalInfo?.blood_pressure ? "#ea580c" : "#94a3b8" }}>
                  {clinicalInfo?.blood_pressure ? `${clinicalInfo.blood_pressure} mmHg` : "— Chưa nhập"}
                </span>
              </div>

              <div className="vital-box">
                <span className="vital-lbl">🫁 SpO2 (Oxy máu)</span>
                <span className="vital-val" style={{ color: clinicalInfo?.spo2 ? "#16a34a" : "#94a3b8" }}>
                  {clinicalInfo?.spo2 ? `${clinicalInfo.spo2}%` : "— Chưa nhập"}
                </span>
              </div>
            </div>

            {clinicalInfo?.clinical_note && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, fontSize: "0.82rem", color: "#475569" }}>
                <strong>📋 Ghi chú lâm sàng ban đầu:</strong> {clinicalInfo.clinical_note}
              </div>
            )}
          </div>

          {/* Modal Nhập/Chỉnh sửa thông tin lâm sàng & sinh hiệu */}
          {showClinicalModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(15, 23, 42, 0.6)",
                backdropFilter: "blur(4px)",
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
              }}
              onClick={() => setShowClinicalModal(false)}
            >
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: 16,
                  padding: 24,
                  maxWidth: 540,
                  width: "100%",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
                  maxHeight: "90vh",
                  overflowY: "auto",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#0f172a", fontWeight: 800 }}>
                    🩺 Nhập thông tin lâm sàng & Chỉ số sinh hiệu
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowClinicalModal(false)}
                    style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#64748b" }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveClinicalInfo}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label htmlFor="clin-name" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        Họ và tên bệnh nhân
                      </label>
                      <input
                        id="clin-name"
                        type="text"
                        className="input"
                        value={clinicalForm.full_name}
                        onChange={(e) => setClinicalForm((prev) => ({ ...prev, full_name: e.target.value }))}
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="clin-dob" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        Ngày sinh / Tuổi (YYYY-MM-DD)
                      </label>
                      <input
                        id="clin-dob"
                        type="text"
                        className="input"
                        value={clinicalForm.dob}
                        onChange={(e) => setClinicalForm((prev) => ({ ...prev, dob: e.target.value }))}
                        placeholder="VD: 1990-05-15 hoặc 35 tuổi"
                      />
                    </div>

                    <div>
                      <label htmlFor="clin-gender" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        Giới tính
                      </label>
                      <select
                        id="clin-gender"
                        className="input"
                        value={clinicalForm.gender}
                        onChange={(e) => setClinicalForm((prev) => ({ ...prev, gender: e.target.value }))}
                      >
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                        <option value="Khác">Khác</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="clin-weight" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        ⚖️ Cân nặng (kg)
                      </label>
                      <input
                        id="clin-weight"
                        type="text"
                        className="input"
                        value={clinicalForm.weight}
                        onChange={(e) => setClinicalForm((prev) => ({ ...prev, weight: e.target.value }))}
                        placeholder="VD: 65"
                      />
                    </div>

                    <div>
                      <label htmlFor="clin-hr" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        ❤️ Nhịp tim / Mạch (bpm)
                      </label>
                      <input
                        id="clin-hr"
                        type="text"
                        className="input"
                        value={clinicalForm.heart_rate}
                        onChange={(e) => setClinicalForm((prev) => ({ ...prev, heart_rate: e.target.value }))}
                        placeholder="VD: 78"
                      />
                    </div>

                    <div>
                      <label htmlFor="clin-bp" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        🩸 Huyết áp (mmHg)
                      </label>
                      <input
                        id="clin-bp"
                        type="text"
                        className="input"
                        value={clinicalForm.blood_pressure}
                        onChange={(e) => setClinicalForm((prev) => ({ ...prev, blood_pressure: e.target.value }))}
                        placeholder="VD: 120/80"
                      />
                    </div>

                    <div>
                      <label htmlFor="clin-spo2" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        🫁 SpO2 (%)
                      </label>
                      <input
                        id="clin-spo2"
                        type="text"
                        className="input"
                        value={clinicalForm.spo2}
                        onChange={(e) => setClinicalForm((prev) => ({ ...prev, spo2: e.target.value }))}
                        placeholder="VD: 98"
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label htmlFor="clin-note" className="label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        📋 Ghi chú lâm sàng / Tình trạng ban đầu
                      </label>
                      <textarea
                        id="clin-note"
                        className="input"
                        rows={3}
                        value={clinicalForm.clinical_note}
                        onChange={(e) => setClinicalForm((prev) => ({ ...prev, clinical_note: e.target.value }))}
                        placeholder="VD: Bệnh nhân tỉnh táo, tiếp xúc tốt, có ban đỏ rải rác vùng ngực và cánh tay..."
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowClinicalModal(false)}
                      disabled={savingClinical}
                    >
                      Hủy
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={savingClinical}>
                      {savingClinical ? "Đang lưu..." : "💾 Lưu thông tin lâm sàng"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="stat-row">
            <div className="stat">
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#0284c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                💊
              </div>
              <div>
                <div className="s-num">{meds.length}</div>
                <div className="s-label">Thuốc đang dùng</div>
              </div>
            </div>


            <div className="stat">
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: allergies.length > 0 ? "#fff1f2" : "#f8fafc",
                  border: allergies.length > 0 ? "1px solid #fecdd3" : "1px solid #e2e8f0",
                  color: allergies.length > 0 ? "#e11d48" : "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                🚫
              </div>
              <div>
                <div
                  className="s-num"
                  style={{ color: allergies.length > 0 ? "#e11d48" : "inherit" }}
                >
                  {allergies.length}
                </div>
                <div className="s-label">Tiền sử dị ứng</div>
              </div>
            </div>

            <div className="stat">
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: obs.filter((o) => o.status === "sent").length > 0 ? "#fffbeb" : "#f8fafc",
                  border: obs.filter((o) => o.status === "sent").length > 0 ? "1px solid #fde68a" : "1px solid #e2e8f0",
                  color: obs.filter((o) => o.status === "sent").length > 0 ? "#d97706" : "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                🩺
              </div>
              <div>
                <div
                  className="s-num"
                  style={{
                    color:
                      obs.filter((o) => o.status === "sent").length > 0 ? "#d97706" : "inherit",
                  }}
                >
                  {obs.filter((o) => o.status === "sent").length}
                </div>
                <div className="s-label">Cập nhật chưa xem</div>
              </div>
            </div>
          </div>

          {/* CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ & LOẠI BỆNH (BÁC SĨ) */}
          <TreatmentTimeline
            profileId={selected.profile_id}
            isDoctor={true}
            onRefresh={() => openPatient(selected)}
          />

          {/* DANH SÁCH THUỐC ĐANG ĐIỀU TRỊ */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-title" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="t-ico">💊</span>
                <span>Danh mục thuốc đang điều trị ({meds.length})</span>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowPrescribeModal(!showPrescribeModal)}
                style={{ fontSize: 12.5 }}
              >
                {showPrescribeModal ? "✕ Đóng form" : "+ 🩺 Kê đơn thuốc mới"}
              </button>
            </div>

            {/* Form Kê đơn thuốc mới của Bác sĩ */}
            {showPrescribeModal && (
              <div style={{ background: "rgba(14, 165, 233, 0.08)", border: "1px solid rgba(14, 165, 233, 0.3)", borderRadius: 14, padding: 16, marginBottom: 18 }}>
                <div style={{ fontWeight: 700, color: "var(--brand-600)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🩺 Kê đơn thuốc chính thức (Ký bởi Bác sĩ)</span>
                </div>

                {/* Thuốc mẫu nhanh */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", marginRight: 8 }}>Gợi ý nhanh:</span>
                  {[
                    { name: "Fexofenadine 180mg", dose: "1 viên", freq: "1 lần/ngày", timing: "Sau ăn sáng" },
                    { name: "Cetirizine 10mg", dose: "1 viên", freq: "1 lần/ngày", timing: "Sau ăn tối 20h" },
                    { name: "Methylprednisolon 16mg", dose: "1 viên", freq: "1 lần/ngày", timing: "Sau ăn no sáng" },
                    { name: "Kem Hydrocortisone 1%", dose: "Lớp mỏng", freq: "2 lần/ngày", timing: "Sáng & Tối", route: "bôi ngoài da" },
                  ].map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11.5, padding: "3px 9px", marginRight: 6, marginBottom: 6, backgroundColor: "#ffffff" }}
                      onClick={() => {
                        setPrescribeName(item.name);
                        setPrescribeDose(item.dose);
                        setPrescribeFreq(item.freq);
                        setPrescribeTiming(item.timing);
                        if (item.route) setPrescribeRoute(item.route);
                      }}
                    >
                      + {item.name}
                    </button>
                  ))}
                </div>

                <form onSubmit={handlePrescribe}>
                  {/* CHỌN LOẠI BỆNH ĐIỀU TRỊ */}
                  <div className="field">
                    <label className="label">Kê đơn cho loại bệnh điều trị (*)</label>
                    <select
                      className="input"
                      value={prescribeConditionName}
                      onChange={(e) => setPrescribeConditionName(e.target.value)}
                    >
                      <option value="">-- Phác đồ điều trị chung / Toàn thân --</option>
                      {patientConditions.map((c) => (
                        <option key={c.id} value={c.name}>
                          🩺 {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* AUTOCOMPLETE TÊN THUỐC & HOẠT CHẤT (10.3) */}
                  <div className="field autocomplete-wrapper">
                    <label className="label">
                      Tên thuốc & hàm lượng (*) — <span style={{ color: "#0284c7", fontWeight: 600 }}>Gõ 1 chữ cái đầu để gợi ý thông minh</span>
                    </label>
                    <input
                      className="input"
                      placeholder="VD: gõ 'c' -> Cetirizine, 'f' -> Fexofenadine, 'm' -> Medrol..."
                      value={prescribeName}
                      onChange={(e) => handlePrescribeNameInput(e.target.value)}
                      required
                      autoComplete="off"
                    />
                    {showPrescribeSuggestions && prescribeSuggestions.length > 0 && (
                      <div className="autocomplete-dropdown-list">
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>
                          🔍 GỢI Ý THUỐC & HOẠT CHẤT (DƯỢC THƯ BỘ Y TẾ & AI)
                        </div>
                        {prescribeSuggestions.map((item) => (
                          <div
                            key={item.name}
                            className="autocomplete-item-row"
                            onClick={() => selectPrescribeDrug(item)}
                          >
                            <div>
                              <div className="autocomplete-item-title">
                                {item.is_allergy ? "⚠️ " : "💊 "}
                                {item.name}
                              </div>
                              <div className="autocomplete-item-sub">
                                {item.category || item.form || "Thuốc điều trị"} {item.strength ? `· ${item.strength}` : ""}
                              </div>
                            </div>
                            {item.ai_hint && (
                              <span className="badge badge-warning" style={{ fontSize: 10 }}>
                                {item.ai_hint.slice(0, 32)}...
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* REAL-TIME AI SAFETY GUARDRAILS CARD (10.3) */}
                  {prescribeSafetyCheck.status !== "idle" && (
                    <div
                      className={`ai-prescribe-safety-card ${
                        prescribeSafetyCheck.status === "danger"
                          ? "danger"
                          : prescribeSafetyCheck.status === "warning"
                          ? "warning"
                          : prescribeSafetyCheck.status === "safe"
                          ? "safe"
                          : ""
                      }`}
                    >
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{prescribeSafetyCheck.status === "checking" ? "⏳" : "🛡️ AI Safety Guardrails:"}</span>
                        <span>{prescribeSafetyCheck.message}</span>
                      </div>
                      {prescribeSafetyCheck.interactions && prescribeSafetyCheck.interactions.length > 0 && (
                        <ul style={{ margin: "6px 0 0 18px", fontSize: "0.82rem", lineHeight: 1.5 }}>
                          {prescribeSafetyCheck.interactions.map((it: any, idx: number) => (
                            <li key={idx}>
                              <strong>{it.drug1} + {it.drug2}:</strong> {it.mechanism || it.description || "Có tương tác đối kháng"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="field">
                      <label className="label">Liều dùng</label>
                      <input
                        className="input"
                        placeholder="VD: 1 viên/lần"
                        value={prescribeDose}
                        onChange={(e) => setPrescribeDose(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="label">Tần suất</label>
                      <input
                        className="input"
                        placeholder="VD: 1 lần/ngày, 2 lần/ngày"
                        value={prescribeFreq}
                        onChange={(e) => setPrescribeFreq(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="field">
                      <label className="label">Đường dùng</label>
                      <select
                        className="input"
                        value={prescribeRoute}
                        onChange={(e) => setPrescribeRoute(e.target.value)}
                      >
                        <option value="uống">Uống (Oral)</option>
                        <option value="bôi ngoài da">Bôi ngoài da (Topical)</option>
                        <option value="nhỏ mắt/mũi">Nhỏ mắt / Mũi</option>
                        <option value="tiêm bắp">Tiêm bắp (IM)</option>
                        <option value="tiêm tĩnh mạch">Tiêm tĩnh mạch (IV)</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Thời điểm dùng</label>
                      <input
                        className="input"
                        placeholder="VD: Sau ăn 30 phút, trước ngủ..."
                        value={prescribeTiming}
                        onChange={(e) => setPrescribeTiming(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label className="label">Lời dặn của bác sĩ</label>
                    <input
                      className="input"
                      placeholder="VD: Uống nhiều nước, nếu nổi mẩn ngừng ngay..."
                      value={prescribeInstructions}
                      onChange={(e) => setPrescribeInstructions(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="btn btn-primary btn-sm" type="submit" disabled={prescribing}>
                      {prescribing ? "Đang kê đơn..." : "✓ Kê đơn & Gửi người bệnh"}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={() => setShowPrescribeModal(false)}
                    >
                      Hủy
                    </button>
                  </div>
                </form>
              </div>
            )}

            {meds.length === 0 && <EmptyState icon="💊" text="Chưa có thuốc nào trong danh mục." />}
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {meds.map((m) => (
                <div className="list-row" key={m.id} style={{ alignItems: "center", padding: "12px 16px" }}>
                  <div className="list-main">
                    <div className="list-title" style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>💊 {m.raw_name}</span>
                      <span className="badge badge-neutral" style={{ fontSize: 11, fontWeight: 600 }}>
                        {m.is_planned ? "Dự kiến (Thử nghiệm)" : "Đang điều trị"}
                      </span>
                    </div>
                    <div className="list-sub" style={{ marginTop: 2 }}>
                      {m.frequency ? `Liều & Tần suất: ${m.frequency}` : "Theo chỉ định của Bác sĩ"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <VerifiedBadge verification={m.verification} />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => verifyMed(m.id, m.verification !== "verified")}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {m.verification === "verified" ? "Bỏ xác minh" : "Xác minh"}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: "#e11d48", borderColor: "#fecdd3", backgroundColor: "#fff1f2", whiteSpace: "nowrap" }}
                      onClick={() => deleteMed(m.id, m.raw_name)}
                      title="Xóa thuốc"
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={addPlannedMed} className="mt16" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
              <div className="field">
                <label className="label" style={{ fontSize: 12.5, fontWeight: 600 }}>Thử nghiệm thuốc dự kiến (Simulate MedSafe)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    placeholder="VD: Amoxicillin 500mg (để thử tương tác trước khi kê)"
                    value={newDrug}
                    onChange={(e) => setNewDrug(e.target.value)}
                  />
                  <button className="btn btn-secondary btn-sm" style={{ whiteSpace: "nowrap" }}>
                    + Thêm thử nghiệm
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* DỊ ỨNG & TIỀN SỬ PHẢN VỆ */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-header-row" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>
                <span className="t-ico">🚫</span> Tiền sử Dị ứng & Phản vệ ({allergies.length})
              </div>
              <button
                className="btn btn-primary btn-sm"
                style={{ fontSize: 12.5 }}
                onClick={() => setShowAddAllergyModal(!showAddAllergyModal)}
              >
                {showAddAllergyModal ? "✕ Đóng form" : "+ ⚠️ Thêm tiền sử dị ứng"}
              </button>
            </div>

            {showAddAllergyModal && (
              <div
                style={{
                  backgroundColor: "#fff1f2",
                  border: "1px solid #fecdd3",
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "#9f1239", marginBottom: 6 }}>
                  ⚠️ Khai báo dị ứng thuốc / thức ăn / dị nguyên
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <span style={{ fontSize: 11.5, color: "#64748b", alignSelf: "center" }}>Gợi ý nhanh:</span>
                  {[
                    { name: "Penicillin (Kháng sinh)", r: "Nổi mề đay, mẩn ngứa" },
                    { name: "Aspirin / NSAIDs", r: "Khó thở dạng hen, phù mạch" },
                    { name: "Cephalosporin", r: "Phát ban đỏ toàn thân" },
                    { name: "Cản quang chứa Iod", r: "Sốc phản vệ, tụt huyết áp" },
                    { name: "Hải sản / Tôm cua", r: "Sưng môi, ngứa họng" },
                  ].map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11.5, padding: "3px 9px", backgroundColor: "#fff" }}
                      onClick={() => {
                        setAllergySubstance(item.name);
                        setAllergyReaction(item.r);
                      }}
                    >
                      + {item.name}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAddAllergy}>
                  <div className="field">
                    <label className="label">Tên tác nhân / dị nguyên (*)</label>
                    <input
                      className="input"
                      placeholder="VD: Penicillin, Ciprofloxacin, Tôm cua..."
                      value={allergySubstance}
                      onChange={(e) => setAllergySubstance(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="field">
                      <label className="label">Biểu hiện phản ứng</label>
                      <input
                        className="input"
                        placeholder="VD: Mề đay, khó thở, sốc phản vệ..."
                        value={allergyReaction}
                        onChange={(e) => setAllergyReaction(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="label">Mức độ nghiêm trọng</label>
                      <select
                        className="input"
                        value={allergySeverity}
                        onChange={(e) => setAllergySeverity(e.target.value)}
                      >
                        <option value="mild">Nhẹ (Mild - chỉ mẩn đỏ nhẹ)</option>
                        <option value="medium">Trung bình (Medium - mề đay diện rộng)</option>
                        <option value="severe">Nặng (Severe - phù mạch, co thắt phế quản)</option>
                        <option value="fatal">Nguy kịch (Fatal - sốc phản vệ)</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="btn btn-primary btn-sm" type="submit" disabled={addingAllergy} style={{ backgroundColor: "#e11d48", borderColor: "#be123c" }}>
                      {addingAllergy ? "Đang lưu..." : "✓ Lưu tiền sử dị ứng"}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={() => setShowAddAllergyModal(false)}
                    >
                      Hủy
                    </button>
                  </div>
                </form>
              </div>
            )}

            {allergies.length === 0 && (
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 12,
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>✅</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#334155" }}>
                      Chưa ghi nhận tiền sử dị ứng thuốc hay thực phẩm
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      Nếu người bệnh có tiền sử dị ứng, bác sĩ hãy bấm thêm mới để hệ thống kích hoạt cảnh báo tương tác tự động.
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAddAllergyModal(true)}
                  style={{ whiteSpace: "nowrap" }}
                >
                  + Khai báo dị ứng
                </button>
              </div>
            )}

            {allergies.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {allergies.map((a) => (
                  <div className="list-row" key={a.id} style={{ alignItems: "center", padding: "12px 16px" }}>
                    <div className="list-main">
                      <div className="list-title" style={{ color: "#9f1239", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>🚫 {a.substance}</span>
                        {a.severity && (
                          <span
                            className={
                              a.severity === "fatal" || a.severity === "severe"
                                ? "badge badge-danger"
                                : "badge badge-warning"
                            }
                            style={{ fontSize: 11 }}
                          >
                            {a.severity === "fatal" ? "Nguy kịch" : a.severity === "severe" ? "Nặng" : "Trung bình"}
                          </span>
                        )}
                      </div>
                      <div className="list-sub" style={{ marginTop: 2 }}>
                        {a.reaction ? `Biểu hiện: ${a.reaction}` : "Chưa ghi nhận biểu hiện chi tiết"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <VerifiedBadge verification={a.verification} />
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => verifyAllergy(a.id, a.verification !== "verified")}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {a.verification === "verified" ? "Bỏ xác minh" : "Xác minh"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ color: "#e11d48", borderColor: "#fecdd3", backgroundColor: "#fff1f2", whiteSpace: "nowrap" }}
                        onClick={() => deleteAllergy(a.id, a.substance)}
                        title="Xóa dị ứng"
                      >
                        🗑️ Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MEDSAFE: KIỂM TRA AN TOÀN THUỐC & ĐỐI SOÁT TƯƠNG TÁC ĐA CHẤT / TIỀN SỬ BỆNH */}
          <div className="card" style={{ border: "1.5px solid #0284c7", background: "linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)", borderRadius: 16 }}>
            <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 24 }}>🛡️</span>
                <div>
                  <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "#0369a1" }}>
                    Kiểm tra An toàn Thuốc & Đối soát Tương tác (MedSafe)
                  </span>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 400 }}>
                    Đối chiếu tương tác 2/3 loại chất với nhau và đối chiếu tiền sử dị ứng / bệnh nền của bệnh nhân
                  </div>
                </div>
              </div>
              <span className="badge badge-info" style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                Kho 633 tương tác Bộ Y tế
              </span>
            </div>

            {/* KHUNG NHẬP 2/3 LOẠI CHẤT/THUỐC ĐỂ TEST PHẢN ỨNG CÓ AUTOCOMPLETE & PHÍM TAB */}
            <div style={{ background: "#ffffff", padding: "16px 18px", borderRadius: 14, border: "1px solid #bae6fd", marginTop: 12, marginBottom: 14, boxShadow: "0 2px 8px rgba(2, 132, 199, 0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                <label htmlFor="medsafe-substances" style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                  🧪 Nhập 2, 3 hoặc nhiều loại chất/thuốc (ngăn cách bởi dấu phẩy):
                </label>
                <span style={{ fontSize: "0.78rem", color: "#0284c7", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <span>💡 Gõ tên thuốc rồi nhấn</span>
                  <kbd style={{ background: "#e0f2fe", border: "1px solid #7dd3fc", borderRadius: 4, padding: "1px 6px", fontSize: "0.75rem", fontWeight: 700, color: "#0369a1" }}>Tab ↹</kbd>
                  <span>để tự động điền nhanh theo Dược thư & AI</span>
                </span>
              </div>

              <div style={{ position: "relative", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    id="medsafe-substances"
                    type="text"
                    className="input"
                    style={{ flex: 1, minWidth: 260, fontSize: "0.92rem", padding: "10px 14px", borderColor: "#0284c7", borderRadius: 8 }}
                    placeholder="VD: Warfarin, Aspirin hoặc Cefaclor, Augmentin, Paracetamol..."
                    value={medsafeInput}
                    onChange={(e) => handleMedsafeChange(e.target.value)}
                    onKeyDown={handleMedsafeKeyDown}
                    onFocus={() => {
                      fetchDrugSuggestions(getCurrentQueryToken(medsafeInput));
                    }}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "10px 20px", fontWeight: 700, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}
                    onClick={() => {
                      setShowSuggestions(false);
                      void runInteractiveMedSafeCheck();
                    }}
                    disabled={medsafeChecking}
                  >
                    {medsafeChecking ? "⏳ Đang đối soát…" : "⚡ Kiểm tra Phản ứng & An toàn"}
                  </button>
                </div>

                {/* DANH SÁCH GỢI Ý THUỐC THÔNG MINH (DROPDOWN AUTOCOMPLETE) */}
                {showSuggestions && medsafeSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      background: "#ffffff",
                      border: "1.5px solid #38bdf8",
                      borderRadius: 12,
                      boxShadow: "0 12px 30px rgba(2, 132, 199, 0.18), 0 4px 12px rgba(0,0,0,0.08)",
                      zIndex: 100,
                      maxHeight: 330,
                      overflowY: "auto",
                      padding: "6px 0",
                    }}
                  >
                    <div
                      style={{
                        padding: "6px 14px 8px",
                        background: "#f0f9ff",
                        borderBottom: "1px solid #e0f2fe",
                        fontSize: "0.76rem",
                        color: "#0369a1",
                        fontWeight: 700,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>🤖 GỢI Ý DƯỢC THƯ BỘ Y TẾ & AI GEMINI ({medsafeSuggestions.length} kết quả)</span>
                      <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500 }}>
                        Dùng <kbd style={{ background: "#fff", padding: "1px 4px", borderRadius: 3, border: "1px solid #cbd5e1" }}>↑</kbd> <kbd style={{ background: "#fff", padding: "1px 4px", borderRadius: 3, border: "1px solid #cbd5e1" }}>↓</kbd> để di chuyển, <kbd style={{ background: "#0284c7", color: "#fff", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>Tab ↹</kbd> hoặc <kbd style={{ background: "#fff", padding: "1px 4px", borderRadius: 3, border: "1px solid #cbd5e1" }}>Enter</kbd> để chọn
                      </span>
                    </div>

                    {medsafeSuggestions.map((s, idx) => {
                      const isHighlighted = idx === activeSuggestionIdx;
                      return (
                        <div
                          key={`${s.name}-${idx}`}
                          style={{
                            padding: "9px 14px",
                            cursor: "pointer",
                            background: isHighlighted ? "#e0f2fe" : "transparent",
                            borderLeft: isHighlighted ? "4px solid #0284c7" : "4px solid transparent",
                            transition: "all 0.15s ease",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                          }}
                          onMouseEnter={() => setActiveSuggestionIdx(idx)}
                          onClick={() => handleSelectSuggestion(s)}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: s.is_allergy ? "#be123c" : "#0f172a" }}>
                                {s.is_allergy ? "🚫" : s.is_current ? "💊" : "🏷️"} {s.name}
                              </span>
                              {s.strength && (
                                <span style={{ fontSize: "0.75rem", color: "#64748b", background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>
                                  {s.strength}
                                </span>
                              )}
                              {s.is_allergy && (
                                <span className="badge badge-danger" style={{ fontSize: "0.7rem", fontWeight: 700, background: "#ffe4e6", color: "#be123c", border: "1px solid #fecdd3" }}>
                                  ⚠️ Tiền sử Dị ứng của BN
                                </span>
                              )}
                              {s.is_current && (
                                <span className="badge badge-info" style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                                  💊 Thuốc BN đang dùng
                                </span>
                              )}
                              {s.interactions_count > 0 && !s.is_allergy && (
                                <span className="badge badge-warning" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                                  ⚡ {s.interactions_count} tương tác BYT
                                </span>
                              )}
                              <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500 }}>
                                • {s.category}
                              </span>
                            </div>

                            {s.ai_hint && (
                              <div style={{ fontSize: "0.76rem", color: s.is_allergy ? "#e11d48" : "#0369a1", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                💡 <em>{s.ai_hint}</em>
                              </div>
                            )}
                          </div>

                          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                background: isHighlighted ? "#0284c7" : "#f1f5f9",
                                color: isHighlighted ? "#ffffff" : "#64748b",
                                border: isHighlighted ? "1px solid #0284c7" : "1px solid #cbd5e1",
                                borderRadius: 4,
                                padding: "2px 7px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              Tab ↹
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Các nút mẫu nhanh & nạp thuốc bệnh nhân */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: "0.8rem", marginTop: 10 }}>
                <span style={{ color: "#64748b", fontWeight: 600 }}>Thử nhanh mẫu:</span>
                {meds.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.78rem", padding: "3px 8px", borderColor: "#0284c7", color: "#0284c7" }}
                    onClick={() => {
                      const allM = meds.map((m) => m.raw_name).join(", ");
                      setMedsafeInput(allM);
                      void runInteractiveMedSafeCheck(meds.map((m) => m.raw_name));
                    }}
                  >
                    📥 Nạp toàn bộ thuốc BN đang dùng ({meds.length})
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.78rem", padding: "3px 8px" }}
                  onClick={() => {
                    setMedsafeInput("Warfarin, Aspirin");
                    void runInteractiveMedSafeCheck(["Warfarin", "Aspirin"]);
                  }}
                >
                  ⚡ Warfarin + Aspirin (Xuất huyết)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.78rem", padding: "3px 8px" }}
                  onClick={() => {
                    setMedsafeInput("Clarithromycin, Simvastatin");
                    void runInteractiveMedSafeCheck(["Clarithromycin", "Simvastatin"]);
                  }}
                >
                  ⚡ Clarithromycin + Simvastatin (Tiêu cơ vân)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.78rem", padding: "3px 8px" }}
                  onClick={() => {
                    setMedsafeInput("Panadol, Efferalgan");
                    void runInteractiveMedSafeCheck(["Panadol", "Efferalgan"]);
                  }}
                >
                  🔁 Panadol + Efferalgan (Trùng Paracetamol)
                </button>
                {allergies.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.78rem", padding: "3px 8px", borderColor: "#f43f5e", color: "#e11d48" }}
                    onClick={() => {
                      const algTest = allergies.map((a) => a.substance).join(", ");
                      setMedsafeInput(algTest);
                      void runInteractiveMedSafeCheck(allergies.map((a) => a.substance));
                    }}
                  >
                    🚫 Thử dị ứng: {allergies[0].substance}
                  </button>
                )}
              </div>
            </div>

            {/* KẾT QUẢ KIỂM TRA MEDSAFE TỔNG THỂ */}
            {(quickCheckResult || check) && (
              <div style={{ marginTop: 16 }}>
                {quickCheckResult && (
                  <div style={{ marginBottom: 14 }}>
                    {/* Header trạng thái */}
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: 12,
                        backgroundColor:
                          quickCheckResult.status === "has_alerts"
                            ? "var(--status-danger-bg)"
                            : quickCheckResult.status === "insufficient_data"
                            ? "var(--status-warning-bg)"
                            : "#f0fdf4",
                        border:
                          quickCheckResult.status === "has_alerts"
                            ? "1.5px solid var(--status-danger-border)"
                            : quickCheckResult.status === "insufficient_data"
                            ? "1.5px solid var(--status-warning-border)"
                            : "1.5px solid #bbf7d0",
                        marginBottom: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "0.95rem", color: quickCheckResult.status === "has_alerts" ? "#dc2626" : quickCheckResult.status === "insufficient_data" ? "#b45309" : "#16a34a" }}>
                          {quickCheckResult.status_label}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: 2 }}>
                          Các chất đã đối soát: <strong>{quickCheckResult.checked_drugs.join(" + ")}</strong>
                        </div>
                      </div>
                      <span className="badge" style={{ fontSize: "0.78rem", background: "#ffffff" }}>
                        {quickCheckResult.alerts.length} Cảnh báo phát hiện
                      </span>
                    </div>

                    {/* Danh sách các cảnh báo chi tiết theo loại */}
                    {quickCheckResult.alerts.length > 0 ? (
                      <div>
                        {quickCheckResult.alerts.map((al, idx) => (
                          <div
                            key={`${al.rule_code}_${idx}`}
                            style={{
                              padding: "14px 16px",
                              borderRadius: 12,
                              background: al.severity === "high" ? "#fff1f2" : "#fffbeb",
                              border: al.severity === "high" ? "1px solid #fecdd3" : "1px solid #fde68a",
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <strong style={{ color: al.severity === "high" ? "#e11d48" : "#d97706", fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}>
                                <span>{al.severity === "high" ? "🚨 CẢNH BÁO NGUY HIỂM" : "⚠️ CẢNH BÁO THẬN TRỌNG"}</span>
                                <span style={{ fontSize: "0.75rem", background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4 }}>
                                  {al.rule_type === "drug_drug" ? "Tương tác thuốc - thuốc" : al.rule_type === "drug_allergy" ? "Trùng tiền sử dị ứng" : al.rule_type === "drug_condition" ? "Chống chỉ định bệnh nền" : "Trùng lặp hoạt chất"}
                                </span>
                              </strong>
                              <span className={al.severity === "high" ? "badge badge-danger" : "badge badge-warning"}>
                                {al.rule_code}
                              </span>
                            </div>
                            <p style={{ margin: "0 0 6px", fontSize: "0.9rem", color: "#0f172a", lineHeight: 1.5 }}>
                              {al.message}
                            </p>
                            <div style={{ fontSize: "0.78rem", color: "#64748b", fontStyle: "italic" }}>
                              📚 Nguồn căn cứ: {al.source}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: "14px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, color: "#16a34a", fontSize: "0.88rem" }}>
                        ✓ Không phát hiện tương tác đối kháng hay cảnh báo nguy hiểm giữa các chất vừa nhập với tiền sử của bệnh nhân trong phạm vi quy tắc đã duyệt.
                      </div>
                    )}
                  </div>
                )}

                {/* Form ghi nhận quyết định của bác sĩ */}
                {(quickCheckResult?.alerts?.length ?? 0) > 0 && (
                  <div className="card" style={{ boxShadow: "none", border: "1px dashed var(--border-strong)", marginTop: 12 }}>
                    <div className="card-title">
                      <span className="t-ico">🖊</span> Ghi nhận quyết định lâm sàng của Bác sĩ
                    </div>
                    <div className="field">
                      <label htmlFor="rev-note" className="label">Lời dặn / Phương án xử lý (nếu có tương tác)</label>
                      <textarea
                        id="rev-note"
                        className="textarea"
                        rows={2}
                        placeholder="VD: Thay thế bằng thuốc khác, giảm liều, dặn người bệnh theo dõi triệu chứng xuất huyết/dị ứng..."
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-primary btn-sm" onClick={() => submitReview("action_taken")}>
                        ✓ Đã xử lý (Thay đổi đơn / Điều chỉnh)
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => submitReview("reviewed")}>
                        👁️ Đã xem xét & Theo dõi
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => submitReview("dismissed_with_reason")}>
                        🚫 Không áp dụng (Ghi lý do)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>


          <div className="card">
            <div className="card-title">
              <span className="t-ico">🩺</span> Triệu chứng / cập nhật bởi Người Bệnh
            </div>
            {obs.length === 0 && <EmptyState icon="🩺" text="Chưa có cập nhật nào." />}
            {obs.map((o) => (
              <div className="list-row" key={o.id} style={{ alignItems: "center" }}>
                {o.image_url ? (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      overflow: "hidden",
                      border: "1px solid #cbd5e1",
                      flexShrink: 0,
                      cursor: "pointer",
                      backgroundColor: "#f1f5f9",
                    }}
                    onClick={() => setPreviewModalUrl(o.image_url ?? null)}
                    title="Bác sĩ bấm để xem ảnh tổn thương da phóng to"
                  >
                    <img
                      src={o.image_url}
                      alt="Ảnh tổn thương"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ) : null}

                <div className="list-main">
                  <div className="list-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{o.label}</span>
                    {o.image_url && (
                      <button
                        type="button"
                        onClick={() => setPreviewModalUrl(o.image_url ?? null)}
                        className="badge badge-info"
                        style={{ border: "none", cursor: "pointer", fontSize: 11, padding: "2px 6px" }}
                      >
                        📷 Xem ảnh tổn thương
                      </button>
                    )}
                  </div>
                  <div className="list-sub">
                    {o.occurred_at}
                    {o.value ? ` · ${o.value} ${o.unit ?? ""}` : ""}
                  </div>
                </div>
                {o.status === "sent" ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => markSeen(o.id)}>
                    Đánh dấu đã xem
                  </button>
                ) : (
                  <span className="badge badge-ok">Đã xem</span>
                )}
              </div>
            ))}
          </div>

          {/* Shortcut to Dedicated AI Suspect Page */}
          <div
            className="card"
            style={{
              background: "linear-gradient(135deg, #f8fafc 0%, #f0f9ff 100%)",
              border: "1px solid #bae6fd",
              cursor: "pointer",
              transition: "all 0.2s ease",
              marginTop: 12,
            }}
            onClick={() => router.push(`/doctor/ai-suspect?profile=${selected.profile_id}`)}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: "#0284c7",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    boxShadow: "0 4px 10px rgba(2, 132, 199, 0.3)",
                  }}
                >
                  🔍
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
                    AI gợi ý tác nhân & Hướng dẫn dùng thuốc
                  </div>
                  <div style={{ fontSize: 12.5, color: "#64748b" }}>
                    Chuyển sang trang riêng để xếp hạng tác nhân nghi ngờ theo WHO và duyệt hướng dẫn dùng thuốc
                  </div>
                </div>
              </div>
              <span className="btn btn-primary btn-sm" style={{ fontSize: 12 }}>
                Mở trang AI gợi ý tác nhân →
              </span>
            </div>
          </div>

          {/* Floating AssistiveTouch AI Button */}
          <div
            style={{
              position: "fixed",
              bottom: 80,
              right: 24,
              zIndex: 999,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <button
              onClick={openAiAssistant}
              style={{
                width: 58,
                height: 58,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #0284c7 0%, #2563eb 50%, #4f46e5 100%)",
                color: "#ffffff",
                border: "3px solid #ffffff",
                boxShadow: "0 10px 25px -5px rgba(37, 99, 235, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.3)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                position: "relative",
              }}
              title="AI Tóm tắt diễn biến ca bệnh"
            >
              🤖
              {summaryLoading && (
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    backgroundColor: "#22c55e",
                    border: "2px solid #fff",
                  }}
                />
              )}
            </button>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#0369a1",
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                padding: "2px 8px",
                borderRadius: 10,
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                backdropFilter: "blur(4px)",
                whiteSpace: "nowrap",
              }}
            >
              AI Tóm tắt
            </span>
          </div>

          {/* AI Summary Popup Modal (Assistive Overlay) */}
          {showAiModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(15, 23, 42, 0.55)",
                backdropFilter: "blur(4px)",
                zIndex: 1050,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
              }}
              onClick={() => setShowAiModal(false)}
            >
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 20,
                  maxWidth: 680,
                  width: "100%",
                  maxHeight: "88vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        backgroundColor: "#0284c7",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        boxShadow: "0 4px 10px rgba(2, 132, 199, 0.3)",
                      }}
                    >
                      🤖
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>
                        AI Tóm tắt diễn biến ca bệnh
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        Bệnh nhân: <strong>{selected.full_name}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={loadAiSummary}
                      disabled={summaryLoading}
                      style={{ fontSize: 12 }}
                    >
                      🔄 {summaryLoading ? "Đang tổng hợp…" : "Làm mới"}
                    </button>
                    <button
                      onClick={() => setShowAiModal(false)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        border: "none",
                        backgroundColor: "rgba(0, 0, 0, 0.06)",
                        cursor: "pointer",
                        fontSize: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#475569",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Modal Content */}
                <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
                  {summaryLoading && !aiSummary && (
                    <div style={{ textAlign: "center", padding: "40px 0" }}>
                      <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
                      <div style={{ fontWeight: 600, color: "#0284c7", fontSize: 15 }}>
                        AI đang tổng hợp dữ liệu lâm sàng & diễn biến…
                      </div>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                        Đang phân tích triệu chứng, nguồn thuốc và tiền sử dị ứng
                      </div>
                    </div>
                  )}

                  {aiSummary && (
                    <div>
                      <div
                        style={{
                          backgroundColor: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          padding: 14,
                          marginBottom: 14,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#0369a1", marginBottom: 6 }}>
                          📝 Tóm tắt nhanh:
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.6, color: "#1e293b" }}>
                          {aiSummary.summary}
                        </div>
                      </div>

                      {aiSummary.highlights.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#475569", marginBottom: 6 }}>
                            🚨 Điểm lưu ý & Cảnh báo:
                          </div>
                          {aiSummary.highlights.map((h, i) => (
                            <div
                              key={i}
                              className={
                                h.startsWith("🚨") || h.startsWith("⚠")
                                  ? "alertbox alertbox-danger"
                                  : h.startsWith("?")
                                  ? "alertbox alertbox-warning"
                                  : "alertbox alertbox-neutral"
                              }
                              style={{ marginTop: 6, fontSize: 13, padding: "8px 12px" }}
                            >
                              {h}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid-2" style={{ gap: 12, marginBottom: 14 }}>
                        {aiSummary.medications_by_source.length > 0 && (
                          <div
                            style={{
                              backgroundColor: "#f0fdf4",
                              border: "1px solid #bbf7d0",
                              borderRadius: 10,
                              padding: 12,
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#166534", marginBottom: 6 }}>
                              💊 Thuốc theo nguồn
                            </div>
                            {aiSummary.medications_by_source.map((l, i) => (
                              <div key={i} style={{ fontSize: 12.5, color: "#14532d", marginBottom: 4 }}>
                                • {l}
                              </div>
                            ))}
                          </div>
                        )}

                        {aiSummary.symptoms.length > 0 && (
                          <div
                            style={{
                              backgroundColor: "#f0f9ff",
                              border: "1px solid #bae6fd",
                              borderRadius: 10,
                              padding: 12,
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#0369a1", marginBottom: 6 }}>
                              🩺 Triệu chứng gần đây
                            </div>
                            {aiSummary.symptoms.slice(0, 5).map((l, i) => (
                              <div key={i} style={{ fontSize: 12.5, color: "#0c4a6e", marginBottom: 4 }}>
                                • {l}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {aiSummary.triage_recent.length > 0 && (
                        <div
                          style={{
                            backgroundColor: "#faf5ff",
                            border: "1px solid #e9d5ff",
                            borderRadius: 10,
                            padding: 12,
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#6b21a8", marginBottom: 4 }}>
                            ⚖️ Phân luồng gần nhất:
                          </div>
                          {aiSummary.triage_recent.map((l, i) => (
                            <div key={i} style={{ fontSize: 12.5, color: "#581c87" }}>
                              • {l}
                            </div>
                          ))}
                        </div>
                      )}

                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          borderTop: "1px solid #f1f5f9",
                          paddingTop: 10,
                          marginTop: 10,
                          fontStyle: "italic",
                        }}
                      >
                        ℹ️ {aiSummary.disclaimer}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div
                  style={{
                    padding: "12px 20px",
                    borderTop: "1px solid #e2e8f0",
                    display: "flex",
                    justifyContent: "flex-end",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAiModal(false)}>
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* POPUP MODAL PHÓNG TO ẢNH TỔN THƯƠNG CHO BÁC SĨ */}
          {previewModalUrl && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                backgroundColor: "rgba(15, 23, 42, 0.82)",
                backdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
              }}
              onClick={() => setPreviewModalUrl(null)}
            >
              <div
                style={{
                  position: "relative",
                  maxWidth: "90vw",
                  maxHeight: "90vh",
                  backgroundColor: "#fff",
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)",
                  display: "flex",
                  flexDirection: "column",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 18px",
                    borderBottom: "1px solid #e2e8f0",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                    📷 Ảnh chụp tổn thương da của người bệnh
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: "3px 10px", fontSize: 13 }}
                    onClick={() => setPreviewModalUrl(null)}
                  >
                    ✕ Đóng
                  </button>
                </div>
                <div style={{ padding: 12, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  <img
                    src={previewModalUrl}
                    alt="Ảnh tổn thương phóng to"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "75vh",
                      objectFit: "contain",
                      borderRadius: 8,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* THANH GHI CHÚ BÁC SĨ CỐ ĐỊNH BÊN PHẢI MÀN HÌNH (RIÊNG TỪNG LOẠI BỆNH) */}
        <aside className="doctor-patient-note-sidebar">
          <DoctorPatientSideNotePanel
            profileId={selected.profile_id}
            patientName={selected.full_name}
          />
        </aside>
      </div>
    )}
    </AppShell>
  );
}
