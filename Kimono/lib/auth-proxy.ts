type GetProxyTokenOptionsInput = {
  secret: string | undefined;
  nodeEnv?: string | undefined;
};

export function getProxyTokenOptions({
  secret,
  nodeEnv = process.env.NODE_ENV,
}: GetProxyTokenOptionsInput) {
  if (nodeEnv === "production") {
    return {
      secret,
      secureCookie: true,
      cookieName: "__Secure-authjs.session-token",
    };
  }

  return {
    secret,
  };
}