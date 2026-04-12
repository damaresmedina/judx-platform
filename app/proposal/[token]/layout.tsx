import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JudX — Investor Brief",
  description: "Judicial Intelligence Infrastructure — Confidential",
  robots: { index: false, follow: true },
  openGraph: {
    title: "JudX — Investor Brief",
    description: "Judicial Intelligence Infrastructure — Confidential",
    url: "https://judx.com.br/investor",
    siteName: "JudX",
    images: [
      {
        url: "https://ejwyguskoiraredinqmb.supabase.co/storage/v1/object/public/og/judx-og.png",
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
    images: ["https://ejwyguskoiraredinqmb.supabase.co/storage/v1/object/public/og/judx-og.png"],
  },
};

export default function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
