import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    if (process.env.VERCEL !== "1") return [];
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: "https://call-intelligence-6h53.onrender.com/api/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
