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
  async rewrites() {
    return [
      { source: '/serie-historica', destination: '/serie-historica.html' },
      { source: '/rede-de-acesso', destination: '/rede-de-acesso.html' },
      { source: '/colapso-silencioso', destination: '/colapso-silencioso.html' },
      { source: '/linha-sucessoria', destination: '/linha-sucessoria.html' },
    ];
  },
};

export default nextConfig;
