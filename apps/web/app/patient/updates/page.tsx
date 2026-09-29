"use client";

/**
 * Cập nhật diễn biến + Đối soát thuốc (tài liệu CHI TIẾT mục 2, 5):
 * - Khai thuốc từ MỌI nguồn (BV kê, BV khác, tự mua, OTC, TPCN, đông y) kèm ảnh toa/bao bì.
 * - Mọi khai báo gắn nhãn "chưa xác minh" — chờ bác sĩ xác nhận mới vào hồ sơ chính thức.
 * - Gửi triệu chứng kèm ảnh tổn thương da.
 */
import { useEffect, useState } from "react";
import { api, getToken } from "../../../lib/api";
import { AppShell, EmptyState, ErrorBox, SuccessBox, VerifiedBadge } from "../../../components/ui";

interface Profile {
  id: string;
  full_name: string;
}
interface Medication {
  id: string;
  raw_name: string;
  is_current: boolean;
  is_planned: boolean;
  dose?: string | null;
  frequency: string | null;
  timing: string | null;
  prescriber?: string | null;
  source_label: string | null;
  status: string;
  stop_reason: string | null;
  image_url: string | null;
  verification: string;
}
interface Observation {
  id: string;
  kind: string;
  label: string;
  value: string | null;
  unit: string | null;
  occurred_at: string;
  image_url: string | null;
  status: string;
  verification: string;
}

const STATUS_LABEL: Record<string, { badge: string; text: string }> = {
  sent: { badge: "badge badge-info", text: "Đã gửi" },
  seen: { badge: "badge badge-ok", text: "Bác sĩ đã xem" },
  responded: { badge: "badge badge-ok", text: "Đã có phản hồi" },
};

const MED_SOURCES = [
  "Bệnh viện Thống Nhất kê",
  "Bệnh viện/phòng khám khác",
  "Tự mua",
  "Thuốc không kê đơn (OTC)",
  "Thực phẩm chức năng",
  "Đông y/thảo dược",
];

const MED_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Đang dùng", cls: "badge badge-ok" },
  stopped: { label: "Đã ngừng", cls: "badge badge-neutral" },
  irregular: { label: "Dùng không đều", cls: "badge badge-warning" },
};

