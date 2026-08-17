import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800", "900"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

/**
 * The **fallback** for a route that sets no metadata of its own, so it names the
 * site and nothing narrower.
 *
 * It used to read "Aetherfield — Design System", a leftover from when
 * `/design-system` was the only route. Seven routes later the homepage's tab,
 * its bookmark, its search result and every unfurl read as the internal
 * styleguide (prompt 112). That string moved to `/design-system`, the page it
 * was written for.
 *
 * **No `title.template`.** Every other route already writes its full
 * `"<Page> — Aetherfield"` string, so a template would have to be threaded
 * through twenty of them to remove a suffix none of them minds repeating.
 *
 * The description is the homepage's own subline, verbatim, rather than new
 * marketing prose — §5 states the thesis and forbids re-deriving it. Both
 * strings are **editorial judgements**; there is no comp for a `<title>`.
 */
export const metadata: Metadata = {
  title: "Aetherfield",
  description:
    "Track impact, reduce emissions, and accelerate progress—with clarity and confidence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${newsreader.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
