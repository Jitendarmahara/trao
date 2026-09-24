/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  // Proxy /api/* to the backend so the browser calls the frontend origin — no CORS,
  // and the httpOnly session cookie is same-origin. Set BACKEND_URL in production.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backend}/:path*` }];
  },
};

export default nextConfig;
