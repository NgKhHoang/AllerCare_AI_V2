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
    "gồm 633 tương tác thuốc Bộ Y tế, cách bác sĩ chia liều và bối cảnh hồ sơ bệnh nhân (tuổi, chức năng thận, dị ứng…). " +
    'Bạn có thể gõ câu hỏi hoặc bấm 🎙️ để nói trực tiếp, ví dụ: "Uống Aceclofenac cùng Ketorolac có sao không?"';

  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

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

  // Khởi tạo Speech Recognition (Voice Input)
  function toggleListening() {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Trình duyệt của bạn chưa hỗ trợ nhận diện giọng nói. Vui lòng dùng Google Chrome / Edge / Safari.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = "vi-VN";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  }

  // Text-to-Speech (Voice Output)
  function speakMessage(text: string, index: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Trình duyệt không hỗ trợ phát giọng nói.");
      return;
    }

    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Loại bỏ các ký tự markdown trước khi đọc
    const cleanText = text
      .replace(/\*\*/g, "")
      .replace(/#/g, "")
      .replace(/- /g, " ")
      .replace(/👉|🔬|⚠️|📋|💊|🚨|🤖/g, "");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "vi-VN";
    utterance.rate = 0.95; // Đọc chậm rãi, ấm áp cho người bệnh

    utterance.onend = () => {
      setSpeakingIndex(null);
    };

    utterance.onerror = () => {
      setSpeakingIndex(null);
    };

    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
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
    "Uống Aceclofenac cùng Ketorolac có sao không?",
    "Liều Glucophage 850mg chia thế nào cho người suy thận?",
    "Paracetamol uống tối đa bao nhiêu viên mỗi ngày?",
    "Uống Cetirizine lúc nào trong ngày?",
  ];

  return (
    <AppShell
      role="patient"
      icon="💬"
      title="Hỏi đáp AI"
      subtitle="Trợ lý AI tích hợp Gemini & 633 tương tác thuốc Bộ Y tế · Hỗ trợ giọng nói · Khẩn cấp gọi 115"
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

      <div className="card" style={{ maxHeight: "52vh", overflowY: "auto" }}>
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
                marginBottom: 12,
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
                style={{ maxWidth: "85%", position: "relative" }}
              >
                {m.role !== "patient" && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-700, #075985)" }}>
                      🤖 Trợ lý AI AllerCare
                    </div>
                    <button
                      type="button"
                      onClick={() => speakMessage(m.content, i)}
                      style={{
                        background: speakingIndex === i ? "var(--brand-500, #0284C7)" : "rgba(2,132,199,0.1)",
                        color: speakingIndex === i ? "#FFF" : "var(--brand-700, #075985)",
                        border: "none",
                        borderRadius: 20,
                        padding: "2px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Đọc câu trả lời bằng giọng nói"
                    >
                      {speakingIndex === i ? "⏹ Dừng đọc" : "🔊 Nghe đọc"}
                    </button>
                  </div>
                )}
                <RichText text={m.content} />
                {m.sources && m.sources.length > 0 && (
                  <div style={{ fontSize: 11, marginTop: 8, padding: "6px 8px", background: "rgba(0,0,0,0.03)", borderRadius: 6, borderLeft: "2px solid var(--brand-500, #0284C7)" }}>
                    📚 <strong>Nguồn căn cứ:</strong>{" "}
                    {m.sources
                      .map((s) => `${s.title}${s.version ? ` (${s.version})` : ""}`)
                      .join("; ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && <p className="muted">🤖 Trợ lý AI đang tra cứu tri thức y khoa & soạn câu trả lời…</p>}
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

      <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder={isListening ? "🎙️ Đang lắng nghe giọng nói của bạn..." : "Hỏi AI về cách dùng thuốc, tương tác thuốc..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="button"
          onClick={toggleListening}
          className="btn"
          style={{
            background: isListening ? "#EF4444" : "var(--brand-50, #F0F9FF)",
            color: isListening ? "#FFFFFF" : "var(--brand-700, #075985)",
            borderColor: isListening ? "#EF4444" : "var(--brand-300, #7DD3FC)",
            padding: "8px 12px",
            fontSize: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
          title={isListening ? "Bấm để dừng ghi âm" : "Bấm để nói bằng giọng nói"}
        >
          {isListening ? "🔴 Dừng" : "🎙️ Nói"}
        </button>
        <button className="btn btn-primary" disabled={loading || !input.trim()}>
          Gửi
        </button>
      </form>

      <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
        💬 Bạn đang trò chuyện với <strong>Trợ lý AI AllerCare</strong>. AI tham chiếu từ kho tri thức 633 tương tác thuốc Bộ Y tế & phác đồ bác sĩ. Không kê đơn và không thay thế bác sĩ — liều dùng thực tế do Bác sĩ phụ trách quyết định.
      </p>
    </AppShell>
  );
}
