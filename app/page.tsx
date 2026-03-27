export const metadata = {
  title: 'JudX — Inteligência Jurisprudencial',
  description: '169.851 decisões do STF estruturadas e normalizadas. O que o Supremo realmente decide.',
};

export default function Home() {
  return (
    <iframe
      src="/landing.html"
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
