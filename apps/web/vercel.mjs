// Git builds evaluate this config before project environment variables are injected.
const apiOrigin = process.env.API_ORIGIN || 'https://api-production-85dd.up.railway.app';
const url = new URL(apiOrigin);
if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('API_ORIGIN must be an HTTPS origin without a path');
}

export const config = {
  framework: 'vite',
  rewrites: [
    { source: '/api/:path*', destination: `${url.origin}/api/:path*` },
    { source: '/:path*', destination: '/index.html' },
  ],
};
