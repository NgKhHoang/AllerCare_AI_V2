"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("allercare_theme") as "light" | "dark" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
      if (saved === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = prefersDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.dataset.theme = initial;
      if (initial === "dark") {
        document.documentElement.classList.add("dark");
      }
    }
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("allercare_theme", next);
    document.documentElement.dataset.theme = next;
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9000,
      }}
      className="theme-toggle-container"
    >
      <button
        type="button"
        onClick={toggleTheme}
        className="theme-toggle-btn"
        aria-label={isDark ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
        title={isDark ? "Giao diện Tối (Bấm để chuyển sang Sáng)" : "Giao diện Sáng (Bấm để chuyển sang Tối)"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px 8px 10px",
          borderRadius: 9999,
          background: isDark
            ? "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
            : "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)",
          border: isDark ? "1.5px solid #334155" : "1.5px solid #bae6fd",
          boxShadow: isDark
            ? "0 8px 24px -4px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(56, 189, 248, 0.25)"
            : "0 8px 24px -4px rgba(2, 132, 199, 0.25), 0 2px 6px rgba(0,0,0,0.06)",
          color: isDark ? "#f1f5f9" : "#0369a1",
          cursor: "pointer",
          transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          fontFamily: "inherit",
          fontSize: "0.82rem",
          fontWeight: 700,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: isDark
              ? "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)"
              : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            color: "#ffffff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            boxShadow: isDark
              ? "0 0 12px rgba(56, 189, 248, 0.5)"
              : "0 0 10px rgba(245, 158, 11, 0.4)",
            transition: "transform 0.3s ease",
            transform: isDark ? "rotate(360deg)" : "rotate(0deg)",
          }}
        >
          {isDark ? "🌙" : "☀️"}
        </span>
        <span style={{ letterSpacing: "-0.01em" }}>
          {isDark ? "Giao diện Tối" : "Giao diện Sáng"}
        </span>
      </button>
    </div>
  );
}
