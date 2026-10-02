"use client";

import { useEffect, useRef, useState } from "react";
import { api, getToken, getUser } from "../../lib/api";
import { AppShell, EmptyState, ErrorBox, SeverityBadge, SuccessBox } from "../../components/ui";

interface Rule {
  id: string;
  code: string;
  rule_version: string;
  rule_type: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  source_title: string | null;
}

interface AssignedPatient {
  profile_id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
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

const TYPE_LABEL: Record<string, string> = {
  drug_drug: "Thuốc–thuốc",
  duplicate_ingredient: "Trùng hoạt chất",
  drug_allergy: "Thuốc–dị ứng",
  drug_condition: "Thuốc–tình trạng",
};

export default function DrugInteractionsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [patients, setPatients] = useState<AssignedPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  // Search & Filters cho danh sách 633 quy tắc
  const [ruleSearch, setRuleSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  // MedSafe Interactive Checker state
  const [medsafeInput, setMedsafeInput] = useState("");
  const [medsafeChecking, setMedsafeChecking] = useState(false);
  const [medsafeSuggestions, setMedsafeSuggestions] = useState<DrugSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
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

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user) {
      window.location.href = "/login";
      return;
    }
    setCanEdit(user.role === "pharmacist" || user.role === "admin");
    api<Rule[]>("/v1/rules")
      .then(setRules)
      .catch((e) => setError(e.message));
    api<AssignedPatient[]>("/v1/patients/assigned")
      .then(setPatients)
      .catch(() => {});
  }, []);

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
      const url = `/v1/safety-checks/suggest-drugs?q=${encodeURIComponent(token)}${selectedPatientId ? `&profile_id=${selectedPatientId}` : ""}`;
      const list = await api<DrugSuggestion[]>(url);
      setMedsafeSuggestions(list);
      setShowSuggestions(list.length > 0);
      setActiveSuggestionIdx(0);
    } catch {
      setMedsafeSuggestions([]);
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
      void runInteractiveCheck();
    }
  }

  async function runInteractiveCheck(drugsToCheck?: string[]) {
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
      }

      if (drugList.length === 0) {
        setError("Vui lòng nhập 2 hoặc 3 loại thuốc/hoạt chất để kiểm tra phản ứng tương tác.");
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
          profile_id: selectedPatientId || null,
          drugs: drugList,
        },
      });

      setQuickCheckResult(res);
      setSuccess(`Đã hoàn tất đối soát tương tác thuốc cho: ${drugList.join(" + ")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kiểm tra tương tác thất bại");
    } finally {
      setMedsafeChecking(false);
    }
  }

  async function toggleStatus(rule: Rule) {
    setError("");
    try {
      await api(`/v1/rules/${rule.id}/status`, {
        method: "POST",
        body: { status: rule.status === "approved" ? "draft" : "approved" },
      });
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, status: r.status === "approved" ? "draft" : "approved" } : r
        )
      );
      setSuccess(`Đã cập nhật trạng thái quy tắc ${rule.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đổi được trạng thái quy tắc");
    }
  }

  // Lọc quy tắc theo từ khóa, loại quy tắc và mức độ
  const filteredRules = rules.filter((r) => {
    const q = ruleSearch.toLowerCase().trim();
    const matchQuery =
      !q ||
      r.code.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.message.toLowerCase().includes(q) ||
      (r.source_title && r.source_title.toLowerCase().includes(q));

    const matchType = typeFilter === "all" || r.rule_type === typeFilter;
    const matchSeverity = severityFilter === "all" || r.severity === severityFilter;

    return matchQuery && matchType && matchSeverity;
  });

  return (
    <AppShell
      role="doctor"
      icon="⚡"
      title="Kiểm tra Tương tác thuốc (MedSafe)"
      subtitle="Đối soát tương tác 2/3 loại hoạt chất, kiểm tra dị ứng và tra cứu 633 quy tắc Bộ Y tế"
    >
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {/* PHẦN 1: BỘ CÔNG CỤ ĐỐI SOÁT TƯƠNG TÁC THUỐC TRỰC TUYẾN (INTERACTIVE CHECKER) */}
      <div
        className="card"
        style={{
          border: "1.5px solid #0284c7",
          background: "linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)",
          borderRadius: 16,
          marginBottom: 20,
          boxShadow: "0 4px 20px rgba(2, 132, 199, 0.08)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 26 }}>🧪</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#0369a1" }}>
                Kiểm tra Phản ứng & Đối soát Tương tác Đa chất
              </div>
              <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                Nhập 2, 3 loại thuốc để kiểm tra tương tác chéo, dị ứng và chống chỉ định bệnh nền
              </div>
            </div>
          </div>
          <span className="badge badge-info" style={{ fontWeight: 700, fontSize: "0.82rem" }}>
            ⚡ Kho 633 Tương tác BYT & Gemini AI
          </span>
        </div>

        {/* Tùy chọn gắn với Bệnh nhân cụ thể (Optional) */}
        {patients.length > 0 && (
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label htmlFor="patient-select" style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>
              👤 Đối chiếu với hồ sơ bệnh nhân:
            </label>
            <select
              id="patient-select"
              className="input"
              style={{ padding: "6px 12px", fontSize: "0.86rem", maxWidth: 320, borderColor: "#7dd3fc" }}
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
            >
              <option value="">-- Kiểm tra tự do (Không theo hồ sơ cụ thể) --</option>
              {patients.map((p) => (
                <option key={p.profile_id} value={p.profile_id}>
                  {p.full_name} {p.dob ? `(${p.dob})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* KHUNG NHẬP THUỐC CÓ GỢI Ý TAB & DROPDOWN */}
        <div style={{ background: "#ffffff", padding: "16px 18px", borderRadius: 14, border: "1px solid #bae6fd", boxShadow: "0 2px 8px rgba(2, 132, 199, 0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
            <label htmlFor="medsafe-input-pharmacist" style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
              Nhập các loại thuốc/hoạt chất (ngăn cách bởi dấu phẩy):
            </label>
            <span style={{ fontSize: "0.78rem", color: "#0284c7", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <span>💡 Gõ tên thuốc rồi nhấn</span>
              <kbd style={{ background: "#e0f2fe", border: "1px solid #7dd3fc", borderRadius: 4, padding: "1px 6px", fontSize: "0.75rem", fontWeight: 700, color: "#0369a1" }}>Tab ↹</kbd>
              <span>để tự động điền nhanh</span>
            </span>
          </div>

          <div style={{ position: "relative", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                id="medsafe-input-pharmacist"
                type="text"
                className="input"
                style={{ flex: 1, minWidth: 260, fontSize: "0.92rem", padding: "10px 14px", borderColor: "#0284c7", borderRadius: 8 }}
                placeholder="VD: Warfarin, Aspirin hoặc Clarithromycin, Simvastatin, Panadol..."
                value={medsafeInput}
                onChange={(e) => handleMedsafeChange(e.target.value)}
                onKeyDown={handleMedsafeKeyDown}
                onFocus={() => fetchDrugSuggestions(getCurrentQueryToken(medsafeInput))}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: "10px 22px", fontWeight: 700, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => {
                  setShowSuggestions(false);
                  void runInteractiveCheck();
                }}
                disabled={medsafeChecking}
              >
                {medsafeChecking ? "⏳ Đang đối soát…" : "⚡ Kiểm tra Phản ứng"}
              </button>
            </div>

            {/* DANH SÁCH GỢI Ý THUỐC AUTOCOMPLETE */}
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
                  maxHeight: 320,
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
                              ⚠️ Tiền sử Dị ứng
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
                          <div style={{ fontSize: "0.76rem", color: s.is_allergy ? "#e11d48" : "#0369a1", marginTop: 2 }}>
                            💡 <em>{s.ai_hint}</em>
                          </div>
                        )}
                      </div>

                      <div style={{ flexShrink: 0 }}>
                        <span
                          style={{
                            background: isHighlighted ? "#0284c7" : "#f1f5f9",
                            color: isHighlighted ? "#ffffff" : "#64748b",
                            border: isHighlighted ? "1px solid #0284c7" : "1px solid #cbd5e1",
                            borderRadius: 4,
                            padding: "2px 7px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
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

          {/* CÁC NÚT MẪU NHANH */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: "0.8rem", marginTop: 8 }}>
            <span style={{ color: "#64748b", fontWeight: 600 }}>Thử nhanh các cặp tương tác mẫu:</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "0.78rem", padding: "3px 8px" }}
              onClick={() => {
                setMedsafeInput("Warfarin, Aspirin");
                void runInteractiveCheck(["Warfarin", "Aspirin"]);
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
                void runInteractiveCheck(["Clarithromycin", "Simvastatin"]);
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
                void runInteractiveCheck(["Panadol", "Efferalgan"]);
              }}
            >
              🔁 Panadol + Efferalgan (Trùng Paracetamol)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "0.78rem", padding: "3px 8px" }}
              onClick={() => {
                setMedsafeInput("Methotrexate, Ibuprofen");
                void runInteractiveCheck(["Methotrexate", "Ibuprofen"]);
              }}
            >
              ⚡ Methotrexate + Ibuprofen (Tủy xương)
            </button>
          </div>
        </div>

        {/* KẾT QUẢ ĐỐI SOÁT TƯƠNG TÁC MEDSAFE */}
        {quickCheckResult && (
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                padding: "12px 16px",
                borderRadius: 12,
                backgroundColor: quickCheckResult.status === "has_alerts" ? "#fff1f2" : "#f0fdf4",
                border: quickCheckResult.status === "has_alerts" ? "1.5px solid #fecdd3" : "1.5px solid #bbf7d0",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>{quickCheckResult.status === "has_alerts" ? "⚠️" : "✅"}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "1rem", color: quickCheckResult.status === "has_alerts" ? "#9f1239" : "#166534" }}>
                    {quickCheckResult.status_label}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#475569" }}>
                    Thuốc đã kiểm tra: <strong>{quickCheckResult.checked_drugs.join(", ")}</strong>
                  </div>
                </div>
              </div>
              <span
                className={quickCheckResult.status === "has_alerts" ? "badge badge-danger" : "badge badge-ok"}
                style={{ fontSize: "0.82rem", fontWeight: 700 }}
              >
                {quickCheckResult.alerts.length} cảnh báo phát hiện
              </span>
            </div>

            {/* DANH SÁCH CẢNH BÁO CHI TIẾT */}
            {quickCheckResult.alerts.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {quickCheckResult.alerts.map((a, idx) => (
                  <div
                    key={`${a.rule_code}-${idx}`}
                    style={{
                      background: "#ffffff",
                      border: a.severity === "high" ? "1.5px solid #f43f5e" : "1px solid #fbbf24",
                      borderRadius: 12,
                      padding: "14px 16px",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20 }}>
                          {a.rule_type === "drug_allergy" ? "🚫" : a.rule_type === "duplicate_ingredient" ? "🔁" : "⚡"}
                        </span>
                        <strong style={{ fontSize: "0.95rem", color: a.severity === "high" ? "#9f1239" : "#854d0e" }}>
                          [{a.rule_code}] {a.message}
                        </strong>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <SeverityBadge severity={a.severity} />
                        <span className="badge badge-neutral" style={{ fontSize: "0.75rem" }}>
                          {TYPE_LABEL[a.rule_type] ?? a.rule_type}
                        </span>
                      </div>
                    </div>

                    {a.source && (
                      <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 4 }}>
                        📚 Căn cứ y khoa: <em>{a.source}</em>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "14px 18px", background: "#f8fafc", borderRadius: 10, border: "1px dashed #cbd5e1", color: "#334155", fontSize: "0.88rem" }}>
                ✓ Chưa phát hiện tương tác nguy hiểm trong kho 633 quy tắc đối với các thuốc đã nhập.
              </div>
            )}
          </div>
        )}
      </div>

      {/* PHẦN 2: TRA CỨU & QUẢN LÝ KHO 633 QUY TẮC DƯỢC THƯ BỘ Y TẾ */}
      <div className="card">
        <div className="card-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>
            <span className="t-ico">📚</span> Kho Quy tắc An toàn Thuốc Bộ Y tế ({filteredRules.length}/{rules.length})
          </div>
          {canEdit && (
            <span className="badge badge-ok" style={{ fontSize: "0.78rem" }}>
              Dược sĩ: Có quyền duyệt quy tắc
            </span>
          )}
        </div>

        {/* BỘ LỌC VÀ TÌM KIẾM QUY TẮC */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 14 }}>
          <div>
            <input
              type="text"
              className="input"
              placeholder="🔍 Tìm theo mã (DD001), tên thuốc, hoạt chất..."
              value={ruleSearch}
              onChange={(e) => setRuleSearch(e.target.value)}
              style={{ fontSize: "0.88rem" }}
            />
          </div>
          <div>
            <select
              className="input"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ fontSize: "0.88rem" }}
            >
              <option value="all">Tất cả loại quy tắc ({rules.length})</option>
              <option value="drug_drug">⚡ Thuốc – Thuốc</option>
              <option value="drug_allergy">🚫 Thuốc – Dị ứng</option>
              <option value="duplicate_ingredient">🔁 Trùng hoạt chất</option>
              <option value="drug_condition">🏥 Thuốc – Bệnh nền</option>
            </select>
          </div>
          <div>
            <select
              className="input"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{ fontSize: "0.88rem" }}
            >
              <option value="all">Tất cả mức độ nghiêm trọng</option>
              <option value="high">🔴 Mức cao (Đỏ - Chống chỉ định / Nguy hiểm)</option>
              <option value="medium">🟡 Mức trung bình (Vàng - Thận trọng / Giám sát)</option>
              <option value="low">🟢 Mức nhẹ (Xanh - Cân nhắc)</option>
            </select>
          </div>
        </div>

        {/* DANH SÁCH QUY TẮC */}
        {filteredRules.length === 0 ? (
          <EmptyState icon="📋" text="Không tìm thấy quy tắc nào khớp với bộ lọc." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredRules.map((r) => (
              <div className="list-row" key={r.id} style={{ alignItems: "flex-start", padding: "12px 16px" }}>
                <div className="list-main">
                  <div className="list-title" style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a" }}>
                    <span style={{ color: "#0284c7" }}>{r.code}</span> — {r.title}
                  </div>
                  <div className="list-sub" style={{ marginTop: 2 }}>
                    <span style={{ fontWeight: 600 }}>{TYPE_LABEL[r.rule_type] ?? r.rule_type}</span> · v{r.rule_version} · Nguồn: {r.source_title ?? "Dược thư Quốc gia"}
                  </div>
                  <div style={{ fontSize: "0.88rem", color: "#334155", marginTop: 4 }}>
                    {r.message}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                    <SeverityBadge severity={r.severity} />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {r.status === "approved" ? (
                    <span className="badge badge-ok">Đã duyệt</span>
                  ) : (
                    <span className="badge badge-warning">Bản nháp</span>
                  )}
                  {canEdit && (
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleStatus(r)}>
                      {r.status === "approved" ? "Về nháp" : "Duyệt"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

