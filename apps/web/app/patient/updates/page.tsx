"use client";

/**
 * Cập nhật diễn biến + Đối soát thuốc (tài liệu CHI TIẾT mục 2, 5):
 * - Khai thuốc từ MỌI nguồn (BV kê, BV khác, tự mua, OTC, TPCN, đông y) kèm ảnh toa/bao bì.
 * - Mọi khai báo gắn nhãn "chưa xác minh" — chờ bác sĩ xác nhận mới vào hồ sơ chính thức.
 * - Gửi triệu chứng kèm ảnh tổn thương da.
 */
import { useEffect, useRef, useState } from "react";
import { api, getToken, uploadFile } from "../../../lib/api";
import { AppShell, EmptyState, ErrorBox, SuccessBox, VerifiedBadge } from "../../../components/ui";
import { TreatmentTimeline } from "../../../components/TreatmentTimeline";

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
  const [medImage, setMedImage] = useState("");
  const [medImagePreview, setMedImagePreview] = useState<string | null>(null);
  const [uploadingMedImage, setUploadingMedImage] = useState(false);

  // form triệu chứng
  const [symptomLabel, setSymptomLabel] = useState("");
  const [symptomTime, setSymptomTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [symptomImage, setSymptomImage] = useState("");
  const [symptomImagePreview, setSymptomImagePreview] = useState<string | null>(null);
  const [uploadingSymptomImage, setUploadingSymptomImage] = useState(false);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  const symptomFileInputRef = useRef<HTMLInputElement>(null);
  const medFileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleSymptomFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WEBP, GIF, HEIC).");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSymptomImagePreview(objectUrl);
    setUploadingSymptomImage(true);
    setError("");

    try {
      const res = await uploadFile(file);
      setSymptomImage(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải ảnh lên máy chủ");
      setSymptomImagePreview(null);
      setSymptomImage("");
    } finally {
      setUploadingSymptomImage(false);
    }
  }

  function removeSymptomImage() {
    setSymptomImage("");
    setSymptomImagePreview(null);
    if (symptomFileInputRef.current) {
      symptomFileInputRef.current.value = "";
    }
  }

  async function handleMedFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WEBP, GIF, HEIC).");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setMedImagePreview(objectUrl);
    setUploadingMedImage(true);
    setError("");

    try {
      const res = await uploadFile(file);
      setMedImage(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải ảnh toa thuốc lên máy chủ");
      setMedImagePreview(null);
      setMedImage("");
    } finally {
      setUploadingMedImage(false);
    }
  }

  function removeMedImage() {
    setMedImage("");
    setMedImagePreview(null);
    if (medFileInputRef.current) {
      medFileInputRef.current.value = "";
    }
  }

  async function addMedication(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!profile) return;
    if (uploadingMedImage) {
      setError("Đang tải ảnh toa/bao bì thuốc lên, vui lòng đợi trong giây lát...");
      return;
    }
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
          image_url: medImage || null,
        },
      });
      setMedName("");
      setMedDose("");
      setMedTiming("");
      setMedImage("");
      setMedImagePreview(null);
      if (medFileInputRef.current) {
        medFileInputRef.current.value = "";
      }
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
    if (uploadingSymptomImage) {
      setError("Đang tải ảnh tổn thương lên, vui lòng đợi trong giây lát...");
      return;
    }
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
      setSymptomImage("");
      setSymptomImagePreview(null);
      if (symptomFileInputRef.current) {
        symptomFileInputRef.current.value = "";
      }
      setSuccess("Đã gửi triệu chứng và hình ảnh tổn thương thành công. Bác sĩ phụ trách sẽ xem.");
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

      {/* CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ & LOẠI BỆNH ĐANG ĐIỀU TRỊ */}
      {profile?.id && (
        <TreatmentTimeline
          profileId={profile.id}
          isDoctor={false}
          onRefresh={reload}
        />
      )}

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

          {/* UPLOAD ẢNH TOA / BAO BÌ THUỐC */}
          <div className="field">
            <label className="label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📷 Ảnh toa thuốc / Bao bì thuốc (tuỳ chọn)</span>
              {medImagePreview && (
                <span style={{ fontSize: 12, color: uploadingMedImage ? "#0284c7" : "#16a34a", fontWeight: 600 }}>
                  {uploadingMedImage ? "⏳ Đang tải ảnh..." : "✓ Đã tải ảnh xong"}
                </span>
              )}
            </label>
            <input
              ref={medFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleMedFileChange}
            />
            {!medImagePreview ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ width: "100%", padding: "10px", borderStyle: "dashed", borderColor: "#cbd5e1" }}
                onClick={() => medFileInputRef.current?.click()}
              >
                📸 Chọn ảnh chụp toa thuốc hoặc vỏ hộp thuốc từ máy
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: "#f8fafc",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                }}
              >
                <img
                  src={medImagePreview}
                  alt="Ảnh thuốc"
                  style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, cursor: "pointer" }}
                  onClick={() => setPreviewModalUrl(medImagePreview)}
                />
                <span style={{ fontSize: 12, flex: 1, color: "#334155" }}>
                  {uploadingMedImage ? "Đang tải lên..." : "Đã đính kèm ảnh toa/bao bì"}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 12, color: "#dc2626" }}
                  onClick={removeMedImage}
                >
                  ✕ Xoá
                </button>
              </div>
            )}
          </div>

          <button className="btn btn-primary" disabled={uploadingMedImage}>
            {uploadingMedImage ? "⏳ Đang tải ảnh..." : "➕ Gửi khai báo thuốc"}
          </button>
        </form>

        <div className="mt16">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: "var(--text-secondary)" }}>
            Danh sách thuốc bạn đã tự khai báo ({selfDeclaredMeds.length}):
          </div>
          {selfDeclaredMeds.length === 0 && <EmptyState icon="💊" text="Bạn chưa tự khai báo thuốc nào." />}
          {selfDeclaredMeds.map((m) => {
            const st = MED_STATUS[m.status] ?? MED_STATUS.active;
            return (
              <div className="list-row" key={m.id} style={{ alignItems: "center" }}>
                {m.image_url ? (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      overflow: "hidden",
                      border: "1px solid #cbd5e1",
                      flexShrink: 0,
                      cursor: "pointer",
                      backgroundColor: "#f1f5f9",
                    }}
                    onClick={() => setPreviewModalUrl(m.image_url)}
                    title="Bấm để xem ảnh phóng to"
                  >
                    <img
                      src={m.image_url}
                      alt="Ảnh thuốc"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ) : null}
                <div className="list-main">
                  <div className="list-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{m.raw_name}</span>
                    {m.image_url && (
                      <button
                        type="button"
                        onClick={() => setPreviewModalUrl(m.image_url)}
                        className="badge badge-info"
                        style={{ border: "none", cursor: "pointer", fontSize: 11, padding: "2px 6px" }}
                      >
                        📷 Có ảnh
                      </button>
                    )}
                  </div>
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

      {/* SECTION 3: BÁO TRIỆU CHỨNG KÈM ẢNH TỔN THƯƠNG */}
      <div className="card">
        <div className="card-title">
          <span className="t-ico">🩺</span> Báo triệu chứng kèm ảnh tổn thương
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
          Gửi mô tả triệu chứng bất thường và tải lên hình ảnh chụp tổn thương da để Bác sĩ theo dõi và đánh giá kịp thời.
        </p>
        <form onSubmit={addObservation}>
          <div className="field">
            <label className="label">Triệu chứng</label>
            <input
              className="input"
              placeholder="VD: Vết rash ở cẳng chân lan rộng, ngứa rát..."
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

          {/* UPLOAD ẢNH TỔN THƯƠNG DA TRỰC TIẾP */}
          <div className="field">
            <label className="label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📷 Ảnh tổn thương da</span>
              {symptomImagePreview && (
                <span style={{ fontSize: 12, color: uploadingSymptomImage ? "#0284c7" : "#16a34a", fontWeight: 600 }}>
                  {uploadingSymptomImage ? "⏳ Đang tải ảnh lên..." : "✓ Đã tải ảnh lên thành công"}
                </span>
              )}
            </label>

            <input
              ref={symptomFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleSymptomFileChange}
            />

            {!symptomImagePreview ? (
              <div
                onClick={() => symptomFileInputRef.current?.click()}
                style={{
                  border: "2px dashed #cbd5e1",
                  borderRadius: 14,
                  padding: "24px 16px",
                  textAlign: "center",
                  backgroundColor: "#f8fafc",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#0284c7";
                  e.currentTarget.style.backgroundColor = "#f0f9ff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#cbd5e1";
                  e.currentTarget.style.backgroundColor = "#f8fafc";
                }}
              >
                <div style={{ fontSize: 32 }}>📸</div>
                <div style={{ fontWeight: 600, color: "#0284c7", fontSize: 14 }}>
                  Bấm để chọn ảnh tổn thương từ máy hoặc chụp ảnh
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Hỗ trợ định dạng: JPG, PNG, WEBP, GIF, HEIC (Tối đa 15MB)
                </div>
              </div>
            ) : (
              <div
                style={{
                  position: "relative",
                  borderRadius: 14,
                  border: "1px solid #bae6fd",
                  backgroundColor: "#f0f9ff",
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: 72,
                    height: 72,
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid #cbd5e1",
                    flexShrink: 0,
                    backgroundColor: "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => setPreviewModalUrl(symptomImagePreview)}
                  title="Bấm để xem ảnh phóng to"
                >
                  <img
                    src={symptomImagePreview}
                    alt="Ảnh tổn thương xem trước"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  {uploadingSymptomImage && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: "rgba(0,0,0,0.4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: 18,
                      }}
                    >
                      ⏳
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: "#0f172a", wordBreak: "break-all" }}>
                    {uploadingSymptomImage ? "Đang tải ảnh lên máy chủ..." : "Ảnh tổn thương đã sẵn sàng"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {symptomImage ? "Đã lưu trữ an toàn trên hệ thống" : "Đang xử lý..."}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 12, padding: "3px 10px" }}
                      onClick={() => setPreviewModalUrl(symptomImagePreview)}
                    >
                      🔍 Xem phóng to
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 12, padding: "3px 10px", color: "#dc2626" }}
                      onClick={removeSymptomImage}
                    >
                      ✕ Chọn ảnh khác
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button className="btn btn-primary" disabled={uploadingSymptomImage} style={{ marginTop: 8 }}>
            {uploadingSymptomImage ? "⏳ Đang tải ảnh..." : "📤 Gửi báo cáo"}
          </button>
        </form>

        <div className="mt16">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: "var(--text-secondary)" }}>
            Nhật ký diễn biến & triệu chứng ({obs.length}):
          </div>
          {obs.length === 0 && <EmptyState icon="🩺" text="Chưa có cập nhật nào." />}
          {obs.map((o) => {
            const st = STATUS_LABEL[o.status] ?? STATUS_LABEL.sent;
            return (
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
                    onClick={() => setPreviewModalUrl(o.image_url)}
                    title="Bấm để xem ảnh phóng to"
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
                        onClick={() => setPreviewModalUrl(o.image_url)}
                        className="badge badge-info"
                        style={{ border: "none", cursor: "pointer", fontSize: 11, padding: "2px 6px" }}
                      >
                        📷 Có ảnh tổn thương
                      </button>
                    )}
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

      {/* POPUP MODAL PHÓNG TO ẢNH */}
      {previewModalUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(15, 23, 42, 0.8)",
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
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
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
                📷 Ảnh chụp tổn thương da / Toa thuốc
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
                alt="Ảnh phóng to"
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
    </AppShell>
  );
}
