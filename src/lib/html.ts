/**
 * Escapes text destined for raw HTML Chromium renders as-is (PDF header/footer
 * templates, cover pages) — untrusted input (a filename, a name pulled from the
 * uploaded document) must never be interpolated unescaped.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
