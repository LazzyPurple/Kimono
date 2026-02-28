import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["otplib", "qrcode", "@simplewebauthn/server", "@prisma/client", "@prisma/adapter-libsql", "@libsql/client"],
};

export default nextConfig;
