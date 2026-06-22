import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import "./globals.css";

// Lilita One ≈ Supercell's chunky display font; Nunito for readable body text.
const display = Lilita_One({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clash Royale Deck Builder",
  description: "Personalized, proven decks built from the cards you actually own.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
