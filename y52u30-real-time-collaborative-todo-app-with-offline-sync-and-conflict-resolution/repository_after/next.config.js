/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Requirement 3: WebSocket connections cannot be handled in App Router API routes
  // We use a custom server (server.js) instead
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
