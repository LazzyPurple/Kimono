import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ["otplib", "qrcode", "@simplewebauthn/server", "@prisma/client"],
};

export default nextConfig;