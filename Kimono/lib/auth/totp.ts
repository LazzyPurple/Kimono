/* eslint-disable @typescript-eslint/no-require-imports */
import QRCode from "qrcode";

const APP_NAME = "Kimono";

/**
 * Récupère l'authenticator d'otplib (compatible CJS/ESM)
 */
function getAuthenticator() {
  // otplib est un module CJS, on utilise require pour éviter les problèmes de bundling
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const otplib = require("otplib");
  return otplib.authenticator;
}

/**
 * Génère un nouveau secret TOTP et le QR code associé
 */
export async function generateTotpSetup(userEmail: string) {
  const authenticator = getAuthenticator();
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(userEmail, APP_NAME, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  return {
    secret,
    qrCodeDataUrl,
    otpauth,
  };
}

/**
 * Vérifie un code TOTP contre un secret
 */
export function verifyTotpCode(code: string, secret: string): boolean {
  const authenticator = getAuthenticator();
  return authenticator.verify({ token: code, secret });
}
