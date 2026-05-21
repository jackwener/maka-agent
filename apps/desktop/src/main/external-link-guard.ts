/**
 * URL-scheme whitelist for the renderer's external-link guard. Used by both
 * `setWindowOpenHandler` and `will-navigate` to decide which URLs should be
 * handed off to the OS via `shell.openExternal`.
 *
 * Explicitly *not* allowed:
 *   - `file://`  — would let untrusted markdown reach the local filesystem
 *   - `javascript:` — XSS vector
 *   - `electron:` / `chrome-extension:` — internal schemes
 *   - everything else parsed by URL but not in the allow set
 *
 * Allowed:
 *   - http / https — external web
 *   - mailto — system mail client
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function isExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}
