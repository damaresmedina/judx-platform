import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JudX — Investor Brief",
  description: "Confidential investor brief",
  robots: { index: false, follow: false },
};

export default function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
