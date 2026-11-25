import { useEffect, useState } from "react";
import { DEFAULT_ROUTE, parseHash, pathToHash, type AppRoute } from "./navigation";

export function useLocationHash(): string {
  const [hash, setHash] = useState<string>(() => window.location.hash || "#/");

  useEffect(() => {
    const sync = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  return hash;
}

export function useHashRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    const handleHashChange = () => {
      const { hash } = window.location;
      // Normalize stale scheduling bookmarks without affecting in-page anchors.
      if (!hash || /^#\/scheduling\/*(?:[?#]|$)/.test(hash)) {
        window.history.replaceState(window.history.state, "", pathToHash(DEFAULT_ROUTE));
      }
      setRoute(parseHash(hash));
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return route;
}

export function navigateHash(nextHash: string): void {
  const normalized = nextHash.startsWith("#") ? nextHash : `#${nextHash}`;
  if (window.location.hash === normalized) return;
  window.location.hash = normalized;
}
