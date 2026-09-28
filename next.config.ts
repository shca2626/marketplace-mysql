import type { NextConfig } from "next";

// STORAGE_PUBLIC_BASE (STORE-1 ftp-hosting driver) — when file storage serves
// from a public host (e.g. https://yusr.site.je/storage), its origin must be
// allowed for <img>/CSS images, else CSP blocks direct public URLs. Redirects
// (like /api/media → public hosting 307) bypass CSP by spec, so this only
// matters for URLs used directly in the UI.
const storagePublicBase = process.env.STORAGE_PUBLIC_BASE?.trim() ?? "";
let storageImgSrc = "";
if (storagePublicBase) {
  try {
    storageImgSrc = ` ${new URL(storagePublicBase).origin}`;
  } catch {
    // Malformed base — ignore rather than emit a broken CSP directive.
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  devIndicators: false,

  // Security headers (09-security-threat-model §12 roadmap P1-5).
  // CSP is the pragmatic Next.js profile: scripts/styles allow inline (dev
  // HMR + Next's bootstrap chunks) but everything else is locked to self —
  // frame-ancestors, base-uri, object-src and form-action are the strong
  // wins here. A nonce-based CSP is the follow-up (needs middleware).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `img-src 'self' data: blob:${storageImgSrc}`,
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
      {
        // Media renditions are content-addressed and immutable — let shared
        // caches/CDNs hold them for a year (matches /api/media route headers).
        source: "/api/media/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
