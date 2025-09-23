import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    domains: ['lh3.googleusercontent.com', 'firebasestorage.googleapis.com'],
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin']
  }
};

export default nextConfig;