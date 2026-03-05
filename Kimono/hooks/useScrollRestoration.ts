"use client";

import { useEffect, useRef } from "react";

/**
 * Hook personnalisé pour sauvegarder et restaurer la position de défilement (scroll)
 * avec un identifiant de page unique en utilisant sessionStorage.
 *
 * @param pageKey - Clé unique représentant la page courante (ex: "kemono-patreon-1234")
 * @param isReady - Indique si les données de la page sont complètement chargées et rendues
 */
export function useScrollRestoration(pageKey: string, isReady: boolean) {
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Ne pas tenter de restaurer ou de sauvegarder si la page n'est pas encore prête
    if (!isReady) return;

    // 1. Restauration de la position sauvegardée (avec un léger délai pour que le DOM se peigne)
    const storedScroll = sessionStorage.getItem(`scroll-${pageKey}`);
    if (storedScroll !== null) {
      setTimeout(() => {
        window.scrollTo({
          top: parseInt(storedScroll, 10),
          behavior: "instant", // On utilise "instant" au montage pour éviter l'effet "glissade"
        });
      }, 50);
    }

    // 2. Gestion de la sauvegarde au défilement (debounced)
    const handleScroll = () => {
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }

      scrollTimeout.current = setTimeout(() => {
        sessionStorage.setItem(`scroll-${pageKey}`, window.scrollY.toString());
      }, 150);
    };

    window.addEventListener("scroll", handleScroll);

    // 3. Nettoyage de l'écouteur d'événement au démontage ou re-rendu
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, [pageKey, isReady]);
}
