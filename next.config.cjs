/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  experimental: {
    serverComponentsExternalPackages: ['natural', 'winston']
  },
  webpack: (config, { isServer }) => {
    // Fix for natural library warnings in Next.js
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
        events: false,
      };
    }

    // Ignore Node.js-specific modules that aren't needed in browser
    config.externals = config.externals || [];
    config.externals.push({
      'webworker-threads': 'commonjs webworker-threads',
      'natural': 'commonjs natural',
    });

    // Ignore warnings for missing optional dependencies
    config.ignoreWarnings = [
      /Module not found: Can't resolve 'webworker-threads'/,
      /Module not found: Can't resolve 'fs'/,
      /Module not found: Can't resolve 'path'/,
      /Module not found: Can't resolve 'os'/,
      /Module not found: Can't resolve 'crypto'/,
      /Module not found: Can't resolve 'stream'/,
      /Module not found: Can't resolve 'util'/,
      /Module not found: Can't resolve 'buffer'/,
      /Module not found: Can't resolve 'events'/,
    ];

    return config;
  },
}

module.exports = nextConfig
