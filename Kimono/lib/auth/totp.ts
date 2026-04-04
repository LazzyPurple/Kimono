import { createRequire } from "node:module";
import QRCode from "qrcode";

const require = createRequire(import.meta.url);
const { authenticator } = require("otplib") as { authenticator: { generateSecret: () => string; keyuri: (userEmail: string, appName: string, secret: string) => string; verify: (input: { token: string; secret: string }) => boolean } };
const APP_NAME = "Kimono";

export async function generateTotpSetup(userEmail: string) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(userEmail, APP_NAME, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  return {
    secret,
    qrCodeDataUrl,
    otpauth,
  };
}

export function verifyTotpCode(code: string, secret: string): boolean {
  return authenticator.verify({ token: code, secret });
}
