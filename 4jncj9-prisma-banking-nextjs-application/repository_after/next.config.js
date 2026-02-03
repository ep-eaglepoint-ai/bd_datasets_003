/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure Prisma client stays server-side only
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  // Webpack configuration to exclude Prisma from client bundle
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't include Prisma in client bundle
      config.resolve.alias = {
        ...config.resolve.alias,
        '@prisma/client': false,
        '.prisma/client': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
