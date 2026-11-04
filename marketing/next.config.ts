import type { NextConfig } from 'next'

// A pure static export (out/), served by Cloudflare Pages like schedU's site.
// The app lives at app.revu.bhusku.com; this site links to it.
const nextConfig: NextConfig = {
  output: 'export',
}

export default nextConfig
