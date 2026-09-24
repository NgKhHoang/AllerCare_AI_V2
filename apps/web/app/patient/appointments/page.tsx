"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "../../../lib/api";
import { AppShell, EmptyState, ErrorBox, SuccessBox } from "../../../components/ui";

interface Appointment {
  id: string;
  doctor_user_id: string;
  scheduled_at: string;
  status: string;
  reason: string | null;
}
interface Profile {
  id: string;
  assigned_doctor_id: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  requested: "badge badge-info",
  confirmed: "badge badge-ok",
  done: "badge badge-ok",
  cancelled: "badge badge-neutral",
};
const STATUS_TEXT: Record<string, string> = {
  requested: "Chờ bác sĩ xác nhận",
  confirmed: "Đã xác nhận",
  done: "Hoàn tất",
  cancelled: "Đã hủy",
};

export default function PatientAppointments() {
  const router = useRouter();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    reload();
  }, []);

  async function reload() {
    try {
      setAppts(await api<Appointment[]>("/v1/appointments"));
      setProfile(await api<Profile>("/v1/patients/me/profile"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tải lịch hẹn");
    }
  }

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.assigned_doctor_id) {
      setError("Bạn chưa được gán bác sĩ phụ trách.");
      return;
    }
    setError("");
    setSuccess("");
    try {
      await api("/v1/appointments", {
        method: "POST",
        body: {
          doctor_user_id: profile.assigned_doctor_id,
          scheduled_at: when.replace("T", " "),
          reason: reason || null,
        },
      });
      setWhen("");
      setReason("");
      setSuccess("Đã gửi yêu cầu hẹn. Bác sĩ sẽ xác nhận sớm.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đặt được lịch");
    }
  }

  async function join(id: string) {
    setError("");
    try {
      await api(`/v1/appointments/${id}/join`, { method: "POST" });
      router.push(`/video/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không vào được phòng");
    }
  }

  async function cancel(id: string) {
    setError("");
    try {
      await api(`/v1/appointments/${id}/cancel`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không hủy được lịch");
    }
  }

  return (
    <AppShell
      role="patient"
      icon="📅"
      title="Lịch hẹn"
      subtitle="Đặt lịch tư vấn và tham gia video call với bác sĩ"
    >
      {error && <ErrorBox text={error} />}
      {success && <SuccessBox text={success} />}

      <div className="card">
        <div className="card-title">
          <span className="t-ico">➕</span> Đặt lịch tái khám / tư vấn
        </div>
        <form onSubmit={book}>
          <div className="field">
            <label className="label">Thời gian</label>
            <input
              className="input"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label">Lý do (không bắt buộc)</label>
            <input
              className="input"
              placeholder="VD: Tái khám sau điều trị"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button className="btn btn-primary">Gửi yêu cầu hẹn</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          <span className="t-ico">🗓</span> Các lịch hẹn của tôi
        </div>
        {appts.length === 0 && <EmptyState icon="📅" text="Chưa có lịch hẹn nào. Hãy đặt lịch phía trên." />}
        {appts.map((a) => (
          <div className="list-row" key={a.id}>
            <div className="list-main">
              <div className="list-title">{a.scheduled_at}</div>
              <div className="list-sub">{a.reason ?? "Tái khám định kỳ"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={STATUS_BADGE[a.status] ?? "badge badge-neutral"}>
                {STATUS_TEXT[a.status] ?? a.status}
              </span>
              {a.status === "confirmed" && (
                <button className="btn btn-primary btn-sm" onClick={() => join(a.id)}>
                  Vào phòng
                </button>
              )}
              {(a.status === "requested" || a.status === "confirmed") && (
                <button className="btn btn-secondary btn-sm" onClick={() => cancel(a.id)}>
                  Hủy
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
