"use client";

/**
 * AllerCare AI - Trung tâm Quản trị Hệ thống Toàn diện (Super Admin Dashboard)
 * 1. Tổng quan & Giám sát Telemetry AI (Google Gemini Live Ping)
 * 2. Quản lý Người dùng (CRUD, Đổi mật khẩu, Khóa/Mở, Phân quyền)
 * 3. Quản lý Quy tắc An toàn Y tế (CRUD 657+ Safety Rules Bộ Y Tế)
 * 4. Quản lý Danh mục Dược & Hoạt chất (CRUD 326+ Active Ingredients & Biệt dược)
 * 5. Nhật ký Bảo mật & Kiểm toán Hệ thống (Audit Log Real-time & Export JSON)
 */
import { useCallback, useEffect, useState } from "react";
import { api, getToken, getUser } from "../../lib/api";
import { AppShell, EmptyState, ErrorBox, SuccessBox } from "../../components/ui";

interface AdminStats {
  users: { total: number; active: number; by_role: Record<string, number> };
  safety_rules: { total: number; by_severity: Record<string, number>; by_type: Record<string, number> };
  catalog: { ingredients_count: number; drugs_count: number };
  activity: { audit_events_count: number; safety_checks_count: number; triage_assessments_count: number };
  ai_engine: { provider: string; model: string; has_api_key: boolean; demo_mode: number };
  server_time: string;
}

interface AdminUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  phone?: string | null;
  is_active: boolean;
  created_at: string;
}

interface SafetyRuleItem {
  id: string;
  code: string;
  rule_version: string;
  rule_type: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  condition_json: string;
  approved_by?: string | null;
}

interface IngredientItem {
  id: string;
  name: string;
  atc_code?: string | null;
  notes?: string | null;
}

interface DrugItem {
  id: string;
  name: string;
  strength?: string | null;
  form?: string | null;
  is_combination: boolean;
  in_scope: boolean;
}

interface AuditEvent {
  id: string;
  username: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  detail: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  patient: "Người bệnh",
  doctor: "Bác sĩ lâm sàng",
  nurse: "Điều dưỡng theo dõi",
  pharmacist: "Dược sĩ lâm sàng",
  leader: "Lãnh đạo khoa / Quản lý",
  admin: "Quản trị viên hệ thống",
  caregiver: "Người nhà người bệnh",
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "badge badge-danger",
  medium: "badge badge-warning",
  low: "badge badge-neutral",
};

type TabType = "overview" | "users" | "rules" | "catalog" | "audit";

