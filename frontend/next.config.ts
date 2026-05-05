import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  allowedDevOrigins: ['10.7.9.42','169.254.175.141'],
};

export default nextConfig;
