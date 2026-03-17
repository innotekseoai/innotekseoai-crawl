import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['sql.js', 'node-llama-cpp', 'better-sqlite3'],
  webpack: (config) => {
    // Resolve .js imports to .ts files (ESM compatibility)
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };

    return config;
  },
};

export default nextConfig;
