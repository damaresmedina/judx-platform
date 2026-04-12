import type { Metadata } from "next";
import { Playfair_Display, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500"],
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "JudX — Inteligência Jurisprudencial",
  description: "O judiciário brasileiro, inteiro, legível.",
  openGraph: {
    title: "JudX — Inteligência Jurisprudencial",
    description: "O judiciário brasileiro, inteiro, legível.",
    url: "https://judx.com.br",
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
    title: "JudX — Inteligência Jurisprudencial",
    description: "O judiciário brasileiro, inteiro, legível.",
    images: ["https://judx.com.br/og-investor.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${playfair.variable} ${dmSans.variable} ${dmMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