export default function PatientUpdates() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [obs, setObs] = useState<Observation[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // form thuốc (đối soát)
  const [medName, setMedName] = useState("");
  const [medSource, setMedSource] = useState(MED_SOURCES[0]);
  const [medDose, setMedDose] = useState("");
  const [medTiming, setMedTiming] = useState("");
  const [medStatus, setMedStatus] = useState("active");
  // form triệu chứng
  const [symptomLabel, setSymptomLabel] = useState("");
  const [symptomTime, setSymptomTime] = useState("");
  const [symptomImage, setSymptomImage] = useState("");

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    reload();
  }, []);

  async function reload() {
    try {
      const p = await api<Profile>("/v1/patients/me/profile");
      setProfile(p);
      setMeds(await api<Medication[]>(`/v1/patients/${p.id}/medications`));
      setObs(await api<Observation[]>(`/v1/patients/${p.id}/observations`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
    }
  }

  async function addMedication(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!profile) return;
    try {
      await api(`/v1/patients/${profile.id}/medications`, {
        method: "POST",
        body: {
          raw_name: medName,
          is_current: medStatus !== "stopped",
          status: medStatus,
          dose: medDose || null,
          timing: medTiming || null,
          source_label: medSource,
          prescriber: medSource,
        },
      });
      setMedName("");
      setMedDose("");
      setMedTiming("");
      setSuccess("Đã ghi nhận thuốc. Bác sĩ sẽ kiểm tra và đối soát trong hồ sơ của bạn.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được khai báo");
    }
  }

  async function stopMed(medId: string) {
    const reason = window.prompt("Lý do ngừng thuốc (VD: hết thuốc / bị ngứa / bác sĩ bảo ngừng):");
    if (reason === null) return;
    if (!profile) return;
    try {
      await api(`/v1/patients/${profile.id}/medications/${medId}/stop?reason=${encodeURIComponent(reason)}`, {
        method: "POST",
      });
      setSuccess("Đã ghi nhận ngừng thuốc.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được");
    }
  }

  async function addObservation(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!profile) return;
    try {
      await api(`/v1/patients/${profile.id}/observations`, {
        method: "POST",
        body: {
          kind: "symptom",
          label: symptomLabel,
          occurred_at: symptomTime,
          image_url: symptomImage || null,
        },
      });
      setSymptomLabel("");
      setSymptomTime("");
      setSymptomImage("");
      setSuccess("Đã gửi triệu chứng. Bác sĩ phụ trách sẽ xem.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được triệu chứng");
    }
  }

  // Phân loại thuốc: Do Bác sĩ kê vs Bệnh nhân tự khai
  const isDoctorPrescribed = (m: Medication) => {
    if (m.verification === "verified" || m.is_planned) return true;
    if (m.prescriber && m.prescriber.trim().length > 0) return true;
    if (m.source_label) {
      const s = m.source_label.toLowerCase();
      if (s.includes("bệnh viện") || s.includes("bác sĩ") || s.includes("bv") || s.includes("chỉ định") || s.includes("kê")) {
        return true;
      }
      if (s.includes("tự mua") || s.includes("otc") || s.includes("thực phẩm") || s.includes("đông y") || s.includes("người bệnh")) {
        return false;
      }
    }
    return true;
  };

  const doctorPrescribedMeds = meds.filter(isDoctorPrescribed);
  const selfDeclaredMeds = meds.filter((m) => !isDoctorPrescribed(m));

  return (
    <AppShell
      role="patient"
      icon="📝"
      title="Cập nhật diễn biến & Danh mục thuốc"
      subtitle="Xem đơn thuốc bác sĩ kê, tự khai thuốc từ các nguồn khác và báo triệu chứng"
    >
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      {/* SECTION 1: ĐƠN THUỐC DO BÁC SĨ KÊ */}
      <div className="card" style={{ borderLeft: "4px solid var(--brand-primary, #0284C7)", marginBottom: 16 }}>
        <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>🩺 Đơn thuốc Bác sĩ kê cho bạn ({doctorPrescribedMeds.length})</span>
          <span className="badge badge-ok">Đã duyệt chính thức</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Đây là danh sách các loại thuốc bạn đang được Bác sĩ phụ trách kê đơn và chỉ định điều trị tại Bệnh viện.
        </p>

        {doctorPrescribedMeds.length === 0 && (
          <EmptyState icon="🩺" text="Hiện chưa có thuốc nào do Bác sĩ kê trong đợt này." />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {doctorPrescribedMeds.map((m) => {
            const st = MED_STATUS[m.status] ?? MED_STATUS.active;
            return (
              <div
                className="list-row"
                key={m.id}
                style={{
                  background: m.status === "active" ? "#F0FDF4" : "#F8FAFC",
                  borderColor: m.status === "active" ? "#BBF7D0" : "var(--border-default)",
                  alignItems: "center",
                }}
              >
                <div className="list-main">
                  <div className="list-title" style={{ color: "#166534", fontWeight: 700, fontSize: 15 }}>
                    💊 {m.raw_name}
                  </div>
                  <div className="list-sub" style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <span>🏥 <strong>{m.prescriber || m.source_label || "Bác sĩ phụ trách kê"}</strong></span>
                    {m.timing && <span>⏰ {m.timing}</span>}
                    {m.frequency && <span>🔄 {m.frequency}</span>}
                    {m.status === "stopped" && m.stop_reason && <span style={{ color: "var(--brand-danger)" }}>🛑 Đã ngừng: {m.stop_reason}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={st.cls}>{st.label}</span>
                  <VerifiedBadge verification={m.verification} />
                  {m.status !== "stopped" && (
                    <button className="btn btn-secondary btn-sm" onClick={() => stopMed(m.id)}>
                      Ngừng thuốc
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: KHAI BÁO & ĐỐI SOÁT THUỐC TỰ MUA / NGOÀI BV */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          <span className="t-ico">📋</span> Đối soát thuốc — Khai báo thuốc dùng thêm
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Nếu bạn đang dùng thêm thuốc từ nguồn khác (bệnh viện khác, tự mua, thuốc không kê đơn OTC, thực phẩm chức năng, đông y/thảo dược), hãy khai báo tại đây để hệ thống tự động kiểm tra tương tác thuốc và dị ứng.
        </p>

        <form onSubmit={addMedication}>
          <div className="field">
            <label className="label">Tên thuốc đang dùng thêm</label>
            <input
              className="input"
              placeholder="VD: Panadol Extra 500mg, Glucosamine, Hoạt huyết dưỡng não..."
              value={medName}
              onChange={(e) => setMedName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label">Nguồn gốc thuốc</label>
            <select className="input" value={medSource} onChange={(e) => setMedSource(e.target.value)}>
              {MED_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Liều dùng (VD: 1 viên/lần)</label>
            <input
              className="input"
              placeholder="VD: 1 viên/lần, ngày 2 lần"
              value={medDose}
              onChange={(e) => setMedDose(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Thời điểm uống (VD: 8h sáng sau ăn)</label>
            <input
              className="input"
              placeholder="VD: Sau bữa ăn sáng và tối"
              value={medTiming}
              onChange={(e) => setMedTiming(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Trạng thái sử dụng</label>
            <select className="input" value={medStatus} onChange={(e) => setMedStatus(e.target.value)}>
              <option value="active">Đang dùng</option>
              <option value="irregular">Dùng không đều</option>
              <option value="stopped">Đã ngừng</option>
            </select>
          </div>
          <button className="btn btn-primary">➕ Gửi khai báo thuốc</button>
        </form>

        <div className="mt16">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: "var(--text-secondary)" }}>
            Danh sách thuốc bạn đã tự khai báo ({selfDeclaredMeds.length}):
          </div>
          {selfDeclaredMeds.length === 0 && <EmptyState icon="💊" text="Bạn chưa tự khai báo thuốc nào." />}
          {selfDeclaredMeds.map((m) => {
            const st = MED_STATUS[m.status] ?? MED_STATUS.active;
            return (
              <div className="list-row" key={m.id}>
                <div className="list-main">
                  <div className="list-title">{m.raw_name}</div>
                  <div className="list-sub">
                    {m.source_label ?? "Tự khai báo"}
                    {m.timing ? ` · ${m.timing}` : ""}
                    {m.frequency ? ` · ${m.frequency}` : ""}
                    {m.status === "stopped" && m.stop_reason ? ` · Đã ngừng: ${m.stop_reason}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={st.cls}>{st.label}</span>
                  <VerifiedBadge verification={m.verification} />
                  {m.status !== "stopped" && (
                    <button className="btn btn-secondary btn-sm" onClick={() => stopMed(m.id)}>
                      Ngừng
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span className="t-ico">🩺</span> Báo triệu chứng kèm ảnh tổn thương
        </div>
        <form onSubmit={addObservation}>
          <div className="field">
            <label className="label">Triệu chứng</label>
            <input
              className="input"
              placeholder="VD: Vết rash ở cẳng chân lan rộng"
              value={symptomLabel}
              onChange={(e) => setSymptomLabel(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label">Thời điểm xuất hiện</label>
            <input
              className="input"
              type="datetime-local"
              value={symptomTime}
              onChange={(e) => setSymptomTime(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label">Ảnh tổn thương da (demo — nhập tên file)</label>
            <input
              className="input"
              placeholder="VD: anh-tot-thuong-01.jpg"
              value={symptomImage}
              onChange={(e) => setSymptomImage(e.target.value)}
            />
          </div>
          <button className="btn btn-primary">Gửi báo cáo</button>
        </form>
        <div className="mt16">
          {obs.length === 0 && <EmptyState icon="🩺" text="Chưa có cập nhật nào." />}
          {obs.map((o) => {
            const st = STATUS_LABEL[o.status] ?? STATUS_LABEL.sent;
            return (
              <div className="list-row" key={o.id}>
                <div className="list-main">
                  <div className="list-title">
                    {o.label} {o.image_url && <span title="Có ảnh tổn thương">📷</span>}
                  </div>
                  <div className="list-sub">
                    {o.occurred_at} ·{" "}
                    {o.kind === "lab" ? `Xét nghiệm: ${o.value ?? ""} ${o.unit ?? ""}` : "Triệu chứng"}
                  </div>
                </div>
                <span className={st.badge}>{st.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
