import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import Footer from "@/components/Footer";
import "./globals.css";

/**
 * Lauda type pairing: Plus Jakarta Sans carries everything; Instrument Serif
 * appears once per hero, italic, as a single emphasis word. Both are
 * self-hosted by `next/font`, so no request ever leaves for Google. The
 * `-next` suffix keeps these raw variables distinct from the semantic
 * `--font-sans` / `--font-serif` tokens in globals.css, which add fallbacks.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans-next",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-serif-next",
});

export const metadata: Metadata = {
  title: "Lauda — Formatador de Relatórios",
  description:
    "Formata o teu currículo de internato segundo as normas do Colégio da especialidade.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-PT" className={`${jakarta.variable} ${instrumentSerif.variable}`}>
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
