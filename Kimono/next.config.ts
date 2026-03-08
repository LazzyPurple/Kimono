import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["otplib", "qrcode", "@simplewebauthn/server", "@prisma/client"],
};

export default nextConfig;