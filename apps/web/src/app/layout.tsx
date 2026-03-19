import type { Metadata } from "next";
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
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
        {children}
      </body>
    </html>
  );
}
