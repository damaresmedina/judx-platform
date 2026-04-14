import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'JudX — Apresentação Caixa',
  description: 'Proposta de parceria institucional',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'none',
      'max-snippet': -1,
    },
  },
  referrer: 'no-referrer',
  openGraph: {
    title: 'JudX — Apresentação Caixa',
    description: 'Proposta de parceria institucional',
    url: 'https://judx.com.br/caixa',
    siteName: 'JudX',
    images: [
      {
        url: 'https://judx.com.br/og-judx-2026.png',
        width: 1200,
        height: 630,
        alt: 'JudX',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JudX — Apresentação Caixa',
    description: 'Proposta de parceria institucional',
    images: ['https://judx.com.br/og-judx-2026.png'],
  },
};

export default function Page() {
  return (
    <iframe
      src="/caixa-doc.html"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
      }}
      title="Documento"
    />
  );
}
