"use client";

import { useEffect, useState } from "react";
import { api, getToken, getUser } from "../../lib/api";
import { AppShell, EmptyState, ErrorBox, SeverityBadge } from "../../components/ui";

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

const TYPE_LABEL: Record<string, string> = {
  drug_drug: "Thuốc–thuốc",
  duplicate_ingredient: "Trùng hoạt chất",
  drug_allergy: "Thuốc–dị ứng",
  drug_condition: "Thuốc–tình trạng",
};

export default function PharmacistRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user) {
      window.location.href = "/login";
      return;
    }
    setCanEdit(user.role === "pharmacist");
    api<Rule[]>("/v1/rules")
      .then(setRules)
      .catch((e) => setError(e.message));
  }, []);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đổi được trạng thái quy tắc");
    }
  }

  return (
    <AppShell
      role="doctor"
      icon="📋"
      title="Quy tắc an toàn thuốc"
      subtitle={
        canEdit
          ? "Duyệt hoặc chuyển quy tắc về nháp — quy tắc nháp không sinh cảnh báo thực"
          : "Xem danh sách quy tắc (chỉ dược sĩ được đổi trạng thái)"
      }
    >
      {error && <ErrorBox text={error} />}

      <div className="card">
        {rules.length === 0 && <EmptyState icon="📋" text="Chưa có quy tắc nào." />}
        {rules.map((r) => (
          <div className="list-row" key={r.id}>
            <div className="list-main">
              <div className="list-title">
                {r.code} — {r.title}
              </div>
              <div className="list-sub">
                {TYPE_LABEL[r.rule_type] ?? r.rule_type} · v{r.rule_version} ·{" "}
                {r.source_title ?? "—"}
              </div>
              <div style={{ fontSize: 14, marginTop: 4 }}>{r.message}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                <SeverityBadge severity={r.severity} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
    </AppShell>
  );
}
