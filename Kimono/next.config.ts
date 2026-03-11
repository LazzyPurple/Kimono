import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["otplib", "qrcode", "@simplewebauthn/server"],
  output: "standalone",
};

export default nextConfig;