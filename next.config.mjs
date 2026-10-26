/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" },
      { source: "/anketa", destination: "/anketa.html" },
      { source: "/welcome", destination: "/welcome.html" },
      { source: "/level", destination: "/level.html" },
      { source: "/kostya", destination: "/kostya.html" },
      { source: "/misha", destination: "/misha.html" },
      { source: "/misha/homework", destination: "/misha-homework.html" },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
      {
        // Pre-generated pack audio and notes: they almost never change, so let phones keep them for a week.
        source: "/baked/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
