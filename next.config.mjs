/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.judx.com.br' }],
        destination: 'https://judx.com.br/:path*',
        permanent: true,
      },
      {
        source: '/landing.html',
        destination: '/',
        permanent: true,
      },
      {
        source: '/taxa-provimento',
        destination: '/',
        permanent: false,
      },
      {
        source: '/taxa_provimento.html',
        destination: '/',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/landing-content.html' },
      ],
      afterFiles: [
        { source: '/caixa', destination: '/d/x8jv-amtw-4b3r' },
        { source: '/en', destination: '/landing-en.html' },
        { source: '/serie-historica', destination: '/serie-historica.html' },
        { source: '/rede-de-acesso', destination: '/rede-de-acesso.html' },
        { source: '/colapso-silencioso', destination: '/colapso-silencioso.html' },
        { source: '/linha-sucessoria', destination: '/linha-sucessoria.html' },
      ],
    };
  },
};

export default nextConfig;
