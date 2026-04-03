export const metadata = {
  title: 'JudX — Inteligência Jurisprudencial',
  description: '169.851 decisões do STF estruturadas e normalizadas. O que o Supremo realmente decide.',
  openGraph: {
    title: 'JudX — O que o Supremo realmente decide.',
    description: '79% das decisões do STF não apreciam o mérito. Sabemos quem ganha, quando e com qual relator.',
    url: 'https://judx-platform.vercel.app/',
    images: [{ url: 'https://judx-platform.vercel.app/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JudX — O que o Supremo realmente decide.',
    description: '79% das decisões do STF não apreciam o mérito.',
  },
};

export default function Home() {
  return (
    <iframe
      src="/landing-content.html"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
        margin: 0,
        padding: 0,
      }}
    />
  );
}
