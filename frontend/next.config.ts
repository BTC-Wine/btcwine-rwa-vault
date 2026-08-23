import type { NextConfig } from "next";

// En-tetes de securite appliques a TOUTES les pages. netlify.toml [[headers]]
// ne couvre que les fichiers statiques avec le plugin Next, pas les pages
// rendues : c'est ici que la protection anti-clickjacking (frame-ancestors /
// X-Frame-Options) doit vivre pour couvrir les pages elles-memes.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  images: {
    // 55 : hero plein ecran voile par un degrade, la compression ne se voit pas
    qualities: [55, 75],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
