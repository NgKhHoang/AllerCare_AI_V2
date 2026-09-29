"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, getToken, getUser } from "../../../lib/api";
import { AppShell, EmptyState, ErrorBox, SuccessBox } from "../../../components/ui";

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

interface SuspectItem {
  rank: number;
  drug: string;
  score: number;
  level: string;
  reasons: string[];
}

interface SuspectRankingResult {
  id: string;
  patient_profile_id: string;
  ranking: SuspectItem[];
  summary: string;
  confirmed_drug: string | null;
}

interface Guide {
  id: string;
  patient_profile_id: string;
  medication_id: string;
  guide_content: string;
  status: string;
  acknowledgment: string | null;
}

function AiSuspectContent() {
  const searchParams = useSearchParams();
  const initialProfileId = searchParams.get("profile");

  const [patients, setPatients] = useState<AssignedPatient[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialProfileId || "");
  const [selectedPatient, setSelectedPatient] = useState<AssignedPatient | null>(null);

  const [meds, setMeds] = useState<Medication[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);

  // Suspect Ranking
  const [reaction, setReaction] = useState("");
  const [prevDrugs, setPrevDrugs] = useState("");
  const [suspect, setSuspect] = useState<SuspectRankingResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user || (user.role !== "doctor" && user.role !== "pharmacist")) {
      window.location.href = "/login";
      return;
    }
    api<AssignedPatient[]>("/v1/patients/assigned")
      .then((data) => {
        setPatients(data);
        if (data.length > 0) {
          const match = initialProfileId ? data.find((p) => p.profile_id === initialProfileId) : data[0];
          const active = match || data[0];
          setSelectedId(active.profile_id);
          setSelectedPatient(active);
        }
      })
      .catch((e) => setError(e.message));
  }, [initialProfileId]);

  const loadPatientData = useCallback(async (profileId: string) => {
    setError("");
    setSuccess("");
    try {
      const [m, g] = await Promise.all([
        api<Medication[]>(`/v1/patients/${profileId}/medications`),
        api<Guide[]>(`/v1/guides/profile/${profileId}`),
      ]);
      setMeds(m);
      setGuides(g);
      setSuspect(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu người bệnh");
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      const p = patients.find((x) => x.profile_id === selectedId) || null;
      setSelectedPatient(p);
      loadPatientData(selectedId);
    }
  }, [selectedId, patients, loadPatientData]);

  async function runSuspectRanking() {
    if (!selectedId || !reaction.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const r = await api<SuspectRankingResult>("/v1/triage/suspect-ranking", {
        method: "POST",
        body: {
          profile_id: selectedId,
          reaction_description: reaction.trim(),
          previous_episode_drugs: prevDrugs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      setSuspect(r);
      setSuccess("AI đã hoàn thành xếp hạng tác nhân nghi ngờ theo nguyên tắc WHO.");
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
      setSuccess("✓ Đã xác nhận tác nhân nghi ngờ → tự động ghi vào hồ sơ dị ứng của người bệnh.");
      setSuspect(null);
      if (selectedId) await loadPatientData(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác nhận được");
    }
  }

  async function draftGuide(medId: string) {
    setError("");
    setSuccess("");
    try {
      const g = await api<Guide>(`/v1/guides/draft/${medId}`, { method: "POST" });
      setGuides((prev) => [g, ...prev.filter((x) => x.id !== g.id)]);
      setSuccess("✓ AI đã soạn bản nháp hướng dẫn — hãy xem và bấm duyệt để gửi người bệnh.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không soạn được hướng dẫn");
    }
  }

  async function approveGuide(guideId: string) {
    setError("");
    setSuccess("");
    try {
      const g = await api<Guide>(`/v1/guides/${guideId}/approve`, { method: "POST" });
      setGuides((prev) => [g, ...prev.filter((x) => x.id !== g.id)]);
      setSuccess("✓ Đã duyệt và gửi hướng dẫn dùng thuốc an toàn đến ứng dụng của người bệnh!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không duyệt được hướng dẫn");
    }
  }

  return (
    <AppShell
      role="doctor"
      icon="🔍"
      title="AI gợi ý tác nhân"
      subtitle="Xếp hạng tác nhân dị ứng nghi ngờ theo chuẩn WHO và Soạn thảo hướng dẫn dùng thuốc cá nhân hóa"
    >
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {/* Patient Selector */}
      <div className="card" style={{ marginBottom: 18, background: "linear-gradient(135deg, #f8fafc 0%, #f0f9ff 100%)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
              👤 Chọn người bệnh cần phân tích
            </div>
            <div style={{ fontSize: 12.5, color: "#64748b" }}>
              Áp dụng AI phân tích tác nhân dị ứng và soạn hướng dẫn cho ca bệnh đang chọn
            </div>
          </div>
          <div style={{ minWidth: 260 }}>
            <select
              className="input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{ fontWeight: 600, backgroundColor: "#fff" }}
            >
              {patients.map((p) => (
                <option key={p.profile_id} value={p.profile_id}>
                  {p.full_name} ({p.gender ?? "—"}, {p.dob ?? "—"})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedPatient && <EmptyState icon="👥" text="Chưa chọn ca bệnh nào." />}

      {selectedPatient && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Card 1: Xếp hạng tác nhân nghi ngờ */}
          <div className="card">
            <div className="card-title">
              <span className="t-ico">🔍</span> Xếp hạng tác nhân nghi ngờ (MedSafe AI)
            </div>
            <p className="muted" style={{ marginBottom: 14 }}>
              Nhập mô tả phản ứng lâm sàng + danh sách thuốc trong lần phản ứng trước (toa cũ).
              AI sẽ phân tích theo thang điểm và nguyên tắc WHO để gợi ý các hoạt chất có nguy cơ cao nhất.
            </p>

            {/* Quick Templates */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center" }}>Mẫu phản ứng thường gặp:</span>
              {[
                { r: "Mẩn đỏ toàn thân + ngứa nhiều 30 phút sau uống thuốc; tái diễn lần 2", d: "Amoxicillin 500mg, Paracetamol" },
                { r: "Khó thở dạng hen, thở rít 1 giờ sau uống thuốc giảm đau", d: "Aspirin 81mg, Ibuprofen 400mg" },
                { r: "Phù môi, sưng mí mắt, mề đay sau khi tiêm thuốc", d: "Cefaclor, Cefuroxime" },
              ].map((tmpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 11, padding: "2px 8px", backgroundColor: "#f8fafc" }}
                  onClick={() => {
                    setReaction(tmpl.r);
                    setPrevDrugs(tmpl.d);
                  }}
                >
                  + Mẫu {idx + 1}
                </button>
              ))}
            </div>

            <div className="field">
              <label className="label">Mô tả phản ứng + thời điểm khởi phát (*)</label>
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
              <div className="mt16" style={{ animation: "fadeIn 0.2s ease-out" }}>
                <div className="alertbox alertbox-warning">
                  <div className="alertbox-title">Kết quả xếp hạng (AI gợi ý — bác sĩ kiểm tra & xác nhận)</div>
                  <div style={{ fontSize: 14 }}>{suspect.summary}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  {suspect.ranking.map((s) => (
                    <div className="list-row" key={s.rank}>
                      <div className="list-main">
                        <div className="list-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span>#{s.rank} <strong>{s.drug}</strong></span>
                          <span
                            className={
                              s.level === "high"
                                ? "badge badge-danger"
                                : s.level === "possible"
                                ? "badge badge-warning"
                                : "badge badge-neutral"
                            }
                          >
                            {s.level === "high" ? "🚨 Nghi ngờ cao" : s.level === "possible" ? "⚠️ Có thể" : "Thấp"}
                          </span>
                        </div>
                        <div className="list-sub">{s.reasons.join(" · ")}</div>
                      </div>
                      <span className="badge badge-info" style={{ fontWeight: 700 }}>
                        {s.score} điểm WHO
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={confirmSuspect}>
                    ✓ Xác nhận nghi ngờ #{1} → Tự ghi hồ sơ dị ứng
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSuspect(null)}>
                    Đóng kết quả
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Hướng dẫn dùng thuốc */}
          <div className="card">
            <div className="card-title">
              <span className="t-ico">📖</span> Hướng dẫn dùng thuốc (AI soạn → Bác sĩ duyệt)
            </div>
            <p className="muted" style={{ marginBottom: 14 }}>
              Chọn một thuốc trong toa của bệnh nhân để AI soạn hướng dẫn sử dụng dễ hiểu, chi tiết về cách uống,
              dấu hiệu dị ứng cần ngưng và kiêng khem. Bác sĩ duyệt trước khi chuyển đến người bệnh.
            </p>
            {meds.length === 0 && <EmptyState icon="💊" text="Chưa có thuốc trong hồ sơ bệnh nhân này." />}
            {meds.map((m) => {
              const g = guides.find((x) => x.medication_id === m.id);
              return (
                <div className="list-row" key={m.id} style={{ alignItems: "flex-start", padding: "14px 16px" }}>
                  <div className="list-main">
                    <div className="list-title" style={{ fontSize: 15, fontWeight: 700 }}>
                      💊 {m.raw_name}
                    </div>
                    <div className="list-sub" style={{ marginTop: 2 }}>
                      {m.is_planned ? "Dự kiến (Thử nghiệm)" : "Đang điều trị chính thức"}
                      {m.frequency ? ` · ${m.frequency}` : ""}
                    </div>
                    {g && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: "10px 14px",
                          backgroundColor: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          fontSize: 13,
                          lineHeight: 1.6,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: "#0369a1", marginBottom: 4 }}>
                          Nội dung hướng dẫn ({g.status === "approved" ? "✓ Đã duyệt" : "📝 Bản nháp AI"}):
                        </div>
                        <div style={{ whiteSpace: "pre-line", color: "#334155" }}>{g.guide_content}</div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                          Trạng thái phản hồi:{" "}
                          {g.acknowledgment === "understood" ? (
                            <strong style={{ color: "#16a34a" }}>✓ Người bệnh ĐÃ HIỂU</strong>
                          ) : g.acknowledgment === "not_understood" ? (
                            <strong style={{ color: "#dc2626" }}>⚠️ Người bệnh CHƯA hiểu — cần liên hệ</strong>
                          ) : (
                            <span style={{ fontStyle: "italic" }}>Chờ người bệnh xác nhận</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
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
                    {g && g.status === "approved" && <span className="badge badge-ok">✓ Đã gửi</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function AiSuspectPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center" }}>Đang tải trang AI gợi ý tác nhân…</div>}>
      <AiSuspectContent />
    </Suspense>
  );
}

