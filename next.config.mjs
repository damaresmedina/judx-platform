/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/landing.html',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
