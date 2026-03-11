import type { Metadata } from "next";
import Providers from "@/components/Providers";
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
  return (
    <html lang="fr">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}