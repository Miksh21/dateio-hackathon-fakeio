import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Dateio brand font. latin-ext covers Czech diacritics (ě š č ř ž ů …).
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "360° Feedback · Dateio",
  description: "360° feedback platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
