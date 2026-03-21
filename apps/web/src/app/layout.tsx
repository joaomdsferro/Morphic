import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Footer } from "./components/Footer";
import { MainNav } from "./components/MainNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Morphic",
  description: "Convert, compress, upscale EVERYTHING locally.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{`(() => {
  try {
    const savedTheme = localStorage.getItem('morphic-theme');
    const theme = savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }
})();`}</Script>
      </head>
      <body className="min-h-screen bg-(--background) text-(--foreground)">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6">
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white select-none">
                M
              </span>
              <span className="text-sm font-bold tracking-tight">Morphic</span>
            </Link>
            <MainNav />
          </header>
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
