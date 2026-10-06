/**
 * The Content-Security-Policy for the website (web/). The bridge sends it with every page, and `vite preview` sends the same
 * one so the website's route check catches violations: everything from our own origin, nothing inline, no third parties.
 */
export const SITE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");
