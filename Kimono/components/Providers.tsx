"use client";

import { SessionProvider } from "next-auth/react";

export default function Providers({
  children,
  localDevMode = false,
}: {
  children: React.ReactNode;
  localDevMode?: boolean;
}) {
  if (localDevMode) {
    return <>{children}</>;
  }

  return <SessionProvider>{children}</SessionProvider>;
}
