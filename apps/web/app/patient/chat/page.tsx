"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getToken } from "../../../lib/api";
import { AppShell } from "../../../components/ui";

interface Msg {
  role: string;
  content: string;
  session_id?: string;
  sources?: { title: string; version?: string; file?: string }[];
  emergency?: boolean;
  handoff?: boolean;
  at?: string;
}

interface SessionInfo {
  session_id: string;
  created_at: string;
  message_count: number;
  last_message: string;
}

/** Render nhẹ **đậm** + xuống dòng cho nội dung trả lời của AI. */
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j}>{part.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{part}</span>
            )
          )}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function formatTime(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function PatientChat() {
  const WELCOME =
    "Chào bạn! Mình là Trợ lý AI của AllerCare 🌊 Mình học từ kho kiến thức của hệ thống — " +
    "gồm cách bác sĩ chia liều, ví dụ liều thực tế và yếu tố bệnh nhân (tuổi, chức năng thận, dị ứng…). " +
    'Bạn có thể hỏi mình về cách dùng thuốc, ví dụ: "Uống Glucophage 850mg bao nhiêu viên một ngày?"';

  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getToken()) window.location.href = "/login";
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Nạp danh sách hội thoại cũ khi mở trang
  useEffect(() => {
    api<SessionInfo[]>("/v1/chat/sessions")
      .then(setSessions)
      .catch(() => {});
  }, []);

  const openSession = useCallback(async (id: string) => {
    setError("");
    try {
      const history = await api<Msg[]>(`/v1/chat/messages?session_id=${id}`);
      setSessionId(id);
      setMessages([{ role: "assistant", content: WELCOME }, ...history]);
      setShowHistory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được hội thoại");
    }
  }, [WELCOME]);

  function newChat() {
    setSessionId(null);
    setMessages([{ role: "assistant", content: WELCOME }]);
    setShowHistory(false);
    setError("");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "patient", content: text }]);
    try {
      const res = await api<Msg>("/v1/chat/messages", {
        method: "POST",
        body: { content: text, session_id: sessionId },
      });
      setSessionId(res.session_id ?? null);
      setMessages((prev) => [...prev, res]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được tin nhắn");
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "Liều Glucophage 850mg chia thế nào?",
    "Paracetamol uống tối đa bao nhiêu viên mỗi ngày?",
    "Bác sĩ chia liều theo nguyên tắc nào?",
    "Uống Cetirizine lúc nào trong ngày?",
  ];

  return (
    <AppShell
      role="patient"
      icon="💬"
      title="Hỏi đáp AI"
      subtitle="Chat với Trợ lý AI · AI học từ kho kiến thức của hệ thống · Khẩn cấp gọi 115"
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={newChat}>
          ＋ Hội thoại mới
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowHistory((v) => !v)}
          disabled={sessions.length === 0}
        >
          🕘 Hội thoại cũ {sessions.length > 0 ? `(${sessions.length})` : ""}
        </button>
      </div>

      {showHistory && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-title">
            <span className="t-ico">🕘</span> Hội thoại trước đây
          </div>
          {sessions.length === 0 && (
            <p className="muted" style={{ fontSize: 14 }}>Chưa có hội thoại nào.</p>
          )}
          {sessions.map((s) => (
            <div
              className="list-row"
              key={s.session_id}
              style={{ cursor: "pointer" }}
              onClick={() => openSession(s.session_id)}
            >
              <div className="list-main">
                <div className="list-title">{s.last_message || "(không có nội dung)"}</div>
                <div className="list-sub">
                  {formatTime(s.created_at)} · {s.message_count} tin nhắn
                </div>
              </div>
              <span className="badge badge-info">Xem</span>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ maxHeight: "50vh", overflowY: "auto" }}>
        {messages.map((m, i) => (
          <div key={i}>
            {m.at && i > 0 && (
              <div style={{ textAlign: "center", fontSize: 12, opacity: 0.5, margin: "4px 0" }}>
                {formatTime(m.at)}
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: m.role === "patient" ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                className={
                  m.role === "patient"
                    ? "bubble bubble-me"
                    : m.emergency
                    ? "bubble bubble-emergency"
                    : m.handoff
                    ? "bubble bubble-handoff"
                    : "bubble bubble-bot"
                }
              >
                {m.role !== "patient" && (
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.8 }}>
                    🤖 Trợ lý AI
                  </div>
                )}
                <RichText text={m.content} />
                {m.sources && m.sources.length > 0 && (
                  <div style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>
                    Nguồn:{" "}
                    {m.sources
                      .map((s) => `${s.title}${s.version ? ` (v${s.version})` : ""}`)
                      .join("; ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && <p className="muted">🤖 Trợ lý AI đang soạn trả lời…</p>}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && !loading && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              className="btn btn-secondary btn-sm"
              onClick={() => setInput(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          className="input"
          placeholder="Hỏi AI về cách dùng thuốc, cách chia liều…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn btn-primary" disabled={loading || !input.trim()}>
          Gửi
        </button>
      </form>

      <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
        💬 Bạn đang trò chuyện với <strong>Trợ lý AI</strong> (không phải bác sĩ/dược sĩ). AI chỉ
        học từ kho kiến thức trong hệ thống, không kê đơn và không thay thế bác sĩ — liều cuối cùng
        do bác sĩ phụ trách quyết định.
      </p>
    </AppShell>
  );
}
