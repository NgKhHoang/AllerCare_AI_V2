/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // cho Docker production: tự đóng gói server + deps tối thiểu
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN || "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
