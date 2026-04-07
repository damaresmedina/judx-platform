export const metadata = {
  title: 'JudX — Inteligência Jurisprudencial',
  description: 'Quase 3 milhoes de decisoes do STF estruturadas desde 1940. O que o Supremo realmente decide.',
  openGraph: {
    title: 'JudX — O judiciario brasileiro, inteiro, legivel.',
    description: 'Quase 3 milhoes de decisoes do STF desde 1940. 27 tribunais mapeados. Hierarquia, acervo, despesa, produtividade — tudo num lugar so.',
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
