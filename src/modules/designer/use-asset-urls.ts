import { useCallback, useEffect, useState } from "react";
import type { DesignAsset } from "@/shared/contracts/design";
import { loadImageBlob } from "./asset-store";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

export function useAssetUrls(
  assets: DesignAsset[],
  enabled = true,
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const created: string[] = [];

    async function load() {
      const next: Record<string, string> = {};
      await Promise.all(
        assets
          .filter((asset) => asset.source === "upload")
          .map(async (asset) => {
            try {
              const blob = await loadImageBlob(asset.id);
              if (!blob) return;
              const url = URL.createObjectURL(blob);
              created.push(url);
              next[asset.id] = url;
            } catch {
              // A missing IndexedDB entry is shown as an unavailable local asset.
            }
          }),
      );
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setUrls(next);
    }

    load();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assets, enabled]);

  return urls;
}

export type AssetLoadFailure = {
  id: string;
  reason: "missing" | "read_failed";
};

export type AssetDataUrlState = {
  urls: Record<string, string>;
  status: "idle" | "loading" | "ready";
  failures: AssetLoadFailure[];
  retry: () => void;
};

export function useAssetDataUrls(
  assets: DesignAsset[],
  enabled = true,
): AssetDataUrlState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    urls: Record<string, string>;
    status: "idle" | "loading" | "ready";
    failures: AssetLoadFailure[];
  }>({
    urls: {},
    status: enabled ? "loading" : "idle",
    failures: [],
  });

  useEffect(() => {
    if (!enabled) {
      setState({ urls: {}, status: "idle", failures: [] });
      return;
    }
    const uploads = assets.filter((asset) => asset.source === "upload");
    if (uploads.length === 0) {
      setState({ urls: {}, status: "ready", failures: [] });
      return;
    }
    let cancelled = false;
    setState((current) => ({
      urls: current.urls,
      status: "loading",
      failures: [],
    }));

    async function load() {
      const entries = await Promise.all(
        uploads.map(async (asset) => {
          try {
            const blob = await loadImageBlob(asset.id);
            if (!blob) {
              return { id: asset.id, failure: "missing" as const };
            }
            return { id: asset.id, url: await blobToDataUrl(blob) };
          } catch {
            return { id: asset.id, failure: "read_failed" as const };
          }
        }),
      );
      if (cancelled) return;
      const urls: Record<string, string> = {};
      const failures: AssetLoadFailure[] = [];
      for (const entry of entries) {
        if ("url" in entry && entry.url) urls[entry.id] = entry.url;
        else failures.push({ id: entry.id, reason: entry.failure ?? "missing" });
      }
      setState({ urls, status: "ready", failures });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [assets, enabled, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
