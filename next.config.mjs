import { execSync } from 'node:child_process';

function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

function buildDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)}`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Enable for Docker deployment
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  env: {
    NEXT_PUBLIC_BUILD_DATE: buildDate(),
    NEXT_PUBLIC_GIT_COMMIT: gitCommit(),
  },
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist", "playwright", "playwright-core"],
    // Dramatically reduces cold-start compile time by tree-shaking icon/component libraries
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-popover',
      '@radix-ui/react-avatar',
      '@radix-ui/react-toast',
      'date-fns',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "uploadthing.com",
      },
    ],
  },
  async rewrites() {
    return [
      { source: '/uploads/:path*', destination: '/api/uploads/:path*' },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        // no-store only on HTML pages and API — not on static assets (already excluded)
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
