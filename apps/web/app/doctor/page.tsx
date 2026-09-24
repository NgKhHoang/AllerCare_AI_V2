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
      {!selected && success && <SuccessBox text={success} />}

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

          <div className="grid-2">
            <div className="card">
              <div className="card-title">
                <span className="t-ico">💊</span> Thuốc
              </div>
              {meds.length === 0 && <EmptyState icon="💊" text="Chưa có thuốc." />}
              {meds.map((m) => (
                <div className="list-row" key={m.id}>
                  <div className="list-main">
                    <div className="list-title">{m.raw_name}</div>
                    <div className="list-sub">
                      {m.is_planned ? "Dự kiến" : "Đang dùng"}
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
                  </div>
                </div>
              ))}
              <form onSubmit={addPlannedMed} className="mt16">
                <div className="field">
                  <label className="label">Thêm thuốc dự kiến</label>
                  <input
                    className="input"
                    placeholder="VD: Amoxicillin 500mg"
                    value={newDrug}
                    onChange={(e) => setNewDrug(e.target.value)}
                  />
                </div>
                <button className="btn btn-secondary btn-sm">+ Thêm</button>
              </form>
            </div>

            <div className="card">
              <div className="card-title">
                <span className="t-ico">🚫</span> Dị ứng
              </div>
              {allergies.length === 0 && (
                <EmptyState icon="✅" text="Không có tiền sử dị ứng đã ghi nhận." />
              )}
              {allergies.map((a) => (
                <div className="list-row" key={a.id}>
                  <div className="list-main">
                    <div className="list-title">{a.substance}</div>
                    <div className="list-sub">{a.reaction ?? "—"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <VerifiedBadge verification={a.verification} />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => verifyAllergy(a.id, a.verification !== "verified")}
                    >
                      {a.verification === "verified" ? "Bỏ" : "Xác minh"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span className="t-ico">🩺</span> Triệu chứng / cập nhật
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
              <span className="t-ico">🤖</span> AI tóm tắt diễn biến
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>
              AI tổng hợp triệu chứng, thuốc theo nguồn, dị ứng và phân luồng gần nhất — chỉ để nắm
              nhanh, không chẩn đoán.
            </p>
            <button className="btn btn-secondary" onClick={loadAiSummary} disabled={summaryLoading}>
              {summaryLoading ? "Đang tổng hợp…" : "🤖 Tạo tóm tắt diễn biến"}
            </button>
            {aiSummary && (
              <div className="mt16">
                <div className="alertbox alertbox-neutral">
                  <div className="alertbox-title">Tóm tắt</div>
                  <div style={{ fontSize: 14 }}>{aiSummary.summary}</div>
                </div>
                {aiSummary.highlights.map((h, i) => (
                  <div
                    key={i}
                    className={h.startsWith("🚨") || h.startsWith("⚠") ? "alertbox alertbox-danger" : h.startsWith("?") ? "alertbox alertbox-warning" : "alertbox alertbox-neutral"}
                    style={{ marginTop: 8, fontSize: 14 }}
                  >
                    {h}
                  </div>
                ))}
                <div className="grid-2" style={{ marginTop: 10 }}>
                  {aiSummary.medications_by_source.length > 0 && (
                    <div className="card" style={{ boxShadow: "none" }}>
                      <div className="card-title"><span className="t-ico">💊</span> Thuốc theo nguồn</div>
                      {aiSummary.medications_by_source.map((l, i) => (
                        <div key={i} style={{ fontSize: 13, marginBottom: 6 }}>{l}</div>
                      ))}
                    </div>
                  )}
                  {aiSummary.symptoms.length > 0 && (
                    <div className="card" style={{ boxShadow: "none" }}>
                      <div className="card-title"><span className="t-ico">🩺</span> Triệu chứng gần đây</div>
                      {aiSummary.symptoms.slice(0, 5).map((l, i) => (
                        <div key={i} style={{ fontSize: 13, marginBottom: 6 }}>{l}</div>
                      ))}
                    </div>
                  )}
                </div>
                {aiSummary.triage_recent.length > 0 && (
                  <div style={{ fontSize: 13, marginTop: 6 }}>
                    <strong>Phân luồng gần nhất:</strong>
                    {aiSummary.triage_recent.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>
                )}
                <div className="source" style={{ marginTop: 8 }}>{aiSummary.disclaimer}</div>
              </div>
            )}
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
        </>
      )}
    </AppShell>
  );
}
