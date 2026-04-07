export const metadata = {
  title: 'JudX — Inteligência Jurisprudencial',
  description: 'Mais de 3 milhões de decisões do STF e STJ, tudo em um só lugar. O que o Supremo realmente decide.',
  openGraph: {
    title: 'JudX — O judiciário brasileiro, inteiro, legível.',
    description: 'Mais de 3 milhões de decisões do STF e STJ, tudo em um só lugar. 27 tribunais mapeados.',
    url: 'https://judx.com.br/',
    images: [{ url: 'https://judx.com.br/og.png', width: 1200, height: 630 }],
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
