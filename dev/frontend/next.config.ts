import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ['10.7.15.243', '172.20.10.2', '192.168.29.211'],
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

export default nextConfig;