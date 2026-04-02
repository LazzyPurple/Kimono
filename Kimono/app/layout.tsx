import type { Metadata } from "next";
import Providers from "@/components/Providers";
import { isLocalDevMode } from "@/lib/local-dev-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kimono",
  description: "Kimono reset shell for Kemono and Coomer.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers localDevMode={isLocalDevMode()}>{children}</Providers>
      </body>
    </html>
  );
}