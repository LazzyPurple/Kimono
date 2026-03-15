export function parseBooleanFlag(value?: string | null): boolean {
  if (value == null) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

export function resolveLocalDevMode(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }

  return parseBooleanFlag(env.LOCAL_DEV_MODE);
}

export function isLocalDevMode(): boolean {
  return resolveLocalDevMode(process.env);
}
