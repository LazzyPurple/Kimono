import { collectAuthDebugSnapshot } from "./auth-debug-route.ts";
import { getLogsRoutePayload } from "./logs-route.ts";

import type { DataStore } from "./db/index.ts";

type AuthDebugStore = Pick<DataStore, "getOrCreateAdminUser" | "disconnect">;

export async function getLogsDashboardData(options: {
  url: string;
  getStore?: () => Promise<AuthDebugStore>;
}) {
  const logs = await getLogsRoutePayload(options.url);
  const auth = await collectAuthDebugSnapshot({
    getStore: options.getStore,
  });

  return {
    logs,
    auth,
  };
}
