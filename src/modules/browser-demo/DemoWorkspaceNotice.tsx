import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BROWSER_DEMO } from "./mode";

export function DemoWorkspaceNotice() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!BROWSER_DEMO) return null;

  async function reset() {
    if (!window.confirm("重置此浏览器的演示招新数据、模板和演示密钥？已经发出的演示邀请将失效。")) return;
    setPending(true);
    setError("");
    try {
      const { browserDemoRuntime } = await import("./transport");
      await browserDemoRuntime().reset();
      window.location.reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "暂时无法重置演示数据。");
      setPending(false);
    }
  }

  return <section className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
    <p className="text-xs text-muted-foreground">浏览器演示 · 请使用示例数据，数据保存在此浏览器，同一浏览器的新标签页可答复邀请。发信和 AI 为模拟。</p>
    <Button size="sm" variant="outline" disabled={pending} onClick={() => void reset()}>{pending ? "正在重置…" : "重置演示数据"}</Button>
    {error && <p role="alert" className="basis-full text-xs text-red-700">{error}</p>}
  </section>;
}
