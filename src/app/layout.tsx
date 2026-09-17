import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import Footer from "@/components/Footer";
import "./globals.css";

/**
 * Editorial type pairing (DIO-37): Fraunces, a serif with real display
 * character, for headings; Source Sans 3 for body copy. Both are variable
 * fonts self-hosted by `next/font`, so no request ever leaves for Google.
 * The `-next` suffix keeps these raw variables distinct from the semantic
 * `--font-display` / `--font-body` tokens in globals.css, which add the
 * fallback stacks.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-next",
  axes: ["opsz"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body-next",
});

export const metadata: Metadata = {
  title: "Formatador de Relatórios",
  description:
    "Formata o teu currículo de internato segundo as normas do Colégio da especialidade.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-PT" className={`${fraunces.variable} ${sourceSans.variable}`}>
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
