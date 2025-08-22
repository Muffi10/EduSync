import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  
  trailingSlash: true,
  images: {
    domains: ['lh3.googleusercontent.com', 'firebasestorage.googleapis.com'],
    unoptimized: true, // Required for static export
  }
};

export default nextConfig;