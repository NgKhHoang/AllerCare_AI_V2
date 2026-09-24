import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "../components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "AllerCare AI",
  description:
    "Theo dõi từ xa và kiểm tra an toàn thuốc — MVP demo với dữ liệu giả lập.",
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
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
