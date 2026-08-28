import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FounderRadar",
  description:
    "Don’t show me every startup event. Show me the ones worth attending. A fictional NYC event shortlist demonstrating FounderRadar’s V0 product experience.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
