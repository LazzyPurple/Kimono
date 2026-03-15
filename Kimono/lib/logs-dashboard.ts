import { collectAuthDebugSnapshot, collectPublicRuntimeEnvProbe } from "./auth-debug-route.ts";
import { getLogsRoutePayload } from "./logs-route.ts";

import type { DataStore } from "./data-store.ts";

type AuthDebugStore = Pick<DataStore, "getOrCreateAdminUser" | "disconnect">;

export async function getLogsDashboardData(options: {
  url: string;
  getStore?: () => Promise<AuthDebugStore>;
}) {
  const logs = await getLogsRoutePayload(options.url);
  const runtime = collectPublicRuntimeEnvProbe();
  const auth = await collectAuthDebugSnapshot({
    getStore: options.getStore,
  });

  return {
    logs,
    auth: {
      runtime,
      auth,
    },
  };
}
