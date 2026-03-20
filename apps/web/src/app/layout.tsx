import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "./components/Footer";
import { ThemeToggle } from "./components/ThemeToggle";
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
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
})();`,
          }}
        />
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
            <nav className="flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-300">
              <Link className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800" href="/convert/images">
                Convert Images
              </Link>
              <Link className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800" href="/convert/videos">
                Convert Videos
              </Link>
              <Link className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800" href="/compress/images">
                Compress Images
              </Link>
              <Link className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800" href="/compress/videos">
                Compress Videos
              </Link>
              <Link className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800" href="/upscale/images">
                Upscale Images
              </Link>
              <ThemeToggle />
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
