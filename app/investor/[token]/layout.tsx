import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JudX — Investor Brief",
  description: "Judicial Intelligence Infrastructure — Confidential",
  robots: { index: false, follow: false },
  openGraph: {
    title: "JudX — Investor Brief",
    description: "Judicial Intelligence Infrastructure — Confidential",
    url: "https://judx.com.br/investor",
    siteName: "JudX",
    images: [
      {
        url: "https://judx.com.br/og-investor.jpg",
        width: 1200,
        height: 630,
        alt: "JudX — Judicial Intelligence",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "JudX — Investor Brief",
    description: "Judicial Intelligence Infrastructure — Confidential",
    images: ["https://judx.com.br/og-investor.jpg"],
  },
};

export default function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
