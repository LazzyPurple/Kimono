/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["otplib", "qrcode", "@simplewebauthn/server"],
};

export default nextConfig;