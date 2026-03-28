import type { Metadata } from "next";

import { AdminActionButton } from "@/components/admin/AdminActionButton";
import { requireAdminPageAccess } from "@/lib/admin/admin-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Actions | Kimono",
  description: "Protected maintenance controls for Kimono.",
};

const ACTIONS = [
  {
    label: "Reset DB",
    action: "/api/admin/actions/reset-db",
    description: "Purge les caches reconstructibles et les dossiers media associes. Equivalent manuel du reset de maintenance historique.",
    confirmMessage: "Confirmer le reset des caches reconstructibles ?",
  },
  {
    label: "Re-sync CreatorIndex",
    action: "/api/admin/actions/resync-creator-index",
    description: "Relance l’import complet du catalogue createurs Kemono + Coomer sans redemarrer le serveur.",
  },
  {
    label: "Re-sync Popular",
    action: "/api/admin/actions/resync-popular",
    description: "Force un refresh des snapshots Popular et des derivations associees.",
  },
  {
    label: "Re-sync Favoris",
    action: "/api/admin/actions/resync-favorites",
    description: "Regenere les snapshots favoris createurs et posts depuis les sessions sauvegardees.",
  },
  {
    label: "Purge Media",
    action: "/api/admin/actions/purge-media",
    description: "Supprime les previews et sources video expirees ainsi que leurs fichiers locaux.",
  },
];

export default async function AdminActionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  await requireAdminPageAccess("/admin/actions", resolvedParams);

  return (
    <div className="space-y-5">
      <section className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">Maintenance</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Actions</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9ca3af]">
          Les actions destructrices ou de re-synchronisation restent manuelles. Le reset startup a ete retire pour laisser la main depuis ce panneau.
        </p>
      </section>

      <section className="space-y-4">
        {ACTIONS.map((action) => (
          <AdminActionButton
            key={action.label}
            action={action.action}
            label={action.label}
            description={action.description}
            confirmMessage={action.confirmMessage}
          />
        ))}

        <AdminActionButton
          action="/api/admin/actions/clear-cooldown"
          label="Clear Cooldown"
          description="Reset manuel du cooldown upstream pour Coomer. Utile apres une phase 429 ou un faux positif WAF."
          body={{ site: "coomer" }}
          confirmMessage="Confirmer le reset de tous les cooldowns coomer ?"
        />
      </section>
    </div>
  );
}
