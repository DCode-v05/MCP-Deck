import type { Metadata } from "next";
import { Fraunces, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MCP Deck — Interactive UI Responses",
  description: "Prototype that turns one prompt into a persistent, cross-app agent that authors live, interactive UI over your real MCP tools.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`h-full ${fraunces.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="h-full antialiased font-sans">{children}</body>
    </html>
  );
}
