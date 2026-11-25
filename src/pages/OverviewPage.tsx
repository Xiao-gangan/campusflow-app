import { ArrowUpRight, LayoutTemplate, Mail } from "lucide-react";
import { PageHeader } from "../components/app/page-header";
import { DESIGNER_OVERVIEW_HASH } from "../modules/designer/target-route";
import {
  isOrganizationCustomized,
  useOrganizationProfile,
} from "../modules/org/organization";
import { hashForRecruitmentTab } from "../modules/recruitment/recruitment-route";
import { BROWSER_DEMO } from "../modules/browser-demo/mode";
import { cn } from "@/lib/utils";

const WORKSPACES = [
  {
    id: "designer",
    title: "模板设计",
    description: "制作面试邮件与邀请函网页，预览不同设备上的效果。",
    features: [
      "积木排版与自由 HTML",
      "DeepSeek、通义千问、Kimi 辅助设计",
      "模板复用、设备预览与 HTML 导出",
    ],
    href: DESIGNER_OVERVIEW_HASH,
    icon: LayoutTemplate,
    iconClass: "border-[#c7dfd1] bg-[#e3efe7] text-[#1d5343]",
    haloClass: "bg-[#d8ebe0]",
  },
  {
    id: "recruitment",
    title: "招新管理",
    description: "从候选人名单发起面试邀约，跟踪每位候选人的答复。",
    features: [
      "CSV 导入、名单筛选与逐人预览",
      "发件邮箱配置、连接测试与模拟发信",
      "专属邀请链接与出席答复回写",
    ],
    href: hashForRecruitmentTab("overview"),
    icon: Mail,
    iconClass: "border-[#efcec0] bg-[#fbe9e1] text-[#a94b2c]",
    haloClass: "bg-[#f6d8ca]",
  },
] as const;

export default function OverviewPage() {
  const organization = useOrganizationProfile();
  const customized = isOrganizationCustomized(organization);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="relative isolate overflow-hidden rounded-[28px] border border-border/70 bg-card/80 campus-grid p-6 [overflow-wrap:anywhere] sm:p-9 lg:p-10 [&_h1]:text-balance">
        <div
          className="pointer-events-none absolute -right-20 -top-32 -z-10 size-80 rounded-full bg-[#c7e6a3]/35 blur-3xl"
          aria-hidden="true"
        />
        <PageHeader
          eyebrow={organization.subtitle || undefined}
          title={customized ? `${organization.name} · 招新工作台` : "校园组织招新工作台"}
          description="设计模板、管理候选人，从第一封面试邀请跟进到出席答复。"
        />
      </div>

      <section aria-label="工作区" className="grid gap-4 md:grid-cols-2 sm:gap-5">
        {WORKSPACES.map(({ id, title, description, features, href, icon: Icon, iconClass, haloClass }) => (
          <a
            key={id}
            href={href}
            aria-labelledby={`workspace-${id}`}
            className="group relative isolate flex min-w-0 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card/80 p-5 transition-colors hover:border-primary/40 hover:bg-card focus-visible:outline-2 focus-visible:outline-primary sm:p-7"
          >
            <div
              className={cn(
                "pointer-events-none absolute -right-16 -top-20 -z-10 size-52 rounded-full opacity-50 blur-3xl",
                haloClass,
              )}
              aria-hidden="true"
            />
            <div className="flex items-start justify-between gap-3">
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl border", iconClass)}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <ArrowUpRight
                className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            </div>
            <h2 id={`workspace-${id}`} className="mt-4 text-xl font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
            <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-xs leading-5 text-foreground/80">
              {features.map((feature) => (
                <li key={feature} className="flex items-baseline gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary/55" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          </a>
        ))}
      </section>
      {BROWSER_DEMO && (
        <aside aria-label="在线演示说明" className="flex min-w-0 flex-col items-start gap-3 rounded-[24px] border border-border/70 bg-card/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="min-w-0 text-sm leading-6 text-muted-foreground">
            当前为在线演示版（数据保存在本浏览器，同浏览器新标签页可体验完整邀请答复与回写）。如需真实 SMTP 邮件发送、跨设备专属链接与完整 Open API，可拉取 GitHub 源码一键启动。
          </p>
          <a
            href="https://github.com/Xiao-gangan/campusflow-app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border/80 px-3 py-2 text-sm font-medium text-primary hover:border-primary/45 hover:bg-background/70 focus-visible:outline-2 focus-visible:outline-primary"
          >
            查看 GitHub 仓库
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </aside>
      )}
    </div>
  );
}
