"use client";

import { useCallback, useEffect, useState } from "react";
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

  // Kê đơn thuốc mới
  const [prescribeName, setPrescribeName] = useState("");
  const [prescribeDose, setPrescribeDose] = useState("1 viên/lần");
  const [prescribeFreq, setPrescribeFreq] = useState("1 lần/ngày");
  const [prescribeRoute, setPrescribeRoute] = useState("uống");
  const [prescribeTiming, setPrescribeTiming] = useState("Sau ăn 30 phút");
  const [prescribeInstructions, setPrescribeInstructions] = useState("");
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
        },
      });
      setSuccess(`Đã kê đơn thành công thuốc "${prescribeName.trim()}" cho ${selected.full_name}. Người bệnh đã nhận được thông báo!`);
      setPrescribeName("");
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

  async function runSafetyCheck() {
    if (!selected) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await api<CheckResult>("/v1/safety-checks", {
        method: "POST",
        body: { profile_id: selected.profile_id },
      });
      setCheck(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kiểm tra thất bại");
    } finally {
      setLoading(false);
    }
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

      {!selected && appointments.filter((a) => a.status === "requested").length > 0 && (
        <div className="card">
          <div className="card-title">
            <span className="t-ico">📅</span> Lịch hẹn chờ xác nhận
          </div>
          {appointments
            .filter((a) => a.status === "requested")
            .map((a) => (
              <div className="list-row" key={a.id}>
                <div className="list-main">
                  <div className="list-title">{a.scheduled_at}</div>
                  <div className="list-sub">{a.reason ?? "Tái khám định kỳ"}</div>
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

      {!selected && appointments.filter((a) => a.status === "confirmed").length > 0 && (
        <div className="card">
          <div className="card-title">
            <span className="t-ico">🎥</span> Lịch hẹn đã xác nhận — vào phòng video
          </div>
          {appointments
            .filter((a) => a.status === "confirmed")
            .map((a) => (
              <div className="list-row" key={a.id}>
                <div className="list-main">
                  <div className="list-title">{a.scheduled_at}</div>
                  <div className="list-sub">{a.reason ?? "Tái khám định kỳ"}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => router.push(`/video/${a.id}`)}>
                  🎥 Vào phòng
                </button>
              </div>
            ))}
        </div>
      )}

      {!selected && (
        <div className="card">
          {patients.length === 0 && <EmptyState icon="👥" text="Chưa có ca nào được phân công." />}
          {patients.map((p) => (
            <div
              className="list-row"
              key={p.profile_id}
              style={{ cursor: "pointer" }}
              onClick={() => openPatient(p)}
            >
              <div className="list-main">
                <div className="list-title">{p.full_name}</div>
                <div className="list-sub">
                  {p.gender ?? "—"} · {p.dob ?? "—"}
                </div>
              </div>
              {p.unseen_updates > 0 && (
                <span className="badge badge-info">{p.unseen_updates} cập nhật mới</span>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="s-num">{meds.length}</div>
              <div className="s-label">Thuốc</div>
            </div>
            <div className="stat">
              <div className="s-num">{allergies.length}</div>
              <div className="s-label">Dị ứng</div>
            </div>
            <div className="stat">
              <div className="s-num">{obs.filter((o) => o.status === "sent").length}</div>
              <div className="s-label">Chưa xem</div>
            </div>
          </div>

          {/* CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ & LOẠI BỆNH (BÁC SĨ) */}
          <TreatmentTimeline
            profileId={selected.profile_id}
            isDoctor={true}
            onRefresh={() => openPatient(selected)}
          />

          <div className="grid-2">
            <div className="card">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span><span className="t-ico">💊</span> Danh sách thuốc</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowPrescribeModal(!showPrescribeModal)}
                >
                  {showPrescribeModal ? "✕ Đóng" : "+ 🩺 Kê đơn thuốc mới"}
                </button>
              </div>

              {/* Form Kê đơn thuốc mới của Bác sĩ */}
              {showPrescribeModal && (
                <div style={{ background: "rgba(14, 165, 233, 0.08)", border: "1px solid rgba(14, 165, 233, 0.3)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: "var(--primary)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>🩺 Kê đơn thuốc chính thức (Ký bởi Bác sĩ)</span>
                  </div>

                  {/* Thuốc mẫu nhanh */}
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 6 }}>Gợi ý nhanh:</span>
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
                        style={{ fontSize: 11, padding: "2px 8px", marginRight: 4, marginBottom: 4 }}
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
                    <div className="field">
                      <label className="label">Tên thuốc & hàm lượng (*)</label>
                      <input
                        className="input"
                        placeholder="VD: Fexofenadine 180mg, Medrol 16mg..."
                        value={prescribeName}
                        onChange={(e) => setPrescribeName(e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
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

              {meds.length === 0 && <EmptyState icon="💊" text="Chưa có thuốc." />}
              {meds.map((m) => (
                <div className="list-row" key={m.id}>
                  <div className="list-main">
                    <div className="list-title">{m.raw_name}</div>
                    <div className="list-sub">
                      {m.is_planned ? "Dự kiến (Thử nghiệm)" : "Đang điều trị chính thức"}
                      {m.frequency ? ` · ${m.frequency}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <VerifiedBadge verification={m.verification} />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => verifyMed(m.id, m.verification !== "verified")}
                    >
                      {m.verification === "verified" ? "Bỏ xác minh" : "Xác minh"}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: "#e11d48", borderColor: "#fecdd3", backgroundColor: "#fff1f2" }}
                      onClick={() => deleteMed(m.id, m.raw_name)}
                      title="Xóa thuốc"
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              ))}
              <form onSubmit={addPlannedMed} className="mt16">
                <div className="field">
                  <label className="label">Thử nghiệm thuốc dự kiến (Simulate MedSafe)</label>
                  <input
                    className="input"
                    placeholder="VD: Amoxicillin 500mg (để thử tương tác trước khi kê)"
                    value={newDrug}
                    onChange={(e) => setNewDrug(e.target.value)}
                  />
                </div>
                <button className="btn btn-secondary btn-sm">+ Thêm vào danh sách thử nghiệm</button>
              </form>
            </div>

            <div className="card">
              <div className="card-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div className="card-title" style={{ margin: 0 }}>
                  <span className="t-ico">🚫</span> Dị ứng & Tiền sử phản vệ
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={() => setShowAddAllergyModal(!showAddAllergyModal)}
                >
                  {showAddAllergyModal ? "Đóng form" : "+ ⚠️ Thêm tiền sử dị ứng"}
                </button>
              </div>

              {showAddAllergyModal && (
                <div
                  style={{
                    backgroundColor: "#fff1f2",
                    border: "1px solid #fecdd3",
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#9f1239", marginBottom: 6 }}>
                    ⚠️ Khai báo dị ứng thuốc / thức ăn / dị nguyên
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center" }}>Gợi ý nhanh:</span>
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
                        style={{ fontSize: 11, padding: "2px 8px", backgroundColor: "#fff" }}
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
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
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
                <EmptyState icon="✅" text="Không có tiền sử dị ứng đã ghi nhận." />
              )}
              {allergies.map((a) => (
                <div className="list-row" key={a.id}>
                  <div className="list-main">
                    <div className="list-title" style={{ color: "#9f1239", fontWeight: 600 }}>{a.substance}</div>
                    <div className="list-sub">
                      {a.reaction ?? "—"}
                      {a.severity ? ` · Mức độ: ${a.severity}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <VerifiedBadge verification={a.verification} />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => verifyAllergy(a.id, a.verification !== "verified")}
                    >
                      {a.verification === "verified" ? "Bỏ" : "Xác minh"}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: "#e11d48", borderColor: "#fecdd3", backgroundColor: "#fff1f2" }}
                      onClick={() => deleteAllergy(a.id, a.substance)}
                      title="Xóa dị ứng"
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span className="t-ico">🛡</span> Kiểm tra an toàn thuốc (MedSafe)
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>
              Đối chiếu toàn bộ thuốc với quy tắc được duyệt. Kết quả không thay thế quyết định
              chuyên môn của bạn.
            </p>
            <button className="btn btn-primary" onClick={runSafetyCheck} disabled={loading}>
              {loading ? "Đang kiểm tra…" : "Chạy kiểm tra an toàn"}
            </button>
            <div className="mt16">
              {check && (
                <>
                  <ResultBox result={check.result} />
                  {check.result_status === "has_alerts" && (
                    <div className="card" style={{ boxShadow: "none", border: "1px dashed var(--border-strong)" }}>
                      <div className="card-title">
                        <span className="t-ico">🖊</span> Ghi nhận quyết định của bác sĩ
                      </div>
                      <div className="field">
                        <label className="label">Ghi chú (không bắt buộc)</label>
                        <textarea
                          className="textarea"
                          rows={2}
                          placeholder="VD: Ngừng Aspirin, chuyển sang thuốc khác, theo dõi INR…"
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn btn-primary btn-sm" onClick={() => submitReview("action_taken")}>
                          Đã xử lý
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => submitReview("reviewed")}>
                          Đã xem xét
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => submitReview("dismissed_with_reason")}>
                          Không áp dụng (ghi lý do)
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span className="t-ico">🩺</span> Triệu chứng / cập nhật bởi Người Bệnh
            </div>
            {obs.length === 0 && <EmptyState icon="🩺" text="Chưa có cập nhật nào." />}
            {obs.map((o) => (
              <div className="list-row" key={o.id}>
                <div className="list-main">
                  <div className="list-title">{o.label}</div>
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

          <div className="card">
            <div className="card-title">
              <span className="t-ico">🔍</span> Xếp hạng tác nhân nghi ngờ (MedSafe AI)
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>
              Nhập mô tả phản ứng + thuốc của lần phản ứng trước (toa cũ). AI xếp hạng theo
              nguyên tắc WHO — bạn phải xác nhận trước khi ghi hồ sơ dị ứng.
            </p>
            <div className="field">
              <label className="label">Mô tả phản ứng + thời điểm khởi phát</label>
              <textarea
                className="textarea"
                rows={2}
                placeholder="VD: Mẩn đỏ toàn thân + khó thở 15 phút sau uống Cefaclor; tái diễn lần 2"
                value={reaction}
                onChange={(e) => setReaction(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Thuốc lần phản ứng trước (toa cũ), cách nhau bằng dấu phẩy</label>
              <input
                className="input"
                placeholder="VD: Cefaclor 500mg, Kapredin, Paracetamol"
                value={prevDrugs}
                onChange={(e) => setPrevDrugs(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={runSuspectRanking}
              disabled={loading || !reaction.trim()}
            >
              {loading ? "Đang xếp hạng…" : "🔍 Xếp hạng tác nhân nghi ngờ"}
            </button>
            {suspect && (
              <div className="mt16">
                <div className="alertbox alertbox-warning">
                  <div className="alertbox-title">Kết quả xếp hạng (AI gợi ý — chưa kết luận)</div>
                  <div style={{ fontSize: 14 }}>{suspect.summary}</div>
                </div>
                {suspect.ranking.map((s) => (
                  <div className="list-row" key={s.rank}>
                    <div className="list-main">
                      <div className="list-title">
                        #{s.rank} {s.drug} {" "}
                        <span className={
                          s.level === "high" ? "badge badge-danger" : s.level === "possible" ? "badge badge-warning" : "badge badge-neutral"
                        }>
                          {s.level === "high" ? "Nghi ngờ cao" : s.level === "possible" ? "Có thể" : "Thấp"}
                        </span>
                      </div>
                      <div className="list-sub">{s.reasons.join(" · ")}</div>
                    </div>
                    <span className="badge badge-info">{s.score} điểm</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn btn-primary btn-sm" onClick={confirmSuspect}>
                    ✓ Xác nhận nghi ngờ #{1} → ghi hồ sơ dị ứng
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSuspect(null)}>
                    Đóng
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              <span className="t-ico">📖</span> Hướng dẫn dùng thuốc (AI soạn → bạn duyệt)
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>
              Chọn một thuốc trong toa để AI soạn hướng dẫn dễ hiểu. Bạn duyệt trước khi gửi người
              bệnh — AI không được thay đổi liều hay thêm/bỏ thuốc.
            </p>
            {meds.length === 0 && <EmptyState icon="💊" text="Chưa có thuốc để soạn hướng dẫn." />}
            {meds.map((m) => {
              const g = guides.find((x) => x.medication_id === m.id);
              return (
                <div className="list-row" key={m.id}>
                  <div className="list-main">
                    <div className="list-title">{m.raw_name}</div>
                    {g && (
                      <div className="list-sub">
                        Hướng dẫn: {g.status === "approved" ? "✓ Đã duyệt" : "Bản nháp"}
                        {g.acknowledgment === "understood"
                          ? " · Người bệnh ĐÃ HIỂU"
                          : g.acknowledgment === "not_understood"
                          ? " · Người bệnh CHƯA hiểu — cần liên hệ"
                          : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {!g && (
                      <button className="btn btn-secondary btn-sm" onClick={() => draftGuide(m.id)}>
                        🤖 Soạn nháp
                      </button>
                    )}
                    {g && g.status === "draft" && (
                      <button className="btn btn-primary btn-sm" onClick={() => approveGuide(g.id)}>
                        ✓ Duyệt & gửi
                      </button>
                    )}
                    {g && g.status === "approved" && <span className="badge badge-ok">Đã gửi</span>}
                  </div>
                </div>
              );
            })}
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
        </>
      )}
    </AppShell>
  );
}
