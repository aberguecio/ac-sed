import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // sharp ships native binaries; never bundle it.
  serverExternalPackages: ['sharp'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.s3.*.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'liga-b.nyc3.digitaloceanspaces.com',
      },
    ],
  },
}

export default nextConfig
