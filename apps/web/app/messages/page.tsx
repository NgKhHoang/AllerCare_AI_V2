"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getToken, getUser } from "../../lib/api";
import { AppShell } from "../../components/ui";
import {
  Room,
  RoomEvent,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

interface Contact {
  id: string;
  username: string;
  full_name: string;
  role: string;
  phone?: string | null;
  unread_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
  is_online: boolean;
  patient_profile_id?: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  is_read: boolean;
  created_at: string;
  sender_name?: string | null;
  sender_role?: string | null;
}

interface CallSession {
  room_code: string;
  token?: string | null;
  livekit_url?: string | null;
  call_type: "voice" | "video";
  caller_id: string;
  caller_name: string;
  target_id: string;
  target_name: string;
}

const ROLE_LABELS: Record<string, { label: string; badgeCls: string; icon: string }> = {
  doctor: { label: "Bác sĩ", badgeCls: "badge-ok", icon: "🩺" },
  patient: { label: "Người bệnh", badgeCls: "badge-neutral", icon: "🧑‍💼" },
  nurse: { label: "Điều dưỡng", badgeCls: "badge-warning", icon: "👩‍⚕️" },
  pharmacist: { label: "Dược sĩ", badgeCls: "badge-ok", icon: "💊" },
  caregiver: { label: "Người nhà", badgeCls: "badge-neutral", icon: "🤝" },
  leader: { label: "Lãnh đạo", badgeCls: "badge-warning", icon: "📊" },
  admin: { label: "Quản trị viên", badgeCls: "badge-danger", icon: "🛠" },
};

const DEMO_PERSONAS = [
  { u: "doctor1", p: "doctor123", label: "BS. Nguyễn Văn An", role: "doctor", icon: "🩺" },
  { u: "patient1", p: "patient123", label: "NB. Lê Văn Cường", role: "patient", icon: "🧑‍💼" },
  { u: "nurse1", p: "nurse123", label: "ĐD. Trịnh Thu Hà", role: "nurse", icon: "👩‍⚕️" },
  { u: "pharmacist1", p: "pharma123", label: "DS. Nguyễn Thị Em", role: "pharmacist", icon: "💊" },
];

function formatTime(secs: number): string {
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatMsgTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "U";
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

function playRingtone(): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return () => {};
    const ctx = new AudioCtx();
    let isPlaying = true;

    const beep = () => {
      if (!isPlaying || ctx.state === "closed") return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);

      setTimeout(() => {
        if (isPlaying && ctx.state !== "closed") beep();
      }, 2000);
    };

    beep();
    return () => {
      isPlaying = false;
      void ctx.close().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

/* ---------------- Sub-component: Contact Item ---------------- */

function ContactItem({
  contact,
  isSelected,
  onSelect,
}: Readonly<{
  contact: Contact;
  isSelected: boolean;
  onSelect: (c: Contact) => void;
}>) {
  const rInfo = ROLE_LABELS[contact.role] ?? { label: contact.role, badgeCls: "badge-neutral", icon: "👤" };
  const initials = getInitials(contact.full_name);

  return (
    <button
      type="button"
      onClick={() => onSelect(contact)}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        marginBottom: 4,
        background: isSelected ? "var(--brand-100)" : "transparent",
        border: isSelected ? "1px solid var(--brand-300)" : "1px solid transparent",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ position: "relative" }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: isSelected ? "var(--brand-600)" : "var(--surface-ground)",
            color: isSelected ? "#fff" : "var(--brand-700)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            border: "1px solid var(--border-default)",
          }}
        >
          {initials}
        </div>
        <span
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: "#22c55e",
            border: "2px solid #fff",
          }}
          title="Đang trực tuyến"
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13.5,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {contact.full_name}
          </div>
          {contact.last_message_at && (
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
              {formatMsgTime(contact.last_message_at)}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span className={`badge ${rInfo.badgeCls}`} style={{ fontSize: 9.5, padding: "1px 5px" }}>
            {rInfo.icon} {rInfo.label}
          </span>
          {contact.unread_count > 0 && (
            <span
              style={{
                background: "var(--status-danger)",
                color: "#fff",
                borderRadius: 10,
                padding: "1px 6px",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {contact.unread_count}
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {contact.last_message || "Chưa có tin nhắn nào"}
        </div>
      </div>
    </button>
  );
}

/* ---------------- Sub-component: Message Bubble ---------------- */

function MessageBubble({
  message,
  currentUserId,
}: Readonly<{
  message: Message;
  currentUserId?: string;
}>) {
  const isMe = message.sender_id === currentUserId;
  const isCallEvent = message.attachment_type?.startsWith("call_");

  if (isCallEvent) {
    return (
      <div
        style={{
          margin: "4px auto",
          padding: "6px 14px",
          borderRadius: 16,
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          fontSize: 12,
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>{message.content}</span>
        <span>• {formatMsgTime(message.created_at)}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isMe ? "flex-end" : "flex-start",
        maxWidth: "75%",
        alignSelf: isMe ? "flex-end" : "flex-start",
      }}
    >
      {!isMe && (
        <span style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2, marginLeft: 4 }}>
          {message.sender_name || "Người dùng"}
        </span>
      )}

      <div
        style={{
          padding: "10px 14px",
          borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isMe ? "var(--brand-600)" : "var(--surface-card)",
          color: isMe ? "#fff" : "var(--text-primary)",
          border: isMe ? "none" : "1px solid var(--border-default)",
          fontSize: 13.5,
          lineHeight: 1.5,
          wordBreak: "break-word",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        {message.content}
        {message.attachment_url && (
          <div style={{ marginTop: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.attachment_url}
              alt="Ảnh đính kèm"
              style={{ maxWidth: 220, borderRadius: 8, display: "block" }}
            />
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 10, color: "var(--text-secondary)" }}>
        <span>{formatMsgTime(message.created_at)}</span>
        {isMe && <span>✓✓</span>}
      </div>
    </div>
  );
}

/* ---------------- Sub-component: Incoming Call Ringing Modal ---------------- */

function IncomingCallModal({
  incomingCall,
  onAccept,
  onDecline,
}: Readonly<{
  incomingCall: CallSession;
  onAccept: () => void;
  onDecline: () => void;
}>) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "var(--surface-card)",
          borderRadius: 20,
          padding: 28,
          width: 360,
          textAlign: "center",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {incomingCall.call_type === "video" ? "📹" : "📞"}
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
          {incomingCall.caller_name}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
          Đang gọi {incomingCall.call_type === "video" ? "Video trực tiếp" : "thoại trực tiếp"} cho bạn...
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-danger"
            style={{ flex: 1, padding: "10px 16px", borderRadius: 12, fontWeight: 700 }}
            onClick={onDecline}
          >
            ✕ Từ chối
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, padding: "10px 16px", borderRadius: 12, fontWeight: 700, background: "#16a34a" }}
            onClick={onAccept}
          >
            ✓ Trả lời
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Main Page Component ---------------- */

export default function MessagesPage() {
  const [user, setUser] = useState<{ id?: string; full_name?: string; role: string; username?: string } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputContent, setInputContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [autoReplying, setAutoReplying] = useState(false);

  // Calling state
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [callStatus, setCallStatus] = useState<"idle" | "ringing" | "connected" | "ended">("idle");
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);

  const [hasRemoteStream, setHasRemoteStream] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideosRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalPollRef = useRef<NodeJS.Timeout | null>(null);
  const stopRingtoneRef = useRef<(() => void) | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      const data = await api<Contact[]>("/v1/messages/contacts");
      setContacts(data);
      if (data.length > 0 && !selectedContact) {
        setSelectedContact(data[0]);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [selectedContact]);

  const loadMessages = useCallback(async (contactId: string) => {
    try {
      const msgs = await api<Message[]>(`/v1/messages/${contactId}`);
      setMessages(msgs);
    } catch {
      // ignore
    }
  }, []);

  const switchAccount = async (u: string, p: string) => {
    try {
      const form = new URLSearchParams({ username: u, password: p });
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Lỗi ${res.status}: Chuyển tài khoản thất bại`);
      }
      const data = await res.json();
      localStorage.setItem("allercare_token", data.access_token);
      localStorage.setItem("allercare_user", JSON.stringify(data.user));
      setUser(data.user);
      setSelectedContact(null);
      setLoading(true);
      const newContacts = await api<Contact[]>("/v1/messages/contacts");
      setContacts(newContacts);
      if (newContacts.length > 0) {
        setSelectedContact(newContacts[0]);
      }
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    const curUser = getUser();
    setUser(curUser);
    void loadContacts();

    const interval = setInterval(() => {
      void loadContacts();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadContacts]);

  useEffect(() => {
    if (!selectedContact) return;
    void loadMessages(selectedContact.id);
    const msgInterval = setInterval(() => {
      void loadMessages(selectedContact.id);
    }, 2500);
    return () => clearInterval(msgInterval);
  }, [selectedContact, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (callStatus === "connected") {
      timer = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callStatus]);

  // Polling for incoming calls in background (every 2.5s)
  useEffect(() => {
    if (!user || callStatus !== "idle") return;

    const checkIncoming = async () => {
      try {
        const inc = await api<CallSession & { status: string; offer?: RTCSessionDescriptionInit }>("/v1/messages/call/incoming");
        if (inc && inc.status === "ringing" && callStatus === "idle") {
          setIncomingCall(inc);
        }
      } catch {
        // ignore
      }
    };

    const interval = setInterval(() => {
      void checkIncoming();
    }, 2500);
    return () => clearInterval(interval);
  }, [user, callStatus]);

  // Ringtone playback for incoming and outgoing calls
  useEffect(() => {
    if (incomingCall || callStatus === "ringing") {
      stopRingtoneRef.current = playRingtone();
    } else {
      if (stopRingtoneRef.current) {
        stopRingtoneRef.current();
        stopRingtoneRef.current = null;
      }
    }
    return () => {
      if (stopRingtoneRef.current) {
        stopRingtoneRef.current();
        stopRingtoneRef.current = null;
      }
    };
  }, [incomingCall, callStatus]);

  // Bind local video stream to element when connected
  useEffect(() => {
    if (callStatus === "connected" && localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
  }, [callStatus, camOn]);

  const handleSendMessage = async (customText?: string) => {
    const text = customText ?? inputContent;
    if (!text.trim() || !selectedContact || sending) return;

    setSending(true);
    try {
      const newMsg = await api<Message>(`/v1/messages/${selectedContact.id}`, {
        method: "POST",
        body: { content: text.trim() },
      });
      setMessages((prev) => [...prev, newMsg]);
      if (!customText) setInputContent("");
      void loadContacts();
    } catch (err) {
      alert("Không thể gửi tin nhắn: " + String(err));
    } finally {
      setSending(false);
    }
  };

  const handleTriggerAutoReply = async () => {
    if (!selectedContact || autoReplying) return;
    setAutoReplying(true);
    try {
      const replyMsg = await api<Message>(`/v1/messages/${selectedContact.id}/auto-reply`, {
        method: "POST",
      });
      setMessages((prev) => [...prev, replyMsg]);
      void loadContacts();
    } catch (err) {
      alert("Không thể tạo phản hồi: " + String(err));
    } finally {
      setAutoReplying(false);
    }
  };

  const endCall = useCallback(() => {
    if (signalPollRef.current) {
      clearInterval(signalPollRef.current);
      signalPollRef.current = null;
    }
    if (callSession) {
      void api("/v1/messages/call/signal", {
        method: "POST",
        body: { room_code: callSession.room_code, signal_type: "end" },
      }).catch(() => {});
    }
    if (stopRingtoneRef.current) {
      stopRingtoneRef.current();
      stopRingtoneRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (livekitRoomRef.current) {
      livekitRoomRef.current.disconnect();
      livekitRoomRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setHasRemoteStream(false);
    setCallStatus("idle");
    setCallSession(null);
    setIncomingCall(null);
    if (selectedContact) {
      void loadMessages(selectedContact.id);
    }
  }, [callSession, selectedContact, loadMessages]);

  const startInstantCall = async (type: "voice" | "video") => {
    if (!selectedContact) return;

    try {
      setCallStatus("ringing");
      setHasRemoteStream(false);

      // 1. Capture local audio/video media
      let localStream: MediaStream | null = null;
      try {
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: type === "video",
            audio: true,
          });
          localStreamRef.current = localStream;
        }
      } catch (mediaErr) {
        console.warn("Camera/Mic device capture not accessible:", mediaErr);
      }

      // 2. Request call session and room code from backend
      const resp = await api<CallSession>("/v1/messages/call/token", {
        method: "POST",
        body: { target_user_id: selectedContact.id, call_type: type },
      });

      setCallSession(resp);
      setCamOn(type === "video");
      setMicOn(true);

      // 3. Create WebRTC Peer Connection (P2P 2-way real streaming)
      if (typeof RTCPeerConnection !== "undefined") {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        peerConnectionRef.current = pc;

        if (localStream) {
          localStream.getTracks().forEach((track) => {
            pc.addTrack(track, localStream!);
          });
        }

        pc.ontrack = (event) => {
          const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
          setHasRemoteStream(true);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.play().catch(() => {});
          }
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current.play().catch(() => {});
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            void api("/v1/messages/call/signal", {
              method: "POST",
              body: { room_code: resp.room_code, signal_type: "candidate", data: event.candidate.toJSON() },
            });
          }
        };

        // Create and send SDP Offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await api("/v1/messages/call/signal", {
          method: "POST",
          body: { room_code: resp.room_code, signal_type: "offer", data: offer },
        });
      }

      // 4. Start polling for Callee Answer & Candidates
      const pollInterval = setInterval(async () => {
        try {
          const sig = await api<{
            status: string;
            answer?: RTCSessionDescriptionInit;
            candidates?: RTCIceCandidateInit[];
          }>(`/v1/messages/call/signal/${resp.room_code}`);

          const pc = peerConnectionRef.current;
          if (sig.status === "connected" && sig.answer && pc) {
            if (!pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(sig.answer));
              setCallStatus("connected");
            }
          }
          if (sig.candidates && pc && pc.currentRemoteDescription) {
            for (const c of sig.candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } catch {}
            }
          }
          if (sig.status === "ended" || sig.status === "declined") {
            clearInterval(pollInterval);
            endCall();
          }
        } catch {
          // ignore
        }
      }, 1200);

      signalPollRef.current = pollInterval;
      void loadMessages(selectedContact.id);
    } catch (err) {
      alert("Không thể khởi tạo cuộc gọi: " + String(err));
      endCall();
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) return;

    try {
      const type = (incomingCall.call_type || "video") as "voice" | "video";
      setCallSession(incomingCall);
      setCamOn(type === "video");
      setMicOn(true);
      setCallStatus("connected");
      setHasRemoteStream(false);

      // 1. Capture local audio/video media
      let localStream: MediaStream | null = null;
      try {
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: type === "video",
            audio: true,
          });
          localStreamRef.current = localStream;
        }
      } catch (mediaErr) {
        console.warn("Camera/Mic device capture not accessible:", mediaErr);
      }

      // 2. Fetch Offer from signaling room
      const sig = await api<{
        offer?: RTCSessionDescriptionInit;
        candidates?: RTCIceCandidateInit[];
      }>(`/v1/messages/call/signal/${incomingCall.room_code}`);

      // 3. Create WebRTC Peer Connection
      if (typeof RTCPeerConnection !== "undefined" && sig.offer) {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        peerConnectionRef.current = pc;

        if (localStream) {
          localStream.getTracks().forEach((track) => {
            pc.addTrack(track, localStream!);
          });
        }

        pc.ontrack = (event) => {
          const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
          setHasRemoteStream(true);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.play().catch(() => {});
          }
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current.play().catch(() => {});
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            void api("/v1/messages/call/signal", {
              method: "POST",
              body: { room_code: incomingCall.room_code, signal_type: "candidate", data: event.candidate.toJSON() },
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sig.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Send Answer back to caller
        await api("/v1/messages/call/signal", {
          method: "POST",
          body: { room_code: incomingCall.room_code, signal_type: "answer", data: answer },
        });

        if (sig.candidates) {
          for (const c of sig.candidates) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch {}
          }
        }
      }

      // 4. Start polling for signals & end call
      const pollInterval = setInterval(async () => {
        try {
          const s = await api<{ status: string; candidates?: RTCIceCandidateInit[] }>(
            `/v1/messages/call/signal/${incomingCall.room_code}`
          );
          if (s.candidates && peerConnectionRef.current) {
            for (const c of s.candidates) {
              try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c));
              } catch {}
            }
          }
          if (s.status === "ended") {
            clearInterval(pollInterval);
            endCall();
          }
        } catch {
          // ignore
        }
      }, 1200);

      signalPollRef.current = pollInterval;
      setIncomingCall(null);
    } catch (err) {
      alert("Không thể kết nối cuộc gọi: " + String(err));
      endCall();
    }
  };

  const declineIncomingCall = () => {
    if (incomingCall) {
      void api("/v1/messages/call/signal", {
        method: "POST",
        body: { room_code: incomingCall.room_code, signal_type: "decline" },
      }).catch(() => {});
    }
    setIncomingCall(null);
    setCallStatus("idle");
  };

  const toggleMic = () => {
    const nextMic = !micOn;
    if (peerConnectionRef.current) {
      peerConnectionRef.current.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === "audio") {
          sender.track.enabled = nextMic;
        }
      });
    }
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = nextMic;
      });
    }
    setMicOn(nextMic);
  };

  const toggleCam = () => {
    const nextCam = !camOn;
    if (peerConnectionRef.current) {
      peerConnectionRef.current.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === "video") {
          sender.track.enabled = nextCam;
        }
      });
    }
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = nextCam;
      });
    }
    setCamOn(nextCam);
  };

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      c.full_name.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      (ROLE_LABELS[c.role]?.label ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q);
    
    let matchRole = true;
    if (roleFilter === "doctor") matchRole = c.role === "doctor";
    else if (roleFilter === "patient") matchRole = c.role === "patient";
    else if (roleFilter === "staff") matchRole = ["nurse", "pharmacist", "caregiver"].includes(c.role);

    return matchSearch && matchRole;
  });

  const roleName = (user?.role ?? "patient") as "patient" | "doctor" | "nurse" | "leader" | "admin";
  const isPatient = user?.role === "patient" || user?.role === "caregiver";

  return (
    <AppShell
      role={["doctor", "nurse", "leader", "admin"].includes(roleName) ? roleName : "patient"}
      title={isPatient ? "💬 Liên Hệ Bác Sĩ Phụ Trách (24/7)" : "Zalo Y Tế — Nhắn Tin & Gọi Trực Tiếp"}
      subtitle={
        isPatient
          ? "Kênh liên lạc tức thì 24/7 trực tiếp với Bác sĩ đang phụ trách điều trị của bạn"
          : "Kênh liên lạc tức thì 24/7 giữa Bác sĩ, Bệnh nhân, Điều dưỡng & Dược sĩ"
      }
      icon="💬"
      wide
    >
      {/* QUICK PERSONA SWITCHER BAR */}
      <div
        style={{
          marginBottom: 12,
          padding: "10px 16px",
          borderRadius: 14,
          background: "linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)",
          border: "1.5px solid #bae6fd",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>👤</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0369a1" }}>
            Đang đăng nhập: <strong>{user?.full_name || user?.username}</strong> ({ROLE_LABELS[user?.role ?? ""]?.label ?? user?.role})
          </span>
          {isPatient && (
            <span className="badge badge-ok" style={{ fontSize: 11, marginLeft: 4 }}>
              🔒 Chế độ Người bệnh: Kết nối Bác sĩ phụ trách
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Chuyển nhanh sang:</span>
          {DEMO_PERSONAS.map((p) => {
            const isCurrent = user?.username === p.u;
            return (
              <button
                key={p.u}
                type="button"
                onClick={() => { void switchAccount(p.u, p.p); }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  border: isCurrent ? "2px solid #0284c7" : "1px solid #cbd5e1",
                  background: isCurrent ? "#0284c7" : "#ffffff",
                  color: isCurrent ? "#ffffff" : "#334155",
                  cursor: isCurrent ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
                {isCurrent && <span>(Hiện tại)</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, height: "76vh", minHeight: 560 }}>
        {/* LEFT COLUMN: DANH BẠ HỘI THOẠI */}
        <div
          style={{
            background: "var(--surface-card)",
            borderRadius: 16,
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)", background: "var(--surface-ground)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{isPatient ? "🩺 Bác sĩ phụ trách" : "👥 Danh bạ y tế"}</span>
                <span className="badge badge-ok" style={{ fontSize: 10 }}>{contacts.length} liên hệ</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: "4px 8px", fontSize: 11 }}
                onClick={() => {
                  setIncomingCall({
                    room_code: "demo-incoming",
                    call_type: "video",
                    caller_id: "demo-doc",
                    caller_name: "BS. Nguyễn Văn An",
                    target_id: user?.id ?? "",
                    target_name: user?.full_name ?? "Bạn",
                  });
                }}
                title="Bấm để thử nghiệm nhận cuộc gọi đến"
              >
                🔔 Test chuông
              </button>
            </div>

            <input
              type="text"
              placeholder={isPatient ? "🔍 Tìm bác sĩ..." : "🔍 Tìm theo tên, vai trò..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-default)",
                background: "var(--surface-card)",
                fontSize: 13,
                marginBottom: isPatient ? 0 : 8,
              }}
            />

            {!isPatient && (
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { id: "all", label: "Tất cả" },
                  { id: "doctor", label: "Bác sĩ" },
                  { id: "patient", label: "Bệnh nhân" },
                  { id: "staff", label: "Điều dưỡng/Dược" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRoleFilter(tab.id)}
                    style={{
                      flex: 1,
                      padding: "5px 2px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      border: "none",
                      background: roleFilter === tab.id ? "var(--brand-600)" : "transparent",
                      color: roleFilter === tab.id ? "#fff" : "var(--text-secondary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
            {loading && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Đang tải danh bạ...
              </div>
            )}
            {!loading && filteredContacts.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Không tìm thấy liên hệ phù hợp
              </div>
            )}
            {!loading && filteredContacts.map((c) => (
              <ContactItem
                key={c.id}
                contact={c}
                isSelected={selectedContact?.id === c.id}
                onSelect={setSelectedContact}
              />
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: KHUNG CHAT & GỌI TRỰC TIẾP */}
        <div
          style={{
            background: "var(--surface-card)",
            borderRadius: 16,
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {selectedContact ? (
            <>
              {/* Header */}
              <div
                style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--border-default)",
                  background: "var(--surface-ground)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "var(--brand-600)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {getInitials(selectedContact.full_name)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{selectedContact.full_name}</span>
                      <span className="badge badge-ok" style={{ fontSize: 10 }}>
                        🟢 Trực tuyến 24/7
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 8, alignItems: "center" }}>
                      <span>Vai trò: <strong>{ROLE_LABELS[selectedContact.role]?.label ?? selectedContact.role}</strong></span>
                      {selectedContact.phone && <span>• SĐT: {selectedContact.phone}</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { void startInstantCall("voice"); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, padding: "8px 14px" }}
                    title="Gọi thoại trực tiếp không cần lịch hẹn"
                  >
                    📞 <span style={{ fontSize: 12.5 }}>Gọi thoại</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => { void startInstantCall("video"); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, padding: "8px 14px" }}
                    title="Khám video trực tiếp LiveKit HD"
                  >
                    📹 <span style={{ fontSize: 12.5 }}>Gọi Video</span>
                  </button>
                </div>
              </div>

              {/* Message Thread */}
              <div
                style={{
                  flex: 1,
                  padding: "16px 20px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  background: "var(--surface-ground)",
                }}
              >
                {messages.length === 0 ? (
                  <div style={{ margin: "auto", textAlign: "center", color: "var(--text-secondary)", maxWidth: 360 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                      Bắt đầu cuộc trò chuyện với {selectedContact.full_name}
                    </div>
                    <div style={{ fontSize: 12.5 }}>
                      Bạn có thể gửi tin nhắn, ảnh sang thương da liễu hoặc bấm gọi thoại / video trực tiếp ở góc trên.
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      currentUserId={user?.id}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Clinical Prompts & Auto-Reply Test Button */}
              <div
                style={{
                  padding: "8px 16px",
                  borderTop: "1px solid var(--border-default)",
                  background: "var(--surface-card)",
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  overflowX: "auto",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    whiteSpace: "nowrap",
                    background: "#fef3c7",
                    color: "#92400e",
                    borderColor: "#fde68a",
                    fontWeight: 700,
                  }}
                  onClick={() => { void handleTriggerAutoReply(); }}
                  disabled={autoReplying}
                  title={`Tạo phản hồi tự động từ ${selectedContact.full_name} để kiểm tra tương tác 2 chiều`}
                >
                  ⚡ {autoReplying ? "Đang trả lời..." : `Mô phỏng ${selectedContact.full_name.split(" ").slice(-1)} trả lời`}
                </button>

                {[
                  "🩺 Bác sĩ gửi lời dặn dò",
                  "💊 Hướng dẫn uống thuốc sau ăn",
                  "📸 Gửi ảnh sang thương da liễu",
                  "🚨 Báo cáo tác dụng phụ",
                  "✅ Đã uống thuốc đúng giờ",
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: 11, padding: "3px 8px", whiteSpace: "nowrap" }}
                    onClick={() => { void handleSendMessage(prompt); }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Input bar */}
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid var(--border-default)",
                  background: "var(--surface-ground)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: "8px 12px", fontSize: 14 }}
                  onClick={() => {
                    const sampleUrl = prompt(
                      "Nhập link hình ảnh tổn thương / đơn thuốc:",
                      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400"
                    );
                    if (sampleUrl) {
                      void api(`/v1/messages/${selectedContact.id}`, {
                        method: "POST",
                        body: {
                          content: "📸 Đã gửi hình ảnh y tế:",
                          attachment_url: sampleUrl,
                          attachment_type: "image",
                        },
                      }).then(() => {
                        void loadMessages(selectedContact.id);
                      });
                    }
                  }}
                  title="Gửi hình ảnh tổn thương da hoặc đơn thuốc"
                >
                  📷 Ảnh
                </button>

                <input
                  type="text"
                  placeholder="Nhập tin nhắn... (Nhấn Enter để gửi)"
                  value={inputContent}
                  onChange={(e) => setInputContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-card)",
                    fontSize: 13.5,
                  }}
                />

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { void handleSendMessage(); }}
                  disabled={sending || !inputContent.trim()}
                  style={{ padding: "10px 18px", fontWeight: 700 }}
                >
                  {sending ? "..." : "Gửi ➤"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Chọn một liên hệ từ danh bạ bên trái để bắt đầu</div>
            </div>
          )}
        </div>
      </div>

      {/* POPUP CUỘC GỌI ĐẾN */}
      {incomingCall && (
        <IncomingCallModal
          incomingCall={incomingCall}
          onAccept={acceptIncomingCall}
          onDecline={declineIncomingCall}
        />
      )}

      {/* MODAL PHÒNG GỌI TỨC THÌ */}
      {callSession && (callStatus === "connected" || callStatus === "ringing") && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 15, 30, 0.94)",
            zIndex: 9998,
            display: "flex",
            flexDirection: "column",
            padding: 20,
          }}
        >
          {/* HIDDEN AUDIO ELEMENT FOR REMOTE VOICE STREAM */}
          <audio ref={remoteAudioRef} autoPlay style={{ display: "none" }} />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#fff",
              paddingBottom: 16,
              borderBottom: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 24 }}>{callSession.call_type === "video" ? "📹" : "📞"}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  Cuộc gọi {callSession.call_type === "video" ? "Video" : "Thoại"} với {callSession.target_name}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Mã phòng: {callSession.room_code} • {callStatus === "ringing" ? (
                    <span style={{ color: "#f59e0b" }}>Đang đổ chuông...</span>
                  ) : (
                    <span>Thời gian: <strong style={{ color: "#38bdf8" }}>{formatTime(callDuration)}</strong></span>
                  )}
                </div>
              </div>
            </div>

            <span className="badge badge-ok" style={{ fontSize: 11 }}>
              {callStatus === "ringing" ? "🔔 Đang kết nối..." : "🟢 Đang đàm thoại WebRTC P2P"}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              gap: 16,
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              padding: "20px 0",
            }}
          >
            {callSession.call_type === "video" ? (
              <div style={{ display: "flex", gap: 16, width: "100%", height: "100%", maxHeight: "60vh" }}>
                {/* LOCAL VIDEO / CAMERA VIEW */}
                <div
                  style={{
                    flex: 1,
                    background: "#1e293b",
                    borderRadius: 16,
                    position: "relative",
                    overflow: "hidden",
                    border: "2px solid #3b82f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transform: "scaleX(-1)",
                      display: camOn ? "block" : "none",
                    }}
                  />
                  {!camOn && (
                    <div style={{ textAlign: "center", color: "#94a3b8" }}>
                      <div style={{ fontSize: 44, marginBottom: 8 }}>📷</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Camera của bạn đang tắt</div>
                    </div>
                  )}
                  <span
                    style={{
                      position: "absolute",
                      bottom: 12,
                      left: 12,
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      padding: "4px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>{micOn ? "🎙️" : "🔇"}</span>
                    <span>Bạn ({camOn ? "Camera bật" : "Camera tắt"})</span>
                  </span>
                </div>

                {/* REMOTE VIDEO VIEW (REAL 2-WAY WEBRTC STREAM) */}
                <div
                  ref={remoteVideosRef}
                  style={{
                    flex: 1,
                    background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
                    borderRadius: 16,
                    position: "relative",
                    overflow: "hidden",
                    border: "2px solid rgba(255,255,255,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#94a3b8",
                  }}
                >
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: hasRemoteStream ? "block" : "none",
                    }}
                  />
                  {!hasRemoteStream && (
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 36,
                          margin: "0 auto 12px",
                          boxShadow: "0 0 25px rgba(56, 189, 248, 0.4)",
                        }}
                      >
                        {callSession.target_name.startsWith("BS.") ? "🩺" : "🧑‍💼"}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                        {callSession.target_name}
                      </div>
                      <div style={{ fontSize: 12, color: "#38bdf8" }}>
                        {callStatus === "ringing" ? "🔔 Đang chờ đối phương nhấc máy..." : "🟢 Đang kết nối luồng video HD..."}
                      </div>
                    </div>
                  )}
                  <span
                    style={{
                      position: "absolute",
                      bottom: 12,
                      left: 12,
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      padding: "4px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {callSession.target_name}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "#fff" }}>
                <div
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 44,
                    margin: "0 auto 16px",
                    boxShadow: "0 0 35px rgba(59, 130, 246, 0.7)",
                  }}
                >
                  {callSession.target_name.startsWith("BS.") ? "🩺" : "🧑‍💼"}
                </div>
                <div style={{ fontWeight: 800, fontSize: 24, marginBottom: 4 }}>{callSession.target_name}</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 14 }}>
                  Mã hóa trực tiếp 2 đầu • Chuẩn HD Voice (48kHz Stereo)
                </div>

                {/* ANIMATED AUDIO WAVEFORM EQUALIZER */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    height: 48,
                    marginBottom: 16,
                  }}
                >
                  {[16, 32, 44, 28, 48, 36, 42, 22, 38, 18, 30, 46].map((h, i) => (
                    <div
                      key={i}
                      style={{
                        width: 5,
                        height: micOn ? h : 6,
                        borderRadius: 4,
                        background: micOn ? "linear-gradient(180deg, #38bdf8 0%, #3b82f6 100%)" : "#475569",
                        transition: "all 0.25s ease",
                      }}
                    />
                  ))}
                </div>

                <div
                  style={{
                    display: "inline-block",
                    padding: "6px 16px",
                    borderRadius: 20,
                    background: "rgba(56, 189, 248, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    fontSize: 13,
                    color: "#38bdf8",
                    fontWeight: 600,
                  }}
                >
                  {callStatus === "ringing" ? "🔔 Đang gọi..." : <span>Đang đàm thoại: <strong>{formatTime(callDuration)}</strong></span>}
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 16,
              paddingTop: 16,
              borderTop: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <button
              type="button"
              onClick={toggleMic}
              style={{
                padding: "12px 20px",
                borderRadius: 12,
                border: "none",
                background: micOn ? "#334155" : "#ef4444",
                color: "#fff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {micOn ? "🎙️ Tắt Mic" : "🔇 Bật Mic"}
            </button>

            {callSession.call_type === "video" && (
              <button
                type="button"
                onClick={toggleCam}
                style={{
                  padding: "12px 20px",
                  borderRadius: 12,
                  border: "none",
                  background: camOn ? "#334155" : "#ef4444",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {camOn ? "📹 Tắt Camera" : "📷 Bật Camera"}
              </button>
            )}

            <button
              type="button"
              onClick={endCall}
              style={{
                padding: "12px 28px",
                borderRadius: 12,
                border: "none",
                background: "#dc2626",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              📞 Kết thúc cuộc gọi
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
