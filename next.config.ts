/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... other config
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors. Make sure you lint separately!
    ignoreDuringBuilds: true,
  },
  // ... other config
};

module.exports = nextConfig;