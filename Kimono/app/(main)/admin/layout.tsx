import { headers } from "next/headers";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { DiagnosticsLocked } from "@/components/main/DiagnosticsPrimitives";
import { getCurrentDiagnosticAccessDecision, shouldEnableDiagnosticBypass } from "@/lib/diagnostic-access";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const decision = await getCurrentDiagnosticAccessDecision({
    headers: requestHeaders,
  });
  const bypassEnabled = shouldEnableDiagnosticBypass();

  if (decision.type !== "allowed") {
    return <DiagnosticsLocked bypassEnabled={bypassEnabled} />;
  }

  return (
    <section className="neo-wrap py-10 sm:py-14">
      <div className="grid gap-8 xl:grid-cols-[320px,1fr]">
        <AdminSidebar />
        <div className="grid gap-6">{children}</div>
      </div>
    </section>
  );
}
