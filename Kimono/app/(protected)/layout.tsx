import { isLocalDevMode } from "@/lib/local-dev-mode";
import ProtectedLayoutAuthGate from "@/components/ProtectedLayoutAuthGate";
import ProtectedLayoutShell from "@/components/ProtectedLayoutShell";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isLocalDevMode()) {
    return (
      <ProtectedLayoutShell showSecurityControls={false}>
        {children}
      </ProtectedLayoutShell>
    );
  }

  return <ProtectedLayoutAuthGate>{children}</ProtectedLayoutAuthGate>;
}
