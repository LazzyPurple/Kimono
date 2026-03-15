import type { Metadata } from "next";
import BrowserErrorLogger from "@/components/BrowserErrorLogger";
import Providers from "@/components/Providers";
import { isLocalDevMode } from "@/lib/local-dev-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kimono",
  description:
    "A personal unified frontend for Kemono.cr and Coomer.st. Browse, search, and manage your favorites faster.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localDevMode = isLocalDevMode();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://img.kemono.cr" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://img.coomer.st" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://kemono.cr" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://coomer.st" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <Providers localDevMode={localDevMode}>
          <BrowserErrorLogger />
          {children}
        </Providers>
      </body>
    </html>
  );
}
