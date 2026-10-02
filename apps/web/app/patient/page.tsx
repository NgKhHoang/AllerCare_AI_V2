"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getToken } from "../../lib/api";
import { AppShell, EmergencyBanner } from "../../components/ui";
import { TreatmentTimeline } from "../../components/TreatmentTimeline";

interface Profile {
  id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  assigned_doctor_id: string | null;
}

const QUICK_CHIPS = [
  { id: "stable", label: "🟢 Ổn định / Đỡ ngứa / Giảm đỏ", type: "success" },
  { id: "mild_itch", label: "🟡 Còn ngứa nhẹ / Da hơi khô rát", type: "warning" },
  { id: "severe_itch", label: "🔴 Ngứa nhiều / Ban đỏ lan rộng", type: "danger" },
  { id: "blister", label: "⚠️ Có mụn nước / Phù nề / Chảy dịch", type: "danger" },
  { id: "dry_flake", label: "❄️ Khô rát / Tróc vảy da", type: "warning" },
  { id: "side_effect", label: "🤢 Tác dụng phụ: Buồn nôn / Mệt mỏi", type: "warning" },
];

// Web Audio API Synthesizer cho chuông báo thức y tế êm dịu
function playAlarmChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (chime)
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.18);
      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.18);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + idx * 0.18 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.18 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.18);
      osc.stop(ctx.currentTime + idx * 0.18 + 0.5);
    });
  } catch {
    // AudioContext not allowed before user interaction
  }
}

