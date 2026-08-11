import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  turbopack: {},
  allowedDevOrigins: ['172.20.10.3','172.20.10.7'],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.qrserver.com",
        pathname: "/v1/create-qr-code/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/register',
        destination: '/login',
        permanent: true,
      },
    ];
  },
};

export default withPWA(nextConfig);