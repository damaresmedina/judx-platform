import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'JudX — Inteligência Jurisprudencial',
  description: 'Proposta Caixa · judx.com.br',
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
    title: 'JudX — Inteligência Jurisprudencial',
    description: 'Proposta Caixa · judx.com.br',
    url: 'https://judx.com.br/d/x8jv-amtw-4b3r',
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
    title: 'JudX — Inteligência Jurisprudencial',
    description: 'Proposta Caixa · judx.com.br',
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
