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
  frequency: string | null;
  timing: string | null;
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
  const [medImage, setMedImage] = useState("");
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
          image_url: medImage || null,
          source_label: medSource,
          prescriber: medSource,
        },
      });
      setMedName("");
      setMedDose("");
      setMedTiming("");
      setMedImage("");
      setSuccess("Đã ghi nhận thuốc. Bác sĩ sẽ kiểm tra và xác nhận trước khi vào hồ sơ chính thức.");
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

  return (
    <AppShell
      role="patient"
      icon="📝"
      title="Cập nhật diễn biến"
      subtitle="Khai thuốc từ mọi nguồn, báo triệu chứng kèm ảnh — bác sĩ sẽ xem và xác minh"
    >
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      <div className="card">
        <div className="card-title">
          <span className="t-ico">💊</span> Đối soát thuốc — khai TẤT CẢ thuốc đang dùng
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Ghi nhận đủ mọi nguồn: bệnh viện kê, bệnh viện khác, tự mua, không kê đơn, thực phẩm
          chức năng, đông y — kèm ảnh toa/bao bì nếu có. Việc này giúp bác sĩ phát hiện trùng
          thuốc, tương tác và dị ứng.
        </p>
        <form onSubmit={addMedication}>
          <div className="field">
            <label className="label">Tên thuốc</label>
            <input
              className="input"
              placeholder="VD: Panadol Extra 500mg / Viên bổ khớp (không rõ tên)"
              value={medName}
              onChange={(e) => setMedName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label">Nguồn thuốc</label>
            <select className="input" value={medSource} onChange={(e) => setMedSource(e.target.value)}>
              {MED_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Liều / cách dùng (không bắt buộc)</label>
            <input
              className="input"
              placeholder="VD: 1 viên/ngày"
              value={medDose}
              onChange={(e) => setMedDose(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Thời điểm uống (không bắt buộc)</label>
            <input
              className="input"
              placeholder="VD: 8h và 20h"
              value={medTiming}
              onChange={(e) => setMedTiming(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Ảnh toa/bao bì (demo — nhập tên file)</label>
            <input
              className="input"
              placeholder="VD: toa-thuoc-01.jpg"
              value={medImage}
              onChange={(e) => setMedImage(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Trạng thái</label>
            <select className="input" value={medStatus} onChange={(e) => setMedStatus(e.target.value)}>
              <option value="active">Đang dùng</option>
              <option value="irregular">Dùng không đều</option>
              <option value="stopped">Đã ngừng</option>
            </select>
          </div>
          <button className="btn btn-primary">Gửi khai báo</button>
        </form>

        <div className="mt16">
          {meds.length === 0 && <EmptyState icon="💊" text="Chưa khai báo thuốc nào." />}
          {meds.map((m) => {
            const st = MED_STATUS[m.status] ?? MED_STATUS.active;
            return (
              <div className="list-row" key={m.id}>
                <div className="list-main">
                  <div className="list-title">
                    {m.raw_name} {m.image_url && <span title="Có ảnh toa">📷</span>}
                  </div>
                  <div className="list-sub">
                    {m.source_label ?? "Không rõ nguồn"}
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
