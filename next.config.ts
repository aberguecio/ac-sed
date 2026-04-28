import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // sharp ships native binaries; never bundle it.
  serverExternalPackages: ['sharp'],
  webpack: (config, { nextRuntime }) => {
    // Belt-and-braces: even though instrumentation.ts only imports the node
    // bootstrap inside `if (NEXT_RUNTIME === 'nodejs')`, webpack still walks
    // the reachability graph. Stub out node-only builtins on edge so the
    // unused chain compiles cleanly.
    if (nextRuntime === 'edge') {
      config.resolve = config.resolve || {}
      config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false, path: false }
    }
    return config
  },
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
