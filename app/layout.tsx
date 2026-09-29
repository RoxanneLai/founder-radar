import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RightRoom",
  description:
    "A career-event discovery platform for finding worthwhile in-person professional events in New York City.",
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
