import type { Metadata } from "next";
import Link from "next/link";
import { getLogsDashboardData } from "@/lib/logs-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Logs | Kimono",
  description: "Temporary public debugging view for Kimono server and client logs.",
};

type SearchParamValue = string | string[] | undefined;

function firstParam(value: SearchParamValue): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

const SOURCE_OPTIONS = ["all", "auth", "db", "api", "server", "client"];
const LEVEL_OPTIONS = ["all", "debug", "info", "warn", "error"];

export default async function LogsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const source = firstParam(resolvedParams.source);
  const levelParam = firstParam(resolvedParams.level);
  const q = firstParam(resolvedParams.q);
  const limit = Number(firstParam(resolvedParams.limit) ?? "200") || 200;

  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (levelParam) params.set("level", levelParam);
  if (q) params.set("q", q);
  params.set("limit", String(limit));

  const dashboard = await getLogsDashboardData({
    url: `http://localhost/logs?${params.toString()}`,
  });

  const logs = dashboard.logs.logs;
  const authSnapshot = dashboard.auth.auth;
  const runtimeSnapshot = dashboard.auth.runtime;
  const databaseUrlDebug = runtimeSnapshot.env.databaseUrlDebug;

  return (
    <main className="min-h-screen bg-[#05050a] px-3 py-5 text-[#f0f0f5] sm:px-5 sm:py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-4 lg:space-y-5">
        <section className="rounded-[28px] border border-[#1e1e2e] bg-[linear-gradient(135deg,rgba(16,16,26,0.98),rgba(12,12,20,0.94))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.42)] sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.34em] text-[#8b5cf6]">Kimono Debug</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-[2.35rem]">Logs</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9ca3af] sm:text-[15px]">
                This page is temporarily public for production debugging. Remove or secure it after the current
                incidents are resolved.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link
                href="/api/logs"
                className="inline-flex h-11 items-center justify-center rounded-full border border-[#312e81] px-5 text-sm font-medium text-[#d9ccff] transition hover:border-[#4c1d95] hover:bg-[#17172a] hover:text-white"
              >
                Raw JSON
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
          <article className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.32)] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[#8b5cf6]">Auth / DB health</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Runtime probe</h2>
              </div>
              <span
                className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                  authSnapshot.database.ok
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-red-500/15 text-red-300"
                }`}
              >
                {authSnapshot.database.ok ? "Database OK" : "Database error"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              <div className="rounded-2xl border border-[#202034] bg-[#0b0b13] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6b7280]">Mode</p>
                <p className="mt-2 text-base font-medium text-white">{runtimeSnapshot.nodeEnv ?? "unknown"}</p>
                <p className="mt-1 text-sm text-[#9ca3af]">
                  Local dev: {runtimeSnapshot.localDevMode ? "enabled" : "disabled"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#202034] bg-[#0b0b13] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6b7280]">Credential auth</p>
                <p className="mt-2 text-base font-medium text-white">
                  {runtimeSnapshot.credentialAuthEnabled ? "enabled" : "disabled"}
                </p>
                <p className="mt-1 text-sm text-[#9ca3af] break-words">
                  Admin password: {runtimeSnapshot.env.adminPasswordConfigured ? "configured" : "missing"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#202034] bg-[#0b0b13] p-4 md:col-span-2 2xl:col-span-1">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6b7280]">Database URL</p>
                <p className="mt-2 text-base font-medium text-white">
                  {runtimeSnapshot.env.databaseUrlConfigured ? "configured" : "missing"}
                </p>
                <p className="mt-1 text-sm text-[#9ca3af] break-words">
                  Auth secret: {runtimeSnapshot.env.authSecretConfigured ? "configured" : "missing"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[#202034] bg-[#09090f] p-4 text-sm text-[#d1d5db]">
              {authSnapshot.database.ok ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <p className="break-words">
                    <span className="text-[#9ca3af]">Admin user:</span> {authSnapshot.database.adminUser.email}
                  </p>
                  <p className="break-all">
                    <span className="text-[#9ca3af]">User ID:</span> {authSnapshot.database.adminUser.id}
                  </p>
                  <p>
                    <span className="text-[#9ca3af]">TOTP:</span>{" "}
                    {authSnapshot.database.adminUser.totpEnabled ? "enabled" : "disabled"}
                  </p>
                  <p>
                    <span className="text-[#9ca3af]">Created at:</span>{" "}
                    {new Date(authSnapshot.database.adminUser.createdAt).toLocaleString("en-GB")}
                  </p>
                </div>
              ) : (
                <pre className="max-h-[26rem] overflow-auto whitespace-pre-wrap break-words text-xs text-red-200">
                  {JSON.stringify(authSnapshot.database.error, null, 2)}
                </pre>
              )}
            </div>

            {databaseUrlDebug ? (
              <div className="mt-4 rounded-2xl border border-[#202034] bg-[#09090f] p-4 text-sm text-[#d1d5db]">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#8b5cf6]">Database URL diagnostics</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <p><span className="text-[#9ca3af]">Scheme:</span> {databaseUrlDebug.scheme ?? "unknown"}</p>
                  <p className="break-all"><span className="text-[#9ca3af]">Username:</span> {databaseUrlDebug.username ?? "unknown"}</p>
                  <p><span className="text-[#9ca3af]">Host:</span> {databaseUrlDebug.hostname ?? "unknown"}</p>
                  <p><span className="text-[#9ca3af]">Port:</span> {databaseUrlDebug.port ?? "unknown"}</p>
                  <p className="break-all"><span className="text-[#9ca3af]">Database:</span> {databaseUrlDebug.databaseName ?? "unknown"}</p>
                  <p><span className="text-[#9ca3af]">Password length:</span> {databaseUrlDebug.passwordLength}</p>
                  <p><span className="text-[#9ca3af]">Has whitespace:</span> {databaseUrlDebug.hasWhitespace ? "yes" : "no"}</p>
                  <p><span className="text-[#9ca3af]">Has newline:</span> {databaseUrlDebug.hasNewline ? "yes" : "no"}</p>
                  <p><span className="text-[#9ca3af]">Has quotes:</span> {databaseUrlDebug.hasQuotes ? "yes" : "no"}</p>
                  <p><span className="text-[#9ca3af]">Edge whitespace:</span> {databaseUrlDebug.hasLeadingOrTrailingWhitespace ? "yes" : "no"}</p>
                  <p><span className="text-[#9ca3af]">Parseable:</span> {databaseUrlDebug.parseable ? "yes" : "no"}</p>
                  <p className="break-all"><span className="text-[#9ca3af]">Runtime hash:</span> {databaseUrlDebug.valueHash}</p>
                </div>
              </div>
            ) : null}
          </article>

          <article className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.32)] sm:p-5">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#8b5cf6]">Raw auth snapshot</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Embedded auth-check data</h2>
            <p className="mt-2 text-sm leading-6 text-[#9ca3af]">
              Live runtime probe merged into the logs view so the debugging surface stays in one place.
            </p>
            <pre className="mt-4 max-h-[26rem] overflow-auto rounded-2xl border border-[#1d1d2b] bg-[#09090f] p-4 text-xs leading-6 text-[#d1d5db]">
              {JSON.stringify(dashboard.auth, null, 2)}
            </pre>
          </article>
        </section>

        <form className="grid gap-3 rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-4 shadow-[0_16px_32px_rgba(0,0,0,0.28)] sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_120px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search logs"
            className="h-11 rounded-xl border border-[#232336] bg-[#0b0b13] px-4 text-sm text-white placeholder:text-[#6b7280]"
          />
          <select
            name="source"
            defaultValue={source ?? "all"}
            className="h-11 rounded-xl border border-[#232336] bg-[#0b0b13] px-3 text-sm text-white"
          >
            {SOURCE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All sources" : option}
              </option>
            ))}
          </select>
          <select
            name="level"
            defaultValue={levelParam ?? "all"}
            className="h-11 rounded-xl border border-[#232336] bg-[#0b0b13] px-3 text-sm text-white"
          >
            {LEVEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All levels" : option}
              </option>
            ))}
          </select>
          <input
            type="number"
            name="limit"
            min={1}
            max={500}
            defaultValue={String(Math.max(1, Math.min(500, limit)))}
            className="h-11 rounded-xl border border-[#232336] bg-[#0b0b13] px-4 text-sm text-white"
          />
          <button
            type="submit"
            className="h-11 rounded-xl bg-[#7c3aed] px-5 text-sm font-medium text-white transition hover:bg-[#6d28d9]"
          >
            Refresh
          </button>
        </form>

        <div className="flex flex-col gap-1 text-sm text-[#9ca3af] sm:flex-row sm:items-center sm:justify-between">
          <p>{logs.length} log entries loaded</p>
          <p>Newest first</p>
        </div>

        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[#2a2a3a] bg-[#0d0d15] p-8 text-center text-[#9ca3af]">
              No logs found for the current filters.
            </div>
          ) : (
            logs.map((entry) => (
              <article
                key={entry.id}
                className="rounded-[24px] border border-[#1e1e2e] bg-[#0d0d15] p-4 shadow-[0_12px_35px_rgba(0,0,0,0.35)]"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#9ca3af]">
                      <span
                        className={`rounded-full px-2 py-1 font-semibold ${
                          entry.level === "error"
                            ? "bg-red-500/15 text-red-300"
                            : entry.level === "warn"
                              ? "bg-amber-500/15 text-amber-300"
                              : entry.level === "info"
                                ? "bg-sky-500/15 text-sky-300"
                                : "bg-slate-500/15 text-slate-300"
                        }`}
                      >
                        {entry.level}
                      </span>
                      <span className="rounded-full bg-[#17172a] px-2 py-1 text-[#c4b5fd]">{entry.source}</span>
                      <span>{new Date(entry.timestamp).toLocaleString("en-GB")}</span>
                    </div>
                    <h2 className="text-base font-medium text-white break-words">{entry.message}</h2>
                  </div>
                  <code className="text-xs break-all text-[#6b7280] lg:max-w-[18rem]">{entry.id}</code>
                </div>
                {entry.details ? (
                  <pre className="mt-4 max-h-[24rem] overflow-auto rounded-2xl border border-[#1d1d2b] bg-[#09090f] p-4 text-xs leading-6 text-[#d1d5db]">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
