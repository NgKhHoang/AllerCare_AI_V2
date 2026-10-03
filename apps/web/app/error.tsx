"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App Error:", error);
  }, [error]);

  return (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
      <h2>Đã xảy ra lỗi</h2>
      <p style={{ color: "#ef4444", marginBottom: 20 }}>{error.message || "Lỗi không xác định"}</p>
      <button
        onClick={() => reset()}
        style={{
          padding: "10px 20px",
          background: "#0284c7",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Thử lại
      </button>
    </div>
  );
}
