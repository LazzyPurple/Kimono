type GetProxyTokenOptionsInput = {
  secret: string | undefined;
  nodeEnv?: string | undefined;
  authUrl?: string | undefined;
};

function shouldUseSecureAuthCookie({
  nodeEnv,
  authUrl,
}: {
  nodeEnv?: string | undefined;
  authUrl?: string | undefined;
}) {
  if (nodeEnv !== "production") {
    return false;
  }

  const normalizedAuthUrl = authUrl?.trim().toLowerCase();
  if (!normalizedAuthUrl) {
    return true;
  }

  return normalizedAuthUrl.startsWith("https://");
}

export function getProxyTokenOptions({
  secret,
  nodeEnv = process.env.NODE_ENV,
  authUrl = process.env.AUTH_URL,
}: GetProxyTokenOptionsInput) {
  if (shouldUseSecureAuthCookie({ nodeEnv, authUrl })) {
    return {
      secret,
      secureCookie: true,
      cookieName: "__Secure-authjs.session-token",
    };
  }

  if (nodeEnv === "production") {
    return {
      secret,
      secureCookie: false,
      cookieName: "authjs.session-token",
    };
  }

  return {
    secret,
  };
}
