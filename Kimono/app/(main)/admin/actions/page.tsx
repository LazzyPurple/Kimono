import type { Metadata } from "next";

import { AdminActionButton } from "@/components/admin/AdminActionButton";

export const metadata: Metadata = {
  title: "Admin Actions | Kimono",
};

const ACTIONS = [
  {
    action: "/api/admin/actions/reset-db",
    label: "Reset DB",
    description: "Purge les caches reconstructibles : Post, MediaAsset, MediaSource, FavoriteCache et DiscoveryCache.",
    confirmMessage: "Purger les caches reconstructibles ?",
  },
  {
    action: "/api/admin/actions/resync-creator-index",
    label: "Re-sync CreatorIndex",
    description: "Relance l'import complet des catalogues Kemono et Coomer sans redemarrer le serveur.",
  },
  {
    action: "/api/admin/actions/resync-popular",
    label: "Re-sync Popular",
    description: "Recharge les posts populaires Kemono + Coomer et les re-ecrit dans Post.",
  },
  {
    action: "/api/admin/actions/resync-favorites",
    label: "Re-sync Favoris",
    description: "Regenera les caches favoris depuis les sessions Kemono/Coomer sauvegardees.",
  },
  {
    action: "/api/admin/actions/purge-media",
    label: "Purge Media",
    description: "Supprime les previews et sources video expirees selon les TTL runtime.",
  },
  {
    action: "/api/admin/actions/clear-cooldown",
    label: "Clear Cooldown",
    description: "Efface manuellement le cooldown upstream Coomer.",
  },
];

export default function AdminActionsPage() {
  return (
    <>
      <div className="neo-panel p-6 sm:p-8">
        <p className="neo-label mb-4">Actions</p>
        <h1 className="neo-heading mb-3">Maintenance operations</h1>
        <p className="max-w-3xl text-base leading-7 text-[#888888]">
          Maintenance server-first sur PostgreSQL et les caches runtime, sans passer par des scripts manuels.
        </p>
      </div>

      <div className="grid gap-4">
        {ACTIONS.map((item) => (
          <AdminActionButton key={item.action} {...item} />
        ))}
      </div>
    </>
  );
}
