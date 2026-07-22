/**
 * Only allow same-app relative paths for ?back= (no open redirects).
 */
export function safeInternalPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) return fallback;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes("://")) return fallback;
  return decoded;
}
