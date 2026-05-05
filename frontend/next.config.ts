import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  allowedDevOrigins: ['10.7.15.243','169.254.175.141'],
};

export default nextConfig;
