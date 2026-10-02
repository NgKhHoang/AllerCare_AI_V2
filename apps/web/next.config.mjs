/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // cho Docker production: tự đóng gói server + deps tối thiểu
  async rewrites() {
    const apiOrigin =
      process.env.API_ORIGIN ||
      (process.env.NODE_ENV === "production"
        ? "https://allercare-ai-v2.onrender.com"
        : "http://localhost:8000");
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