export default function PatientHome() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  // Daily Routine & Medicine Reminder State (10.3)
  const [isTodayCheckedIn, setIsTodayCheckedIn] = useState(false);
  const [hasTakenMeds, setHasTakenMeds] = useState(false);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [dailyNote, setDailyNote] = useState("");
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [checkInSuccessMsg, setCheckInSuccessMsg] = useState("");
  const [alarmPlaying, setAlarmPlaying] = useState(false);
  const [alarmTime, setAlarmTime] = useState("07:30");
  const [snoozeUntil, setSnoozeUntil] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");

  function toggleChip(label: string) {
    setSelectedChips((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]
    );
  }

  function handleSnooze() {
    const nextTime = new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setSnoozeUntil(nextTime);
    setAlarmPlaying(false);
  }

  function toggleAlarmSound() {
    if (!alarmPlaying) {
      setAlarmPlaying(true);
      playAlarmChime();
    } else {
      setAlarmPlaying(false);
    }
  }

  async function requestNotification() {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
        if (perm === "granted") {
          new Notification("AllerCare AI — Báo thức nhắc thuốc", {
            body: "Đã kích hoạt chế độ nhắc nhở uống thuốc đúng giờ mỗi sáng!",
            icon: "/favicon.ico",
          });
        }
      } catch {
        // Notification permission request failed
      }
    }
  }

  async function handleDailyCheckInSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasTakenMeds && selectedChips.length === 0 && !dailyNote.trim()) {
      alert("Vui lòng xác nhận uống thuốc hoặc chọn ít nhất 1 tình trạng lâm sàng");
      return;
    }

    try {
      setSubmittingCheckIn(true);
      const combinedMessage = [
        hasTakenMeds ? "✓ Đã uống đủ thuốc theo đơn sáng nay." : "Chưa uống thuốc.",
        selectedChips.length > 0 ? `Tình trạng ghi nhận: ${selectedChips.join("; ")}.` : "",
        dailyNote.trim() ? `Ghi chú chi tiết: ${dailyNote.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      await api("/v1/triage", {
        method: "POST",
        body: { message: combinedMessage },
      });

      const todayStr = new Date().toISOString().slice(0, 10);
      if (profile?.id) {
        localStorage.setItem(`allercare_checkin_${profile.id}_${todayStr}`, "true");
      }
      setIsTodayCheckedIn(true);
      setCheckInSuccessMsg("Đã gửi báo cáo ngày thành công! Bác sĩ điều trị đã nhận được tín hiệu cập nhật.");
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi gửi cập nhật");
    } finally {
      setSubmittingCheckIn(false);
    }
  }

  async function reload() {
    try {
      const p = await api<Profile>("/v1/patients/me/profile");
      setProfile(p);
      if (p?.id) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const saved = localStorage.getItem(`allercare_checkin_${p.id}_${todayStr}`);
        const triageSaved = localStorage.getItem(`allercare_triage_done_${todayStr}`);
        if (saved === "true" || triageSaved === "true") {
          setIsTodayCheckedIn(true);
          setHasTakenMeds(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được hồ sơ");
    }
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission);
    }
    void reload();
  }, []);

  if (!profile && !error) {
    return (
      <main className="login-wrap">
        <div style={{ textAlign: "center" }}>
          <div className="brand-dot" style={{ margin: "0 auto 12px" }}>🛡️</div>
          <p className="muted">Đang tải hồ sơ thông minh…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="login-wrap">
        <div className="login-card">
          <div className="brand-dot">🛡️</div>
          <p className="error-text" style={{ textAlign: "center" }}>
            {error}
          </p>
          <a className="btn btn-primary" href="/login" style={{ width: "100%", marginTop: 14 }}>
            Về trang đăng nhập
          </a>
        </div>
      </main>
    );
  }

  return (
    <AppShell
      role="patient"
      icon="👋"
      title={`Xin chào, ${profile?.full_name}`}
      subtitle="Trung tâm theo dõi an toàn thuốc & Trợ lý Gemini AI cá thể hóa"
    >
      <EmergencyBanner />

      <PatientAlarmCard
        isTodayCheckedIn={isTodayCheckedIn}
        checkInSuccessMsg={checkInSuccessMsg}
        alarmTime={alarmTime}
        setAlarmTime={setAlarmTime}
        notifPermission={notifPermission}
        requestNotification={requestNotification}
        alarmPlaying={alarmPlaying}
        toggleAlarmSound={toggleAlarmSound}
        handleSnooze={handleSnooze}
        snoozeUntil={snoozeUntil}
        setIsTodayCheckedIn={setIsTodayCheckedIn}
        handleDailyCheckInSubmit={handleDailyCheckInSubmit}
        hasTakenMeds={hasTakenMeds}
        setHasTakenMeds={setHasTakenMeds}
        selectedChips={selectedChips}
        toggleChip={toggleChip}
        dailyNote={dailyNote}
        setDailyNote={setDailyNote}
        submittingCheckIn={submittingCheckIn}
      />

      <PatientNavTiles isTodayCheckedIn={isTodayCheckedIn} />

      {/* CÂY TIMELINE QUÁ TRÌNH ĐIỀU TRỊ, CÁC LOẠI BỆNH & TIỀN SỬ DỊ ỨNG */}
      {profile?.id && (
        <TreatmentTimeline
          profileId={profile.id}
          isDoctor={false}
          onRefresh={reload}
        />
      )}

      {/* Nguyên tắc an toàn sử dụng thuốc tinh gọn */}
      <div className="card" style={{ borderLeft: "4px solid var(--brand-500)", marginTop: 10 }}>
        <div className="card-title">
          <span className="t-ico">🛡️</span> Nguyên tắc an toàn sử dụng thuốc
        </div>
        <ul style={{ paddingLeft: 20, color: "var(--text-secondary)", lineHeight: 1.8, fontSize: 13.5, margin: 0 }}>
          <li>Uống thuốc đúng liều lượng và thời điểm bác sĩ hướng dẫn; không tự ý ngừng hoặc đổi liều.</li>
          <li>Khi quên liều: <strong>Tuyệt đối không uống gấp đôi</strong> ở lần tiếp theo để bù liều.</li>
          <li>Khi gặp triệu chứng khó thở, sưng môi lưỡi hoặc nổi mày đay cấp: <strong>Gọi ngay 115</strong> hoặc Hotline cấp cứu <strong>+84 98 1224426</strong>.</li>
        </ul>
      </div>
    </AppShell>
  );
}

function getChipSelectedClass(type: string): string {
  if (type === "danger") return "selected-danger";
  if (type === "warning") return "selected-warning";
  if (type === "success") return "selected-success";
  return "selected";
}

interface PatientAlarmCardProps {
  isTodayCheckedIn: boolean;
  checkInSuccessMsg: string;
  alarmTime: string;
  setAlarmTime: (v: string) => void;
  notifPermission: NotificationPermission;
  requestNotification: () => Promise<void>;
  alarmPlaying: boolean;
  toggleAlarmSound: () => void;
  handleSnooze: () => void;
  snoozeUntil: string | null;
  setIsTodayCheckedIn: (v: boolean) => void;
  handleDailyCheckInSubmit: (e: React.FormEvent) => Promise<void>;
  hasTakenMeds: boolean;
  setHasTakenMeds: (v: boolean) => void;
  selectedChips: string[];
  toggleChip: (label: string) => void;
  dailyNote: string;
  setDailyNote: (v: string) => void;
  submittingCheckIn: boolean;
}

function PatientAlarmCard(props: Readonly<PatientAlarmCardProps>) {
  const {
    isTodayCheckedIn,
    checkInSuccessMsg,
    alarmTime,
    setAlarmTime,
    notifPermission,
    requestNotification,
    alarmPlaying,
    toggleAlarmSound,
    handleSnooze,
    snoozeUntil,
    setIsTodayCheckedIn,
    handleDailyCheckInSubmit,
    hasTakenMeds,
    setHasTakenMeds,
    selectedChips,
    toggleChip,
    dailyNote,
    setDailyNote,
    submittingCheckIn,
  } = props;

  return (
    <div
      className={`card ${!isTodayCheckedIn ? "pulse-red-alert" : ""}`}
      style={{
        marginBottom: 20,
        background: isTodayCheckedIn
          ? "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)"
          : "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)",
        border: isTodayCheckedIn ? "1.5px solid #86efac" : "1.5px solid #f87171",
        borderRadius: 16,
        padding: "20px 22px",
        transition: "all 0.3s ease",
        boxShadow: isTodayCheckedIn
          ? "0 4px 14px rgba(22, 163, 74, 0.08)"
          : "0 4px 20px rgba(220, 38, 38, 0.12)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 24 }}>{isTodayCheckedIn ? "✅" : "⏰"}</span>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: isTodayCheckedIn ? "#166534" : "#991b1b" }}>
              {isTodayCheckedIn
                ? "ĐÃ HOÀN THÀNH NHIỆM VỤ UỐNG THUỐC & CHECK-IN HÔM NAY"
                : "NHIỆM VỤ ĐẦU NGÀY: UỐNG THUỐC ĐÚNG GIỜ & CHECK-IN SỨC KHỎE"}
            </h3>
            {!isTodayCheckedIn && (
              <span className="badge badge-danger pulse-badge-danger" style={{ fontSize: 11, padding: "3px 8px" }}>
                ⚠️ Cần hoàn thành
              </span>
            )}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: "0.86rem", color: isTodayCheckedIn ? "#15803d" : "#7f1d1d" }}>
            {isTodayCheckedIn
              ? checkInSuccessMsg || "Bác sĩ điều trị đã nhận được dữ liệu tuân thủ & cập nhật lâm sàng của bạn."
              : "Điều đầu tiên mỗi ngày: Uống thuốc đúng giờ theo đơn và cập nhật nhanh tình trạng bệnh để gửi Bác sĩ."}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {!isTodayCheckedIn && (
            <>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#ffffff", padding: "4px 8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12 }}>
                <span>⏰ Giờ nhắc:</span>
                <input
                  type="time"
                  value={alarmTime}
                  onChange={(e) => setAlarmTime(e.target.value)}
                  style={{ border: "none", fontSize: 12, fontWeight: 700, outline: "none", background: "transparent" }}
                />
              </div>

              {notifPermission !== "granted" && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={requestNotification}
                  style={{ fontSize: 12, backgroundColor: "#ffffff" }}
                  title="Bật thông báo đẩy trên trình duyệt/điện thoại"
                >
                  🔔 Bật thông báo
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={toggleAlarmSound}
                style={{
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  backgroundColor: alarmPlaying ? "#fee2e2" : "#ffffff",
                  borderColor: alarmPlaying ? "#f87171" : "#cbd5e1",
                  color: alarmPlaying ? "#dc2626" : "#334155",
                }}
                title="Thử chuông báo thức"
              >
                {alarmPlaying ? "🔊 Đang đổ chuông..." : "🔔 Thử chuông"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSnooze}
                style={{ fontSize: 12, backgroundColor: "#ffffff" }}
                title="Nhắc lại sau 10 phút"
              >
                ⏱️ Báo lại sau 10p {snoozeUntil ? `(${snoozeUntil})` : ""}
              </button>
            </>
          )}
          {isTodayCheckedIn && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsTodayCheckedIn(false)}
              style={{ fontSize: 12 }}
            >
              ✏️ Cập nhật lại
            </button>
          )}
        </div>
      </div>

      {!isTodayCheckedIn && (
        <PatientCheckInForm
          onSubmit={handleDailyCheckInSubmit}
          hasTakenMeds={hasTakenMeds}
          setHasTakenMeds={setHasTakenMeds}
          selectedChips={selectedChips}
          toggleChip={toggleChip}
          dailyNote={dailyNote}
          setDailyNote={setDailyNote}
          submittingCheckIn={submittingCheckIn}
        />
      )}
    </div>
  );
}

interface PatientCheckInFormProps {
  onSubmit: (e: React.FormEvent) => Promise<void>;
  hasTakenMeds: boolean;
  setHasTakenMeds: (v: boolean) => void;
  selectedChips: string[];
  toggleChip: (label: string) => void;
  dailyNote: string;
  setDailyNote: (v: string) => void;
  submittingCheckIn: boolean;
}

function PatientCheckInForm(props: Readonly<PatientCheckInFormProps>) {
  const {
    onSubmit,
    hasTakenMeds,
    setHasTakenMeds,
    selectedChips,
    toggleChip,
    dailyNote,
    setDailyNote,
    submittingCheckIn,
  } = props;

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(220, 38, 38, 0.15)" }}>
      {/* 1. TÍCH CHỌN ĐÃ UỐNG THUỐC */}
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            padding: "10px 16px",
            borderRadius: 10,
            background: hasTakenMeds ? "#dcfce7" : "#ffffff",
            border: hasTakenMeds ? "1.5px solid #22c55e" : "1.5px solid #cbd5e1",
            fontWeight: 700,
            fontSize: "0.92rem",
            color: hasTakenMeds ? "#15803d" : "#334155",
            transition: "all 0.18s ease",
          }}
        >
          <input
            type="checkbox"
            checked={hasTakenMeds}
            onChange={(e) => setHasTakenMeds(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "#16a34a" }}
          />
          <span>💊 {hasTakenMeds ? "✓ Đã uống đủ thuốc theo đơn sáng nay" : "Chạm vào đây để xác nhận: Đã uống đủ thuốc sáng nay"}</span>
        </label>
      </div>

      {/* 2. CHỌN NHANH TRẠNG THÁI (QUICK-SELECT CHIPS) */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155", marginBottom: 6 }}>
          1. Chọn nhanh tình trạng da & cảm giác hiện tại (1 chạm):
        </div>
        <div className="quick-chips-container">
          {QUICK_CHIPS.map((chip) => {
            const isSelected = selectedChips.includes(chip.label);
            const selClass = isSelected ? getChipSelectedClass(chip.type) : "";

            return (
              <button
                key={chip.id}
                type="button"
                className={`quick-chip-btn ${selClass}`}
                onClick={() => toggleChip(chip.label)}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. NHẬP GHI CHÚ BỔ SUNG */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155", marginBottom: 6 }}>
          2. Ghi chú thêm cho Bác sĩ (Tùy chọn):
        </div>
        <input
          type="text"
          className="input"
          placeholder="VD: Cảm thấy hơi buồn ngủ sau uống, vùng da cẳng tay bớt ngứa..."
          value={dailyNote}
          onChange={(e) => setDailyNote(e.target.value)}
          style={{ backgroundColor: "#ffffff" }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submittingCheckIn}
          style={{
            fontWeight: 800,
            fontSize: "0.92rem",
            padding: "10px 22px",
            background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
          }}
        >
          {submittingCheckIn ? "Đang gửi sang Bác sĩ..." : "🚀 GỬI BÁO CÁO NGÀY CHO BÁC SĨ"}
        </button>
      </div>
    </form>
  );
}

function PatientNavTiles({ isTodayCheckedIn }: Readonly<{ isTodayCheckedIn: boolean }>) {
  return (
    <div className="grid-2" style={{ marginBottom: 16 }}>
      <Link className="smart-tile" href="/patient/updates">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="tile-icon" style={{ background: "var(--brand-50)", color: "var(--brand-600)" }}>
            💊
          </div>
          <div>
            <div className="tile-title">Đơn thuốc & Khai báo thuốc</div>
            <div className="tile-desc">Xem đơn thuốc bác sĩ kê và khai báo thuốc đang dùng từ các nguồn</div>
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-600)" }}>Xem đơn thuốc →</span>
      </Link>

      <Link
        className={`smart-tile ${!isTodayCheckedIn ? "pulse-red-alert" : ""}`}
        href="/patient/triage"
        style={{
          border: !isTodayCheckedIn ? "1.8px solid #f87171" : "1.5px solid #86efac",
          background: !isTodayCheckedIn
            ? "linear-gradient(135deg, #fff1f2 0%, #ffffff 100%)"
            : "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)",
          transition: "all 0.3s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            className="tile-icon"
            style={{
              background: !isTodayCheckedIn ? "#fee2e2" : "#dcfce7",
              color: !isTodayCheckedIn ? "#dc2626" : "#16a34a",
            }}
          >
            {!isTodayCheckedIn ? "🚨" : "✅"}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
              <span className="tile-title" style={{ color: !isTodayCheckedIn ? "#991b1b" : "#166534" }}>
                Phân luồng TriageGuard AI
              </span>
              {!isTodayCheckedIn ? (
                <span className="badge badge-danger pulse-badge-danger" style={{ fontSize: 11, padding: "2px 8px", fontWeight: 800 }}>
                  ⚠️ Chưa khai báo hôm nay
                </span>
              ) : (
                <span className="badge badge-ok" style={{ fontSize: 11, padding: "2px 8px", fontWeight: 700 }}>
                  ✅ Đã hoàn thành hôm nay
                </span>
              )}
            </div>
            <div className="tile-desc" style={{ color: !isTodayCheckedIn ? "#7f1d1d" : "#15803d" }}>
              {!isTodayCheckedIn
                ? "Bắt buộc: Bệnh nhân/Người nhà nhập mô tả triệu chứng hôm nay để AI phân luồng cấp cứu & Bác sĩ theo dõi."
                : "Đã gửi dữ liệu lâm sàng ngày hôm nay. Bác sĩ điều trị đã nhận được cập nhật."}
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: !isTodayCheckedIn ? "#dc2626" : "#16a34a",
            whiteSpace: "nowrap",
          }}
        >
          {!isTodayCheckedIn ? "👉 Khai báo ngay →" : "✓ Xem lại phân luồng →"}
        </span>
      </Link>
    </div>
  );
}


