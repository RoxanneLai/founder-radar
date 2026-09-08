import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FounderRadar",
  description:
    "A shortlist of published NYC startup events. Explore upcoming events and a separately labeled fictional sample edition.",
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
