// Security headers for the website (the web app's pages, scripts and icons).
// Used by the one-process preview (preview.ts); vercel.json carries the same list for the Vercel
// deployment, and test/web-headers.test.ts fails if the two ever differ.
//
// The Content-Security-Policy allows only this site itself plus the privacy-enhanced YouTube player
// (lesson videos). If the app ever talks to an API on another domain, add it to connect-src.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // react-native-web writes its styles into <style> tags at run time
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "frame-src https://www.youtube-nocookie.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const WEB_SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  // YouTube needs the site's origin (not the full address) to play embedded videos
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  // lessons are unreviewed drafts: keep search engines out until launch
  "X-Robots-Tag": "noindex, nofollow",
};
