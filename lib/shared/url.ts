/**
 * Job URLs are stored for one purpose: opening the listing again months later.
 * That makes validity the only property worth enforcing — a value that silently
 * does not open is worse than an empty field, because an empty field is visible.
 *
 * A pasted value missing its scheme is the common case (copying from a browser's
 * address bar drops it) and is repaired rather than rejected. Anything that is
 * not a plausible http(s) address is refused.
 */
export function normalizeUrl(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Rules out "https://localhost" and, more usefully, a sentence that
    // happened to parse.
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Host only, for a tracker row that has no room for a full URL. */
export function displayHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
