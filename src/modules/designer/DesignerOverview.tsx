import {
  ArrowRight,
  Code2,
  LayoutGrid,
  LayoutTemplate,
  Mail,
  Plus,
} from "lucide-react";
import { useState } from "react";
import type { DesignDocument, DesignTarget } from "@/shared/contracts/design";
import type { FeaturedPresetUpdate } from "@/shared/design/featured-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/app/page-header";
import type { SavedDesignTemplate } from "./local-library";

type DesignerOverviewProps = {
  documents: Record<DesignTarget, DesignDocument>;
  templates: SavedDesignTemplate[];
  onOpenEditor: (target: DesignTarget) => void;
  onLoadTemplate: (template: SavedDesignTemplate) => void;
  onUpdateFeatured: () => Promise<FeaturedPresetUpdate>;
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function modeBadge(document: DesignDocument) {
  return document.mode === "html" ? (
    <Badge
      variant="outline"
      className="gap-1 rounded-full border-primary/25 bg-primary/5 text-[10px] text-primary"
    >
      <Code2 className="size-2.5" aria-hidden="true" />
      自由 HTML
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 rounded-full text-[10px]">
      <LayoutGrid className="size-2.5" aria-hidden="true" />
      积木排版
    </Badge>
  );
}

export function DesignerOverview({
  documents,
  templates,
  onOpenEditor,
  onLoadTemplate,
  onUpdateFeatured,
}: DesignerOverviewProps) {
  const [updating, setUpdating] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const emailTemplates = templates.filter((item) => item.target === "email");
  const inviteTemplates = templates.filter(
    (item) => item.target === "invite_page",
  );

  async function updateFeatured() {
    setUpdating(true);
    setFeedback(null);
    try {
      const { added, updated } = await onUpdateFeatured();
      setFeedback({ error: false, text: added || updated ? `精选预设已同步 · 新增 ${added} 套 · 更新 ${updated} 套` : "已是最新精选预设。" });
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "暂时无法载入精选预设。" });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1160px] space-y-6">
      <PageHeader title="模板设计" actions={<Button type="button" variant="outline" size="sm" disabled={updating} onClick={() => void updateFeatured()}>
        {updating ? "同步精选预设…" : "载入精选预设"}
      </Button>} />
      {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-rose-800" : "text-sm text-primary"}>{feedback.text}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card/85 p-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">邮件设计</h2>
              </div>
              {modeBadge(documents.email)}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              设计面试邀请与招新通知邮件，支持积木排版、AI 自由 HTML 调试及外部 AI 提示词导入。
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
            <span className="text-xs text-muted-foreground">
              已保存 {emailTemplates.length} 份模板
            </span>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenEditor("email")}
            >
              进入邮件设计
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </section>

        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card/85 p-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="size-4 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">邀请函网页</h2>
              </div>
              {modeBadge(documents.invite_page)}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              设计候选人打开专属链接后看到的邀请函，签发后可收集确认参加或婉拒的答复。
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
            <span className="text-xs text-muted-foreground">
              已保存 {inviteTemplates.length} 份模板
            </span>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenEditor("invite_page")}
            >
              进入邀请函设计
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TemplateListCard
          title="已保存的邮件模板"
          emptyText="还没有保存的邮件模板，进入邮件设计器点击「保存」即可复用。"
          templates={emailTemplates}
          onCreate={() => onOpenEditor("email")}
          onLoad={onLoadTemplate}
        />
        <TemplateListCard
          title="已保存的邀请函模板"
          emptyText="还没有保存的邀请函模板，进入邀请函设计器点击「保存」即可供招新群发选用。"
          templates={inviteTemplates}
          onCreate={() => onOpenEditor("invite_page")}
          onLoad={onLoadTemplate}
        />
      </div>
    </div>
  );
}

function TemplateListCard({
  title,
  emptyText,
  templates,
  onCreate,
  onLoad,
}: {
  title: string;
  emptyText: string;
  templates: SavedDesignTemplate[];
  onCreate: () => void;
  onLoad: (template: SavedDesignTemplate) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/85">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onCreate}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          新建 / 编辑
        </Button>
      </div>
      {templates.length === 0 ? (
        <p className="px-5 py-10 text-center text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="divide-y divide-border/60">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between gap-3 px-5 py-3 text-xs transition-colors hover:bg-muted/30"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="min-w-0 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                    {template.name}
                  </p>
                  {modeBadge(template.document)}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  更新于 {formatTime(template.updatedAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={() => onLoad(template)}
              >
                载入编辑
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
