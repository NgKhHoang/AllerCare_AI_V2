import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "../components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "AllerCare AI — Nền tảng Y tế An toàn Thuốc & Trợ lý Gemini",
  description:
    "Ứng dụng AI trong theo dõi từ xa và hỗ trợ giảm sai sót trong sử dụng thuốc cho người bệnh Da liễu - Miễn dịch Dị ứng.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "AllerCare",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0284c7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
