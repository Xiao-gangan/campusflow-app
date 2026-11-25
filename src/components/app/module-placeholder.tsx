import { ArrowUpRight } from "lucide-react";
import type { ModuleMeta } from "../../app/module-meta";
import { DESIGNER_OVERVIEW_HASH } from "../../modules/designer/target-route";
import { Button } from "@/components/ui/button";
import { ModuleIcon } from "./module-icon";
import { PageHeader } from "./page-header";

export function ModulePlaceholder({ module }: { module: ModuleMeta }) {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={module.eyebrow} title={module.name} description={module.description} />
      <section className="rounded-[28px] border border-border/70 bg-card/80 p-5 sm:p-7">
        <span className="grid size-11 place-items-center rounded-2xl border border-primary/15 bg-primary/5 text-primary">
          <ModuleIcon name={module.icon} />
        </span>
        <h2 className="mt-4 text-lg font-semibold">启动招新演示</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          在项目目录运行 <code>npm run dev:rsvp</code>，打开终端显示的网址进入招新工作区。
        </p>
        <Button variant="outline" asChild className="mt-4">
          <a href={DESIGNER_OVERVIEW_HASH}>
            打开模板设计
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </Button>
      </section>
    </div>
  );
}
