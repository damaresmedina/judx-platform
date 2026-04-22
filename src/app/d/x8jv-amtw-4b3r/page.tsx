import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documento',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function Page() {
  return (
    <iframe
      src="/caixa-doc.html"
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', border: 'none' }}
      title="Documento"
    />
  );
}