export default function AdminSuperDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Users State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showResetPwModal, setShowResetPwModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Form States - User
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState("doctor");
  const [newPhone, setNewPhone] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editRole, setEditRole] = useState("doctor");
  const [editPhone, setEditPhone] = useState("");
  const [resetPwInput, setResetPwInput] = useState("");

  // Safety Rules State
  const [rules, setRules] = useState<SafetyRuleItem[]>([]);
  const [ruleTotal, setRuleTotal] = useState(0);
  const [ruleSearch, setRuleSearch] = useState("");
  const [ruleTypeFilter, setRuleTypeFilter] = useState("");
  const [ruleSeverityFilter, setRuleSeverityFilter] = useState("");
  const [showCreateRuleModal, setShowCreateRuleModal] = useState(false);
  const [showEditRuleModal, setShowEditRuleModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState<SafetyRuleItem | null>(null);

  // Form States - Rule
  const [ruleCode, setRuleCode] = useState("");
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleMessage, setRuleMessage] = useState("");
  const [ruleType, setRuleType] = useState("drug_drug");
  const [ruleSeverity, setRuleSeverity] = useState("high");
  const [ruleStatus, setRuleStatus] = useState("approved");
  const [ruleCondition, setRuleCondition] = useState('{"type": "drug_drug", "drugs": []}');

  // Catalog State (Ingredients & Drugs)
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [drugs, setDrugs] = useState<DrugItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [showAddIngModal, setShowAddIngModal] = useState(false);
  const [showAddDrugModal, setShowAddDrugModal] = useState(false);
  const [ingName, setIngName] = useState("");
  const [ingAtc, setIngAtc] = useState("");
  const [ingNotes, setIngNotes] = useState("");
  const [drugName, setDrugName] = useState("");
  const [drugStrength, setDrugStrength] = useState("");
  const [drugForm, setDrugForm] = useState("Viên nén");

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");

  // AI Telemetry Ping Test
  const [aiTestPrompt, setAiTestPrompt] = useState("Kiểm tra tương tác thuốc Paracetamol và Warfarin");
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    status: string;
    latency_ms: number;
    provider: string;
    model: string;
    has_api_key: boolean;
    response_text?: string;
    error_detail?: string;
  } | null>(null);

  // Global Alerts & Loading
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Verify Role
  useEffect(() => {
    const u = getUser();
    if (!getToken() || !u || u.role !== "admin") {
      window.location.href = "/login";
    }
  }, []);

  // Fetch Core Stats
  const loadStats = useCallback(async () => {
    try {
      const data = await api<AdminStats>("/v1/admin/stats");
      setStats(data);
    } catch {
      // Ignored if offline
    }
  }, []);

  // Fetch Users
  const loadUsers = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (userSearch) q.set("q", userSearch);
      if (userRoleFilter) q.set("role", userRoleFilter);
      const data = await api<AdminUser[]>(`/v1/admin/users?${q.toString()}`);
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách người dùng");
    }
  }, [userSearch, userRoleFilter]);

  // Fetch Safety Rules
  const loadRules = useCallback(async () => {
    try {
      const q = new URLSearchParams({ limit: "150", offset: "0" });
      if (ruleSearch) q.set("q", ruleSearch);
      if (ruleTypeFilter) q.set("rule_type", ruleTypeFilter);
      if (ruleSeverityFilter) q.set("severity", ruleSeverityFilter);
      const data = await api<{ total: number; items: SafetyRuleItem[] }>(`/v1/admin/rules?${q.toString()}`);
      setRules(data.items);
      setRuleTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được quy tắc an toàn");
    }
  }, [ruleSearch, ruleTypeFilter, ruleSeverityFilter]);

  // Fetch Catalog
  const loadCatalog = useCallback(async () => {
    try {
      const [ings, drgs] = await Promise.all([
        api<{ items: IngredientItem[] }>(`/v1/admin/ingredients?limit=150&q=${encodeURIComponent(catalogSearch)}`),
        api<{ items: DrugItem[] }>(`/v1/admin/drugs?limit=150&q=${encodeURIComponent(catalogSearch)}`),
      ]);
      setIngredients(ings.items);
      setDrugs(drgs.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh mục dược");
    }
  }, [catalogSearch]);

  // Fetch Audit Logs
  const loadAuditLogs = useCallback(async () => {
    try {
      const q = new URLSearchParams({ limit: "100" });
      if (auditSearch) q.set("q", auditSearch);
      if (auditActionFilter) q.set("action", auditActionFilter);
      const data = await api<{ items: AuditEvent[] }>(`/v1/admin/audit-log?${q.toString()}`);
      setAuditLogs(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được nhật ký kiểm toán");
    }
  }, [auditSearch, auditActionFilter]);

  // Tab switcher trigger
  useEffect(() => {
    loadStats();
    if (activeTab === "overview") loadStats();
    if (activeTab === "users") loadUsers();
    if (activeTab === "rules") loadRules();
    if (activeTab === "catalog") loadCatalog();
    if (activeTab === "audit") loadAuditLogs();
  }, [activeTab, loadStats, loadUsers, loadRules, loadCatalog, loadAuditLogs]);

  // --- USER ACTIONS ---
  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await api("/v1/admin/users", {
        method: "POST",
        body: {
          username: newUsername,
          password: newPassword,
          full_name: newFullName,
          role: newRole,
          phone: newPhone || null,
          is_active: true,
        },
      });
      setSuccess(`Đã tạo thành công tài khoản "${newUsername}" (${ROLE_LABELS[newRole] || newRole})`);
      setShowCreateUserModal(false);
      setNewUsername("");
      setNewPassword("");
      setNewFullName("");
      setNewPhone("");
      loadUsers();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tạo tài khoản thất bại");
    }
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setError("");
    setSuccess("");
    try {
      await api(`/v1/admin/users/${selectedUser.id}`, {
        method: "PUT",
        body: {
          full_name: editFullName,
          role: editRole,
          phone: editPhone || null,
        },
      });
      setSuccess(`Đã cập nhật thông tin tài khoản "${selectedUser.username}"`);
      setShowEditUserModal(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật tài khoản thất bại");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setError("");
    setSuccess("");
    try {
      await api(`/v1/admin/users/${selectedUser.id}/reset-password`, {
        method: "POST",
        body: { new_password: resetPwInput },
      });
      setSuccess(`Đã đặt lại mật khẩu mới cho "${selectedUser.username}" thành công`);
      setShowResetPwModal(false);
      setResetPwInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đặt lại mật khẩu thất bại");
    }
  }

  async function handleToggleUserActive(u: AdminUser) {
    setError("");
    setSuccess("");
    try {
      const res = await api<{ id: string; is_active: boolean }>(
        `/v1/admin/users/${u.id}/active?is_active=${!u.is_active}`,
        { method: "POST" }
      );
      setUsers((prev) => prev.map((x) => (x.id === res.id ? { ...x, is_active: res.is_active } : x)));
      setSuccess(res.is_active ? `Đã mở khóa tài khoản ${u.username}.` : `Đã khóa tài khoản ${u.username}.`);
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thao tác thất bại");
    }
  }

  async function handleDeleteUser(u: AdminUser) {
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA vĩnh viễn tài khoản "${u.username}" (${u.full_name})?`)) return;
    setError("");
    setSuccess("");
    try {
      await api(`/v1/admin/users/${u.id}`, { method: "DELETE" });
      setSuccess(`Đã xóa vĩnh viễn tài khoản "${u.username}"`);
      loadUsers();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xóa tài khoản thất bại");
    }
  }

  // --- RULE ACTIONS ---
  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await api("/v1/admin/rules", {
        method: "POST",
        body: {
          code: ruleCode,
          title: ruleTitle,
          message: ruleMessage,
          rule_type: ruleType,
          severity: ruleSeverity,
          status: ruleStatus,
          condition_json: ruleCondition,
          approved_by: "Admin Quản trị",
        },
      });
      setSuccess(`Đã thêm mới quy tắc an toàn "${ruleCode}"`);
      setShowCreateRuleModal(false);
      setRuleCode("");
      setRuleTitle("");
      setRuleMessage("");
      loadRules();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thêm quy tắc thất bại");
    }
  }

  async function handleUpdateRule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRule) return;
    setError("");
    setSuccess("");
    try {
      await api(`/v1/admin/rules/${selectedRule.id}`, {
        method: "PUT",
        body: {
          title: ruleTitle,
          message: ruleMessage,
          severity: ruleSeverity,
          status: ruleStatus,
          condition_json: ruleCondition,
        },
      });
      setSuccess(`Đã cập nhật quy tắc "${selectedRule.code}"`);
      setShowEditRuleModal(false);
      loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật quy tắc thất bại");
    }
  }

  async function handleDeleteRule(r: SafetyRuleItem) {
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA quy tắc an toàn "${r.code}" (${r.title})?`)) return;
    setError("");
    setSuccess("");
    try {
      await api(`/v1/admin/rules/${r.id}`, { method: "DELETE" });
      setSuccess(`Đã xóa quy tắc "${r.code}"`);
      loadRules();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xóa quy tắc thất bại");
    }
  }

  // --- CATALOG ACTIONS ---
  async function handleAddIngredient(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await api("/v1/admin/ingredients", {
        method: "POST",
        body: { name: ingName, atc_code: ingAtc || null, notes: ingNotes || null },
      });
      setSuccess(`Đã thêm hoạt chất "${ingName.toUpperCase()}" vào hệ thống`);
      setShowAddIngModal(false);
      setIngName("");
      setIngAtc("");
      setIngNotes("");
      loadCatalog();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thêm hoạt chất thất bại");
    }
  }

  async function handleDeleteIngredient(i: IngredientItem) {
    if (!window.confirm(`Xóa hoạt chất "${i.name}" khỏi danh mục?`)) return;
    try {
      await api(`/v1/admin/ingredients/${i.id}`, { method: "DELETE" });
      setSuccess(`Đã xóa hoạt chất "${i.name}"`);
      loadCatalog();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xóa hoạt chất thất bại");
    }
  }

  async function handleAddDrug(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await api("/v1/admin/drugs", {
        method: "POST",
        body: { name: drugName, strength: drugStrength || null, form: drugForm || null, is_combination: false, in_scope: true },
      });
      setSuccess(`Đã thêm biệt dược "${drugName}"`);
      setShowAddDrugModal(false);
      setDrugName("");
      setDrugStrength("");
      loadCatalog();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thêm biệt dược thất bại");
    }
  }

  async function handleDeleteDrug(d: DrugItem) {
    if (!window.confirm(`Xóa biệt dược "${d.name}"?`)) return;
    try {
      await api(`/v1/admin/drugs/${d.id}`, { method: "DELETE" });
      setSuccess(`Đã xóa biệt dược "${d.name}"`);
      loadCatalog();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xóa biệt dược thất bại");
    }
  }

  // --- AI TEST PING ---
  async function handleTestAiEngine() {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await api<any>("/v1/admin/test-ai", {
        method: "POST",
        body: { prompt: aiTestPrompt },
      });
      setAiTestResult(res);
    } catch (err) {
      setAiTestResult({
        status: "error",
        latency_ms: 0,
        provider: "unknown",
        model: "unknown",
        has_api_key: false,
        error_detail: err instanceof Error ? err.message : "Không kết nối được AI",
      });
    } finally {
      setAiTesting(false);
    }
  }

  // --- EXPORT AUDIT LOG ---
  function exportAuditLogsJson() {
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", jsonStr);
    a.setAttribute("download", `allercare_audit_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <AppShell
      role="admin"
      icon="🛡️"
      title="Trung tâm Quản trị Toàn diện (Super Admin)"
      subtitle="Quản lý người dùng, quy tắc y tế 657+, danh mục dược & giám sát AI Gemini"
    >
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 18 }}>
        <button
          className={`btn btn-sm ${activeTab === "overview" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => { setError(""); setSuccess(""); setActiveTab("overview"); }}
        >
          📊 Tổng quan & AI Telemetry
        </button>
        <button
          className={`btn btn-sm ${activeTab === "users" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => { setError(""); setSuccess(""); setActiveTab("users"); }}
        >
          👥 Người dùng ({stats?.users.total ?? users.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "rules" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => { setError(""); setSuccess(""); setActiveTab("rules"); }}
        >
          🛡️ 657+ Quy tắc An toàn ({stats?.safety_rules.total ?? ruleTotal})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "catalog" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => { setError(""); setSuccess(""); setActiveTab("catalog"); }}
        >
          💊 Hoạt chất & Biệt dược ({stats?.catalog.ingredients_count ?? ingredients.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "audit" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => { setError(""); setSuccess(""); setActiveTab("audit"); }}
        >
          📜 Nhật ký Kiểm toán ({stats?.activity.audit_events_count ?? auditLogs.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & AI TELEMETRY */}
      {/* ========================================================================= */}
      {activeTab === "overview" && stats && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Top Metric Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 16, borderLeft: "4px solid var(--brand-primary)" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>TÀI KHOẢN HỆ THỐNG</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--brand-primary)", marginTop: 4 }}>
                {stats.users.total}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {stats.users.active} đang hoạt động
              </div>
            </div>

            <div className="card" style={{ padding: 16, borderLeft: "4px solid #10b981" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>QUY TẮC AN TOÀN DƯỢC</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
                {stats.safety_rules.total}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {stats.safety_rules.by_severity.high ?? 0} mức cao (chống chỉ định)
              </div>
            </div>

            <div className="card" style={{ padding: 16, borderLeft: "4px solid #8b5cf6" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>HOẠT CHẤT & BIỆT DƯỢC</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#8b5cf6", marginTop: 4 }}>
                {stats.catalog.ingredients_count}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {stats.catalog.drugs_count} biệt dược đã nạp
              </div>
            </div>

            <div className="card" style={{ padding: 16, borderLeft: "4px solid #f59e0b" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>SỰ KIỆN KIỂM TOÁN</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b", marginTop: 4 }}>
                {stats.activity.audit_events_count}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {stats.activity.safety_checks_count} lượt MedSafe check
              </div>
            </div>
          </div>

          {/* AI Engine Telemetry Card */}
          <div className="card">
            <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>🤖 Trạng thái Động cơ AI & RAG Y tế</span>
              <span className={`badge ${stats.ai_engine.has_api_key ? "badge-ok" : "badge-warning"}`}>
                {stats.ai_engine.has_api_key ? "✓ Gemini Online" : "⚠️ Local Fallback (No Key)"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 12, background: "var(--surface-sunken)", borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Nhà cung cấp AI:</div>
                <div style={{ fontWeight: 700, fontSize: 15, textTransform: "uppercase" }}>{stats.ai_engine.provider}</div>
              </div>
              <div style={{ padding: 12, background: "var(--surface-sunken)", borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Mô hình hoạt động:</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{stats.ai_engine.model}</div>
              </div>
              <div style={{ padding: 12, background: "var(--surface-sunken)", borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Cơ chế an toàn:</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--status-success)" }}>Grounded RAG (633 BYT)</div>
              </div>
            </div>

            {/* AI Live Ping Test Tool */}
            <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>⚡ Kiểm tra phản hồi trực tiếp (AI Live Ping Test):</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  className="input"
                  style={{ flex: 1 }}
                  value={aiTestPrompt}
                  onChange={(e) => setAiTestPrompt(e.target.value)}
                  placeholder="Nhập câu hỏi test AI..."
                />
                <button className="btn btn-primary" onClick={handleTestAiEngine} disabled={aiTesting}>
                  {aiTesting ? "Đang gửi test..." : "🚀 Ping Live Test"}
                </button>
              </div>

              {aiTestResult && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 10,
                    background: aiTestResult.status === "success" ? "var(--status-success-bg)" : "var(--status-danger-bg)",
                    border: `1px solid ${aiTestResult.status === "success" ? "var(--status-success-border)" : "var(--status-danger-border)"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: aiTestResult.status === "success" ? "var(--status-success)" : "var(--status-danger)" }}>
                      {aiTestResult.status === "success" ? "✓ Test Thành Công" : "✕ Test Thất Bại"}
                    </span>
                    <span className="badge badge-neutral">Độ trễ: {aiTestResult.latency_ms} ms</span>
                  </div>
                  {aiTestResult.response_text && (
                    <div style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                      {aiTestResult.response_text}
                    </div>
                  )}
                  {aiTestResult.error_detail && (
                    <div style={{ fontSize: 13, color: "var(--status-danger)" }}>{aiTestResult.error_detail}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: USER MANAGEMENT (CRUD) */}
      {/* ========================================================================= */}
      {activeTab === "users" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div className="card-title" style={{ margin: 0 }}>
              <span>👥 Danh sách Tài khoản & Phân quyền ({users.length})</span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateUserModal(true)}>
              ➕ Thêm tài khoản mới
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1, minWidth: 200 }}
              placeholder="🔍 Tìm theo username, họ tên, SĐT..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            <select
              className="input"
              style={{ width: 180 }}
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
            >
              <option value="">Tất cả vai trò</option>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {users.length === 0 && <EmptyState icon="👤" text="Không tìm thấy tài khoản nào." />}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {users.map((u) => (
              <div className="list-row" key={u.id} style={{ alignItems: "center" }}>
                <div className="list-main">
                  <div className="list-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{u.full_name}</span>
                    <span className="muted" style={{ fontWeight: 400 }}>({u.username})</span>
                    <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                    {!u.is_active && <span className="badge badge-danger">Đang bị khóa</span>}
                  </div>
                  <div className="list-sub">
                    {u.phone ? `📞 ${u.phone} · ` : ""}
                    Tạo ngày: {u.created_at ? new Date(u.created_at).toLocaleDateString("vi-VN") : "—"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {u.role !== "admin" && (
                    <button
                      className={`btn btn-sm ${u.is_active ? "btn-secondary" : "btn-primary"}`}
                      onClick={() => handleToggleUserActive(u)}
                    >
                      {u.is_active ? "Khóa" : "Mở khóa"}
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSelectedUser(u);
                      setEditFullName(u.full_name);
                      setEditRole(u.role);
                      setEditPhone(u.phone || "");
                      setShowEditUserModal(true);
                    }}
                  >
                    ✏️ Sửa
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSelectedUser(u);
                      setResetPwInput("");
                      setShowResetPwModal(true);
                    }}
                  >
                    🔑 Đổi MK
                  </button>
                  {u.role !== "admin" && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u)}>
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SAFETY RULES (CRUD 657+ RULES) */}
      {/* ========================================================================= */}
      {activeTab === "rules" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div className="card-title" style={{ margin: 0 }}>
              <span>🛡️ Quy tắc An toàn Thuốc Bộ Y Tế ({ruleTotal})</span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateRuleModal(true)}>
              ➕ Thêm quy tắc mới
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1, minWidth: 200 }}
              placeholder="🔍 Tìm theo mã rule (DD001, ALLER...), tên hoạt chất, mô tả..."
              value={ruleSearch}
              onChange={(e) => setRuleSearch(e.target.value)}
            />
            <select
              className="input"
              style={{ width: 160 }}
              value={ruleSeverityFilter}
              onChange={(e) => setRuleSeverityFilter(e.target.value)}
            >
              <option value="">Tất cả mức độ</option>
              <option value="high">Mức cao (Đỏ)</option>
              <option value="medium">Mức vừa (Vàng)</option>
              <option value="low">Mức thấp</option>
            </select>
            <select
              className="input"
              style={{ width: 170 }}
              value={ruleTypeFilter}
              onChange={(e) => setRuleTypeFilter(e.target.value)}
            >
              <option value="">Tất cả loại rule</option>
              <option value="drug_drug">Tương tác thuốc-thuốc</option>
              <option value="drug_allergy">Dị ứng thuốc</option>
              <option value="duplicate_ingredient">Trùng hoạt chất</option>
              <option value="drug_condition">Bệnh lý chống chỉ định</option>
            </select>
          </div>

          {rules.length === 0 && <EmptyState icon="🛡️" text="Không có quy tắc an toàn phù hợp." />}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rules.map((r) => (
              <div className="list-row" key={r.id} style={{ alignItems: "flex-start" }}>
                <div className="list-main">
                  <div className="list-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={SEVERITY_COLORS[r.severity] ?? "badge badge-neutral"}>{r.code}</span>
                    <span style={{ fontWeight: 700 }}>{r.title}</span>
                    <span className="badge badge-neutral" style={{ fontSize: 11 }}>{r.rule_type}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--text-primary)", marginTop: 6, lineHeight: 1.5 }}>
                    {r.message}
                  </div>
                  <div className="list-sub" style={{ marginTop: 4 }}>
                    Trạng thái: <b>{r.status === "approved" ? "Đã duyệt" : "Dự thảo"}</b> · Phê duyệt bởi: {r.approved_by || "—"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSelectedRule(r);
                      setRuleTitle(r.title);
                      setRuleMessage(r.message);
                      setRuleSeverity(r.severity);
                      setRuleStatus(r.status);
                      setRuleCondition(r.condition_json);
                      setShowEditRuleModal(true);
                    }}
                  >
                    ✏️ Sửa
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRule(r)}>
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CATALOG MANAGEMENT (INGREDIENTS & DRUGS) */}
      {/* ========================================================================= */}
      {activeTab === "catalog" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Active Ingredients Section */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div className="card-title" style={{ margin: 0 }}>
                <span>🧪 Danh mục Hoạt chất Dược (326+ Ingredients)</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddIngModal(true)}>
                ➕ Thêm hoạt chất mới
              </button>
            </div>

            <input
              type="text"
              className="input"
              style={{ width: "100%", marginBottom: 14 }}
              placeholder="🔍 Tra cứu tên hoạt chất (INN) hoặc mã ATC..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {ingredients.map((ing) => (
                <div
                  key={ing.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--border-default)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{ing.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{ing.atc_code ? `ATC: ${ing.atc_code}` : "Chưa có ATC"}</div>
                  </div>
                  <button className="btn btn-danger btn-sm" style={{ padding: "3px 8px" }} onClick={() => handleDeleteIngredient(ing)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Drugs Section */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div className="card-title" style={{ margin: 0 }}>
                <span>💊 Danh mục Biệt dược ({drugs.length})</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddDrugModal(true)}>
                ➕ Thêm biệt dược mới
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
              {drugs.map((d) => (
                <div
                  key={d.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--border-default)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {d.strength ? `${d.strength} · ` : ""}{d.form || "Dược phẩm"}
                    </div>
                  </div>
                  <button className="btn btn-danger btn-sm" style={{ padding: "3px 8px" }} onClick={() => handleDeleteDrug(d)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: AUDIT LOGS & EXPORT */}
      {/* ========================================================================= */}
      {activeTab === "audit" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div className="card-title" style={{ margin: 0 }}>
              <span>📜 Nhật ký Kiểm toán Bảo mật Hệ thống</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={exportAuditLogsJson}>
              📥 Xuất file JSON Báo cáo
            </button>
          </div>

          {/* Search & Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1, minWidth: 200 }}
              placeholder="🔍 Tìm theo username, hành động, chi tiết..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
            />
            <select
              className="input"
              style={{ width: 180 }}
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
            >
              <option value="">Tất cả hành động</option>
              <option value="create_user">create_user</option>
              <option value="set_user_active">set_user_active</option>
              <option value="reset_password">reset_password</option>
              <option value="create_safety_rule">create_safety_rule</option>
              <option value="test_ai">test_ai</option>
            </select>
          </div>

          {auditLogs.length === 0 && <EmptyState icon="📜" text="Chưa có sự kiện nào." />}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {auditLogs.map((e) => (
              <div className="list-row" key={e.id} style={{ alignItems: "center" }}>
                <div className="list-main">
                  <div className="list-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="badge badge-neutral" style={{ fontWeight: 700 }}>{e.action}</span>
                    <span>{e.username ?? "Hệ thống"}</span>
                    <span className="muted" style={{ fontSize: 12 }}>· {e.object_type}</span>
                  </div>
                  <div className="list-sub" style={{ marginTop: 2 }}>
                    {new Date(e.created_at).toLocaleString("vi-VN")}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE USER */}
      {/* ========================================================================= */}
      {showCreateUserModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="card-title">➕ Tạo mới Tài khoản Người dùng</div>
            <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="label">Tên đăng nhập (Username):</label>
                <input type="text" className="input" required value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="vd: dr_lan, bs_hung..." />
              </div>
              <div>
                <label className="label">Mật khẩu khởi tạo:</label>
                <input type="password" className="input" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" />
              </div>
              <div>
                <label className="label">Họ và tên đầy đủ:</label>
                <input type="text" className="input" required value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="vd: BS.CKII Nguyễn Văn A" />
              </div>
              <div>
                <label className="label">Vai trò y tế (Role):</label>
                <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v} ({k})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Số điện thoại liên hệ (Tùy chọn):</label>
                <input type="tel" className="input" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="09xxxxxxxx" />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateUserModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Xác nhận tạo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT USER */}
      {/* ========================================================================= */}
      {showEditUserModal && selectedUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 480, width: "100%" }}>
            <div className="card-title">✏️ Chỉnh sửa Tài khoản: {selectedUser.username}</div>
            <form onSubmit={handleUpdateUser} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="label">Họ và tên:</label>
                <input type="text" className="input" required value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
              </div>
              <div>
                <label className="label">Vai trò y tế:</label>
                <select className="input" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v} ({k})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Số điện thoại:</label>
                <input type="tel" className="input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditUserModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu thay đổi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RESET PASSWORD */}
      {/* ========================================================================= */}
      {showResetPwModal && selectedUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 420, width: "100%" }}>
            <div className="card-title">🔑 Đổi Mật khẩu: {selectedUser.username}</div>
            <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="label">Mật khẩu mới:</label>
                <input type="password" className="input" required minLength={6} value={resetPwInput} onChange={(e) => setResetPwInput(e.target.value)} placeholder="Nhập mật khẩu mới..." />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowResetPwModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Cập nhật mật khẩu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE RULE */}
      {/* ========================================================================= */}
      {showCreateRuleModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="card-title">➕ Thêm Quy tắc An toàn Thuốc mới</div>
            <form onSubmit={handleCreateRule} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="label">Mã quy tắc (Rule Code):</label>
                  <input type="text" className="input" required value={ruleCode} onChange={(e) => setRuleCode(e.target.value)} placeholder="vd: DD999, ALLER_X..." />
                </div>
                <div>
                  <label className="label">Mức độ cảnh báo:</label>
                  <select className="input" value={ruleSeverity} onChange={(e) => setRuleSeverity(e.target.value)}>
                    <option value="high">Mức cao (Đỏ - Chống chỉ định)</option>
                    <option value="medium">Mức vừa (Vàng - Thận trọng)</option>
                    <option value="low">Mức thấp (Xanh - Theo dõi)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Loại quy tắc (Rule Type):</label>
                <select className="input" value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
                  <option value="drug_drug">Tương tác thuốc-thuốc (drug_drug)</option>
                  <option value="drug_allergy">Dị ứng thuốc (drug_allergy)</option>
                  <option value="duplicate_ingredient">Trùng lặp hoạt chất (duplicate_ingredient)</option>
                  <option value="drug_condition">Bệnh lý chống chỉ định (drug_condition)</option>
                </select>
              </div>

              <div>
                <label className="label">Tên quy tắc ngắn gọn:</label>
                <input type="text" className="input" required value={ruleTitle} onChange={(e) => setRuleTitle(e.target.value)} placeholder="vd: Tương tác Paracetamol & Warfarin" />
              </div>

              <div>
                <label className="label">Nội dung cảnh báo chi tiết:</label>
                <textarea className="input" rows={3} required value={ruleMessage} onChange={(e) => setRuleMessage(e.target.value)} placeholder="Hậu quả và hướng xử trí lâm sàng..." />
              </div>

              <div>
                <label className="label">Điều kiện kích hoạt (Condition JSON):</label>
                <textarea className="input" rows={2} style={{ fontFamily: "monospace", fontSize: 12 }} value={ruleCondition} onChange={(e) => setRuleCondition(e.target.value)} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateRuleModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Thêm quy tắc</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT RULE */}
      {/* ========================================================================= */}
      {showEditRuleModal && selectedRule && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="card-title">✏️ Chỉnh sửa Quy tắc: {selectedRule.code}</div>
            <form onSubmit={handleUpdateRule} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="label">Tên quy tắc:</label>
                <input type="text" className="input" required value={ruleTitle} onChange={(e) => setRuleTitle(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="label">Mức độ:</label>
                  <select className="input" value={ruleSeverity} onChange={(e) => setRuleSeverity(e.target.value)}>
                    <option value="high">Mức cao (Đỏ)</option>
                    <option value="medium">Mức vừa (Vàng)</option>
                    <option value="low">Mức thấp</option>
                  </select>
                </div>
                <div>
                  <label className="label">Trạng thái duyệt:</label>
                  <select className="input" value={ruleStatus} onChange={(e) => setRuleStatus(e.target.value)}>
                    <option value="approved">Đã duyệt (Active)</option>
                    <option value="draft">Dự thảo (Draft)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Nội dung cảnh báo lâm sàng:</label>
                <textarea className="input" rows={3} required value={ruleMessage} onChange={(e) => setRuleMessage(e.target.value)} />
              </div>
              <div>
                <label className="label">Điều kiện kích hoạt (JSON):</label>
                <textarea className="input" rows={2} style={{ fontFamily: "monospace", fontSize: 12 }} value={ruleCondition} onChange={(e) => setRuleCondition(e.target.value)} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditRuleModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu thay đổi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD INGREDIENT */}
      {/* ========================================================================= */}
      {showAddIngModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 440, width: "100%" }}>
            <div className="card-title">🧪 Thêm Hoạt chất mới</div>
            <form onSubmit={handleAddIngredient} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="label">Tên hoạt chất (INN):</label>
                <input type="text" className="input" required value={ingName} onChange={(e) => setIngName(e.target.value)} placeholder="vd: METFORMIN, CEFUROXIME..." />
              </div>
              <div>
                <label className="label">Mã phân loại ATC (Tùy chọn):</label>
                <input type="text" className="input" value={ingAtc} onChange={(e) => setIngAtc(e.target.value)} placeholder="vd: A10BA02" />
              </div>
              <div>
                <label className="label">Ghi chú dược lý:</label>
                <input type="text" className="input" value={ingNotes} onChange={(e) => setIngNotes(e.target.value)} placeholder="vd: Nhóm Biguanide điều trị tiểu đường" />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddIngModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Thêm hoạt chất</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD DRUG */}
      {/* ========================================================================= */}
      {showAddDrugModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 440, width: "100%" }}>
            <div className="card-title">💊 Thêm Biệt dược mới</div>
            <form onSubmit={handleAddDrug} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="label">Tên biệt dược:</label>
                <input type="text" className="input" required value={drugName} onChange={(e) => setDrugName(e.target.value)} placeholder="vd: Panadol Extra, Augmentin..." />
              </div>
              <div>
                <label className="label">Hàm lượng:</label>
                <input type="text" className="input" value={drugStrength} onChange={(e) => setDrugStrength(e.target.value)} placeholder="vd: 500mg/65mg" />
              </div>
              <div>
                <label className="label">Dạng bào chế:</label>
                <input type="text" className="input" value={drugForm} onChange={(e) => setDrugForm(e.target.value)} placeholder="vd: Viên nén, Gói bột, Ống tiêm..." />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddDrugModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Thêm biệt dược</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
