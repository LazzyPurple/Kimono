import { redirect } from "next/navigation";

import { buildPathWithParams, toUrlSearchParams, type SearchParamRecord } from "@/lib/admin/admin-access";

export const dynamic = "force-dynamic";

export default async function LegacyHealthRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamRecord>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  redirect(buildPathWithParams("/admin/health", toUrlSearchParams(resolvedParams)));
}
