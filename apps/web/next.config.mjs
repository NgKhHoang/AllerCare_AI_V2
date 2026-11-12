/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // cho Docker production: tự đóng gói server + deps tối thiểu
  async rewrites() {
    const configuredApiOrigin = process.env.API_ORIGIN || "http://localhost:8000";
    // Render can provide a free public API URL or a private-service host:port.
    // Local Docker Compose also uses a full HTTP URL, so retain both forms.
    const apiOrigin = /^https?:\/\//.test(configuredApiOrigin)
      ? configuredApiOrigin
      : `http://${configuredApiOrigin}`;
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/doctor",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
