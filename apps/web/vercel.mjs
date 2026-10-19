const apiOrigin = process.env.API_ORIGIN;

if (!apiOrigin) throw new Error('Set API_ORIGIN to the public Railway API origin');
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
