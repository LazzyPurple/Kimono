import type { Metadata } from "next";
import BrowserErrorLogger from "@/components/BrowserErrorLogger";
import Providers from "@/components/Providers";
import { isLocalDevMode } from "@/lib/local-dev-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kimono - Frontend Kemono & Coomer",
  description:
    "Frontend personnel unifie pour Kemono.cr et Coomer.st. Explorez, recherchez et gerez vos favoris.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localDevMode = isLocalDevMode();

  return (
    <html lang="fr">
      <body className="antialiased">
        <Providers localDevMode={localDevMode}>
          <BrowserErrorLogger />
          {children}
        </Providers>
      </body>
    </html>
  );
}


