"use client";

import { SessionProvider } from "next-auth/react";
import { LikesProvider } from "@/contexts/LikesContext";

export default function Providers({
  children,
  localDevMode = false,
}: {
  children: React.ReactNode;
  localDevMode?: boolean;
}) {
  if (localDevMode) {
    return <LikesProvider>{children}</LikesProvider>;
  }

  return (
    <SessionProvider>
      <LikesProvider>{children}</LikesProvider>
    </SessionProvider>
  );
}
