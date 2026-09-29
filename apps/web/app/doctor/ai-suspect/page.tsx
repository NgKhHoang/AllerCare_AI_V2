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

  const [activeTab, setActiveTab] = useState<"suspect" | "guide">("suspect");

  const [meds, setMeds] = useState<Medication[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);

  // Suspect Ranking form
  const [reaction, setReaction] = useState("");
  const [prevDrugs, setPrevDrugs] = useState("");
  const [suspect, setSuspect] = useState<SuspectRankingResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [guideLoadingId, setGuideLoadingId] = useState<string | null>(null);
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
      setSuccess("AI đã phân tích và xếp hạng tác nhân nghi ngờ theo chuẩn WHO!");
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
      setSuccess("✓ Đã xác nhận tác nhân nghi ngờ → Tự động cập nhật vào Hồ sơ Dị ứng của người bệnh.");
      setSuspect(null);
      if (selectedId) await loadPatientData(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác nhận được");
    }
  }

  async function draftGuide(medId: string) {
    setError("");
    setSuccess("");
    setGuideLoadingId(medId);
    try {
      const g = await api<Guide>(`/v1/guides/draft/${medId}`, { method: "POST" });
      setGuides((prev) => [g, ...prev.filter((x) => x.id !== g.id)]);
      setSuccess("✓ AI đã soạn thảo hướng dẫn cá nhân hóa — bạn hãy duyệt trước khi gửi.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không soạn được hướng dẫn");
    } finally {
      setGuideLoadingId(null);
    }
  }

  async function approveGuide(guideId: string) {
    setError("");
    setSuccess("");
    try {
      const g = await api<Guide>(`/v1/guides/${guideId}/approve`, { method: "POST" });
      setGuides((prev) => [g, ...prev.filter((x) => x.id !== g.id)]);
      setSuccess("✓ Đã duyệt và gửi hướng dẫn dùng thuốc an toàn đến Người bệnh!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không duyệt được hướng dẫn");
    }
  }

  return (
    <AppShell
      role="doctor"
      icon="🔍"
      title="AI gợi ý tác nhân & Hướng dẫn thuốc"
      subtitle="Trợ lý AI phân tích tác nhân nghi ngờ dị ứng theo WHO và Soạn thảo phác đồ hướng dẫn an toàn"
    >
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {/* Patient Selector Card */}
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)",
          border: "1px solid #bae6fd",
          borderRadius: 18,
          padding: "18px 22px",
          marginBottom: 20,
          boxShadow: "0 4px 15px -3px rgba(2, 132, 199, 0.08)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
                flexShrink: 0,
              }}
            >
              👤
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#0284c7" }}>
                Đang phân tích hồ sơ người bệnh
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                {selectedPatient?.full_name ?? "Chưa chọn người bệnh"}
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {selectedPatient?.gender ?? "—"} · Năm sinh: {selectedPatient?.dob ?? "—"} · {meds.length} thuốc đang dùng
              </div>
            </div>
          </div>

          <div style={{ minWidth: 260 }}>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
              Đổi ca bệnh khác:
            </label>
            <select
              className="input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{
                fontWeight: 600,
                backgroundColor: "#ffffff",
                borderColor: "#93c5fd",
                borderRadius: 10,
                padding: "8px 12px",
              }}
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

      {/* Mode Tabs */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 20,
          borderBottom: "1px solid #e2e8f0",
          paddingBottom: 4,
        }}
      >
        <button
          onClick={() => setActiveTab("suspect")}
          style={{
            padding: "10px 18px",
            borderRadius: "12px 12px 0 0",
            border: "none",
            borderBottom: activeTab === "suspect" ? "3px solid #0284c7" : "3px solid transparent",
            backgroundColor: activeTab === "suspect" ? "#f0f9ff" : "transparent",
            color: activeTab === "suspect" ? "#0369a1" : "#64748b",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.2s ease",
          }}
        >
          <span>🔍</span> Xếp hạng Tác nhân Dị ứng (WHO)
        </button>

        <button
          onClick={() => setActiveTab("guide")}
          style={{
            padding: "10px 18px",
            borderRadius: "12px 12px 0 0",
            border: "none",
            borderBottom: activeTab === "guide" ? "3px solid #0284c7" : "3px solid transparent",
            backgroundColor: activeTab === "guide" ? "#f0f9ff" : "transparent",
            color: activeTab === "guide" ? "#0369a1" : "#64748b",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.2s ease",
          }}
        >
          <span>📖</span> Hướng dẫn Dùng thuốc AI ({meds.length})
        </button>
      </div>

      {!selectedPatient && <EmptyState icon="👥" text="Chưa chọn ca bệnh nào." />}

      {selectedPatient && activeTab === "suspect" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            className="card"
            style={{
              borderRadius: 18,
              boxShadow: "0 4px 20px -4px rgba(0, 0, 0, 0.05)",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>
                <span className="t-ico">🔍</span> Phân tích Tác nhân Nghi ngờ Dị ứng (MedSafe AI)
              </div>
              <span className="badge badge-info" style={{ fontWeight: 700 }}>
                Chuẩn WHO Causality
              </span>
            </div>

            <p className="muted" style={{ marginBottom: 14 }}>
              Nhập mô tả diễn biến lâm sàng + danh sách thuốc trong lần phản ứng trước (toa cũ).
              Mô hình sẽ đối chiếu thời gian tiềm ẩn, tiền sử tái phơi nhiễm và dược lý học để tính điểm xác suất.
            </p>

            {/* Quick Templates */}
            <div
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "10px 14px",
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                💡 Gợi ý kịch bản mẫu nhanh:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  {
                    label: "🚨 Kháng sinh Amoxicillin / Penicillin",
                    r: "Mẩn đỏ toàn thân, ngứa dữ dội và phù mí mắt 30 phút sau uống thuốc",
                    d: "Amoxicillin 500mg, Paracetamol 500mg",
                  },
                  {
                    label: "⚠️ Giảm đau Aspirin / NSAID",
                    r: "Khó thở dạng hen, co thắt phế quản 45 phút sau khi uống thuốc giảm đau",
                    d: "Aspirin 81mg, Ibuprofen 400mg",
                  },
                  {
                    label: "💉 Kháng sinh Cephalosporin",
                    r: "Phát ban sẩn đỏ toàn thân + sốt nhẹ 2 ngày sau dùng kháng sinh",
                    d: "Cefaclor 500mg, Kapredin 4mg, Paracetamol",
                  },
                ].map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      backgroundColor: "#ffffff",
                      borderColor: "#cbd5e1",
                    }}
                    onClick={() => {
                      setReaction(tmpl.r);
                      setPrevDrugs(tmpl.d);
                    }}
                  >
                    + {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSuspectRanking();
              }}
            >
              <div className="field">
                <label className="label" style={{ fontWeight: 700 }}>
                  1. Mô tả phản ứng + Thời điểm khởi phát (*)
                </label>
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder="VD: Mẩn đỏ toàn thân + khó thở 15 phút sau uống Cefaclor; từng bị mẩn ngứa nhẹ 1 năm trước..."
                  value={reaction}
                  onChange={(e) => setReaction(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label className="label" style={{ fontWeight: 700 }}>
                  2. Danh sách thuốc đã dùng trước đó (Cách nhau bằng dấu phẩy)
                </label>
                <input
                  className="input"
                  placeholder="VD: Cefaclor 500mg, Kapredin, Paracetamol 500mg..."
                  value={prevDrugs}
                  onChange={(e) => setPrevDrugs(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={loading || !reaction.trim()}
                style={{
                  background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
                }}
              >
                {loading ? "🤖 Đang phân tích thuật toán WHO…" : "🔍 Chạy Xếp hạng Tác nhân Dị ứng"}
              </button>
            </form>

            {suspect && (
              <div className="mt16" style={{ animation: "fadeIn 0.25s ease-out" }}>
                <div
                  style={{
                    backgroundColor: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#92400e", marginBottom: 4 }}>
                    📊 Kết luận AI & Tóm tắt lâm sàng:
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: "#78350f" }}>
                    {suspect.summary}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {suspect.ranking.map((s) => (
                    <div
                      key={s.rank}
                      style={{
                        backgroundColor: s.level === "high" ? "#fff1f2" : "#ffffff",
                        border: s.level === "high" ? "1.5px solid #fecdd3" : "1px solid #e2e8f0",
                        borderRadius: 14,
                        padding: "14px 18px",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <span
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              backgroundColor: s.level === "high" ? "#e11d48" : "#0284c7",
                              color: "#fff",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: 13,
                            }}
                          >
                            #{s.rank}
                          </span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                            {s.drug}
                          </span>
                          <span
                            className={
                              s.level === "high"
                                ? "badge badge-danger"
                                : s.level === "possible"
                                ? "badge badge-warning"
                                : "badge badge-neutral"
                            }
                            style={{ fontWeight: 700 }}
                          >
                            {s.level === "high" ? "🚨 Nghi ngờ cao" : s.level === "possible" ? "⚠️ Có thể" : "Thấp"}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "#475569" }}>
                          {s.reasons.join(" · ")}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: s.level === "high" ? "#e11d48" : "#0284c7" }}>
                            {s.score}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>Điểm WHO</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button
                    className="btn btn-primary"
                    onClick={confirmSuspect}
                    style={{
                      background: "linear-gradient(135deg, #e11d48 0%, #be123c 100%)",
                      boxShadow: "0 4px 12px rgba(225, 29, 72, 0.3)",
                    }}
                  >
                    ✓ Xác nhận tác nhân #{1} ({suspect.ranking[0]?.drug}) → Ghi hồ sơ dị ứng
                  </button>
                  <button className="btn btn-secondary" onClick={() => setSuspect(null)}>
                    Đóng bảng kết quả
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedPatient && activeTab === "guide" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            className="card"
            style={{
              borderRadius: 18,
              boxShadow: "0 4px 20px -4px rgba(0, 0, 0, 0.05)",
              border: "1px solid #e2e8f0",
            }}
          >
            <div className="card-title" style={{ marginBottom: 8 }}>
              <span className="t-ico">📖</span> Trợ lý AI Soạn thảo & Duyệt Hướng dẫn Dùng thuốc
            </div>
            <p className="muted" style={{ marginBottom: 18 }}>
              Dưới đây là toàn bộ danh mục thuốc của người bệnh <strong>{selectedPatient.full_name}</strong>.
              Bấm <strong>"🤖 Soạn nháp"</strong> để AI tạo bản hướng dẫn dễ hiểu, sau đó Bác sĩ duyệt để gửi tới ứng dụng Người bệnh.
            </p>

            {meds.length === 0 && <EmptyState icon="💊" text="Chưa có thuốc trong hồ sơ bệnh nhân này." />}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {meds.map((m) => {
                const g = guides.find((x) => x.medication_id === m.id);
                return (
                  <div
                    key={m.id}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 14,
                      padding: "16px 18px",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                          💊 {m.raw_name}
                        </span>
                        <span
                          className="badge badge-neutral"
                          style={{ marginLeft: 8, fontSize: 11 }}
                        >
                          {m.is_planned ? "Thuốc dự kiến" : "Đang điều trị"}
                        </span>
                        {m.frequency && (
                          <span style={{ fontSize: 13, color: "#64748b", marginLeft: 8 }}>
                            · {m.frequency}
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        {!g && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => draftGuide(m.id)}
                            disabled={guideLoadingId === m.id}
                            style={{ fontWeight: 600 }}
                          >
                            {guideLoadingId === m.id ? "🤖 Đang soạn…" : "🤖 Soạn nháp"}
                          </button>
                        )}
                        {g && g.status === "draft" && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => approveGuide(g.id)}
                            style={{ fontWeight: 700 }}
                          >
                            ✓ Duyệt & Gửi
                          </button>
                        )}
                        {g && g.status === "approved" && (
                          <span className="badge badge-ok" style={{ fontWeight: 700, padding: "6px 12px" }}>
                            ✓ Đã gửi người bệnh
                          </span>
                        )}
                      </div>
                    </div>

                    {g && (
                      <div
                        style={{
                          marginTop: 10,
                          backgroundColor: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          padding: "12px 16px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#0369a1" }}>
                            📝 Nội dung hướng dẫn ({g.status === "approved" ? "Đã duyệt" : "Bản nháp AI"}):
                          </span>
                          <span style={{ fontSize: 12, color: "#64748b" }}>
                            Phản hồi:{" "}
                            {g.acknowledgment === "understood" ? (
                              <strong style={{ color: "#16a34a" }}>✓ ĐÃ HIỂU</strong>
                            ) : g.acknowledgment === "not_understood" ? (
                              <strong style={{ color: "#dc2626" }}>⚠️ CHƯA HIỂU</strong>
                            ) : (
                              <span style={{ fontStyle: "italic" }}>Chờ xác nhận</span>
                            )}
                          </span>
                        </div>
                        <div style={{ whiteSpace: "pre-line", fontSize: 13.5, lineHeight: 1.6, color: "#334155" }}>
                          {g.guide_content}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
