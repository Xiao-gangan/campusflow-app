import { useEffect, useState } from "react";
import { AI_PROVIDERS, type AiProviderId } from "../../../shared/ai/providers.ts";
import {
  providerSummaries,
  subscribeCredentials,
  type ProviderSummary,
} from "./credentials.ts";

export function useProviderSummaries() {
  const [summaries, setSummaries] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      void providerSummaries().then((rows) => {
        if (current !== revision) return;
        setSummaries(rows);
        setLoading(false);
      }).catch(() => {
        if (current === revision) setLoading(false);
      });
    };
    const unsubscribe = subscribeCredentials(refresh);
    refresh();
    return () => {
      revision += 1;
      unsubscribe();
    };
  }, []);

  return { summaries, loading, refresh: () => providerSummaries().then(setSummaries) };
}

export function useActiveProvider() {
  const { summaries } = useProviderSummaries();
  const summary = summaries.find((item) => item.isDefault) ?? summaries.find((item) => item.provider === "deepseek");
  return {
    provider: (summary?.provider ?? "deepseek") as AiProviderId,
    label: summary?.label ?? AI_PROVIDERS.deepseek.label,
    model: summary?.model ?? AI_PROVIDERS.deepseek.defaultModel,
    status: summary?.status ?? "empty",
  };
}