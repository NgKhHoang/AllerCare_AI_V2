"use client";

/**
 * Phòng video call WebRTC (LiveKit) cho cuộc hẹn bệnh nhân ↔ bác sĩ.
 * Hoạt động: laptop ↔ laptop, laptop ↔ điện thoại, điện thoại ↔ điện thoại
 * (trình duyệt di động yêu cầu HTTPS — đã có qua Caddy).
 *
 * Không ghi âm/ghi hình (mục 10 README): không dùng ghi hình cục bộ hay egress.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { api, getToken, getUser } from "../../../lib/api";
import { AppShell, ErrorBox } from "../../../components/ui";

interface JoinInfo {
  room_url: string;
  room_code: string;
  token: string | null;
  recording_disabled: boolean;
  note: string;
}

type ConnState = "idle" | "connecting" | "connected" | "ended" | "error";

export default function VideoRoomPage() {
  const router = useRouter();
  const [state, setState] = useState<ConnState>("idle");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteCount, setRemoteCount] = useState(0);
  const [remoteVideoCount, setRemoteVideoCount] = useState(0);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  // Container CHỈ chứa DOM node gắn thủ công — React không render con vào đây
  const remoteVideosRef = useRef<HTMLDivElement | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    const parts = window.location.pathname.split("/").filter(Boolean);
    setAppointmentId(parts[parts.length - 1] ?? null);
    return () => {
      connectedRef.current = false;
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  const attachRemoteVideo = useCallback(
    (track: RemoteTrack, pub: RemoteTrackPublication) => {
      if (track.kind !== "video") return;
      const el = document.createElement("video");
      el.autoplay = true;
      el.playsInline = true;
      el.style.cssText =
        "width:100%;height:100%;object-fit:cover;border-radius:12px;background:#000;";
      track.attach(el);
      const wrap = document.createElement("div");
      wrap.style.cssText = "flex:1;min-width:0;position:relative;height:100%;";
      wrap.dataset.trackSid = pub.trackSid;
      wrap.appendChild(el);
      remoteVideosRef.current?.appendChild(wrap);
      setRemoteVideoCount((c) => c + 1);
    },
    []
  );

  const detachRemoteVideo = useCallback((pub: RemoteTrackPublication) => {
    const wrap = remoteVideosRef.current?.querySelector(
      `[data-track-sid="${pub.trackSid}"]`
    );
    if (wrap) {
      wrap.querySelectorAll("video").forEach((v) => {
        v.srcObject = null;
        v.remove();
      });
      wrap.remove();
      setRemoteVideoCount((c) => Math.max(0, c - 1));
    }
  }, []);

  const attachAllExisting = useCallback(
    (room: Room) => {
      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.isSubscribed && pub.videoTrack) {
            attachRemoteVideo(pub.videoTrack as RemoteTrack, pub as RemoteTrackPublication);
          }
        });
      });
      setRemoteCount(room.remoteParticipants.size);
    },
    [attachRemoteVideo]
  );

  const join = useCallback(async () => {
    if (!appointmentId || connectedRef.current) return;
    setState("connecting");
    setError("");
    try {
      const info = await api<JoinInfo>(`/v1/appointments/${appointmentId}/join`, {
        method: "POST",
      });
      setNote(info.note);

      if (!info.token) {
        throw new Error(
          "Video call chưa được bật trên server (thiếu cấu hình LiveKit). Hãy liên hệ quản trị viên."
        );
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track, pub) => attachRemoteVideo(track, pub));
      room.on(RoomEvent.TrackUnsubscribed, (_track, pub) => detachRemoteVideo(pub));
      room.on(RoomEvent.ParticipantConnected, () =>
        setRemoteCount(room.remoteParticipants.size)
      );
      room.on(RoomEvent.ParticipantDisconnected, () => {
        setRemoteCount(room.remoteParticipants.size);
      });
      room.on(RoomEvent.Disconnected, () => {
        if (connectedRef.current) {
          connectedRef.current = false;
          setState("ended");
        }
      });

      await room.connect(info.room_url, info.token);

      // Bật camera + mic (trình duyệt sẽ hỏi quyền lần đầu)
      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);

      // Gắn stream camera local (PiP)
      const camPub = room.localParticipant.getTrackPublication(
        Track.Source.Camera
      ) as LocalTrackPublication | undefined;
      if (camPub?.videoTrack && localVideoRef.current) {
        camPub.videoTrack.attach(localVideoRef.current);
      }

      // Đối phương có thể đã vào phòng trước mình
      attachAllExisting(room);

      connectedRef.current = true;
      setState("connected");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không kết nối được phòng video. Kiểm tra quyền camera/micro."
      );
      setState("error");
    }
  }, [appointmentId, attachRemoteVideo, detachRemoteVideo, attachAllExisting]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
    const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (camPub?.videoTrack && localVideoRef.current) {
      if (next) camPub.videoTrack.attach(localVideoRef.current);
      else camPub.videoTrack.detach(localVideoRef.current);
    }
  }

  function leave() {
    connectedRef.current = false;
    roomRef.current?.disconnect();
    roomRef.current = null;
    setState("ended");
  }

  const user = getUser();
  const role = user?.role === "doctor" ? "doctor" : "patient";

  return (
    <AppShell
      role={role}
      icon="🎥"
      title="Video call"
      subtitle="Cuộc gọi tư vấn trực tuyến — không ghi âm/ghi hình"
    >
      {error && <ErrorBox text={error} />}
      {note && <div className="source" style={{ marginBottom: 12 }}>{note}</div>}

      {state !== "connected" && (
        <div className="card">
          <div className="card-title">
            <span className="t-ico">🎥</span> Phòng video của lịch hẹn
          </div>
          <p className="muted" style={{ marginBottom: 12 }}>
            {state === "connecting"
              ? "Đang kết nối… hãy cho phép trình duyệt sử dụng camera và microphone."
              : state === "ended"
              ? "Bạn đã rời phòng."
              : "Nhấn nút bên dưới để tham gia. Cần quyền camera + microphone."}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {state !== "connecting" && appointmentId && (
              <button className="btn btn-primary" onClick={join}>
                {state === "ended" ? "Vào lại phòng" : "Vào phòng video"}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => router.back()}>
              ← Quay lại
            </button>
          </div>
        </div>
      )}

      {(state === "connecting" || state === "connected") && (
        <div className="card">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Video người kia — overlay chờ đặt absolute, không nằm trong container gắn DOM */}
            <div style={{ position: "relative", minHeight: 300, flex: 1 }}>
              <div
                ref={remoteVideosRef}
                style={{
                  display: "flex",
                  gap: 10,
                  position: "absolute",
                  inset: 0,
                }}
              />
              {remoteVideoCount === 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg, #f4f6f8)",
                    borderRadius: 12,
                    border: "1px dashed var(--border, #cbd5e1)",
                    color: "var(--muted, #64748b)",
                    fontSize: 14,
                    textAlign: "center",
                    padding: 12,
                  }}
                >
                  {remoteCount > 0
                    ? "👤 Người kia đã vào phòng — camera của họ đang tắt"
                    : "⏳ Đang chờ người kia vào phòng…"}
                </div>
              )}
            </div>

            {/* Camera của mình (PiP) */}
            <div
              style={{
                position: "relative",
                alignSelf: "flex-end",
                width: 180,
                height: 120,
                borderRadius: 12,
                overflow: "hidden",
                background: "#000",
              }}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              {!camOn && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 12,
                    background: "rgba(0,0,0,0.55)",
                  }}
                >
                  📷 Camera đang tắt
                </div>
              )}
            </div>

            {/* Điều khiển cuộc gọi */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-secondary btn-sm" onClick={toggleMic}>
                {micOn ? "🎙 Tắt mic" : "🎙 Bật mic"}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={toggleCam}>
                {camOn ? "📷 Tắt camera" : "📷 Bật camera"}
              </button>
              <button className="btn btn-danger btn-sm" onClick={leave}>
                📴 Kết thúc
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
