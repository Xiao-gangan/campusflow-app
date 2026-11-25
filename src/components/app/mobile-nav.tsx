import {
  Building2,
  Code2,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  Mail,
} from "lucide-react";
import { pathToHash, type AppRoute } from "../../app/navigation";
import { useLocationHash } from "../../app/use-hash-route";
import { OpenApiSettingsDialog } from "../../modules/open-api/OpenApiSettingsDialog";
import { AiSettingsDialog } from "../../modules/ai/AiSettingsDialog";
import {
  DESIGNER_OVERVIEW_HASH,
  isDesignerOverviewHash,
  targetFromHash,
} from "../../modules/designer/target-route";
import { OrganizationSettingsDialog } from "../../modules/org/OrganizationSettingsDialog";
import {
  isOrganizationCustomized,
  useOrganizationProfile,
} from "../../modules/org/organization";
import {
  hashForRecruitmentTab,
  recruitmentTabFromHash,
} from "../../modules/recruitment/recruitment-route";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

type MobileNavProps = {
  activeRoute: AppRoute;
};

function linkClass(active: boolean) {
  return cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border/70 bg-card/70 text-muted-foreground hover:text-foreground",
  );
}

function subLinkClass(active: boolean) {
  return cn(
    "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
    active
      ? "bg-primary/12 text-primary"
      : "text-muted-foreground hover:text-foreground",
  );
}

export function MobileNav({ activeRoute }: MobileNavProps) {
  const hash = useLocationHash();
  const org = useOrganizationProfile();
  const customized = isOrganizationCustomized(org);

  const recruitmentTab =
    activeRoute === "/recruitment" ? recruitmentTabFromHash(hash) : null;
  const designerOverview =
    activeRoute === "/designer" && isDesignerOverviewHash(hash);
  const designerTarget =
    activeRoute === "/designer" && !designerOverview
      ? targetFromHash(hash)
      : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <OrganizationSettingsDialog>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 text-left sm:gap-2.5"
          >
            <BrandMark className="size-7 shrink-0 rounded-lg sm:size-8" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                {customized ? org.name : "CampusFlow"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {customized ? org.subtitle || "组织信息" : "点击设置组织信息"}
              </p>
            </div>
          </button>
        </OrganizationSettingsDialog>
        <div className="flex shrink-0 items-center gap-1 [&>button]:gap-1 [&>button]:px-1.5 sm:gap-1.5 sm:[&>button]:px-3">
          <OrganizationSettingsDialog>
            <button type="button" className={linkClass(false)}>
              <Building2 className="size-3.5" aria-hidden="true" />
              组织
            </button>
          </OrganizationSettingsDialog>
          <AiSettingsDialog>
            <button type="button" className={linkClass(false)}>
              <KeyRound className="size-3.5" aria-hidden="true" />
              AI 配置
            </button>
          </AiSettingsDialog>
          <OpenApiSettingsDialog>
            <button type="button" className={linkClass(false)}>
              <Code2 className="size-3.5" aria-hidden="true" />
              开放 API
            </button>
          </OpenApiSettingsDialog>
        </div>
      </div>

      <nav
        className="flex gap-1.5 overflow-x-auto px-3 pb-2"
        aria-label="移动端主导航"
      >
        <a
          href={pathToHash("/")}
          aria-current={activeRoute === "/" ? "page" : undefined}
          className={linkClass(activeRoute === "/")}
        >
          <LayoutDashboard className="size-3.5" aria-hidden="true" />
          总览
        </a>
        <a
          href={hashForRecruitmentTab("overview")}
          aria-current={activeRoute === "/recruitment" ? "page" : undefined}
          className={linkClass(activeRoute === "/recruitment")}
        >
          <Mail className="size-3.5" aria-hidden="true" />
          招新
        </a>
        <a
          href={DESIGNER_OVERVIEW_HASH}
          aria-current={activeRoute === "/designer" ? "page" : undefined}
          className={linkClass(activeRoute === "/designer")}
        >
          <LayoutTemplate className="size-3.5" aria-hidden="true" />
          模板
        </a>
      </nav>

      {activeRoute === "/recruitment" ? (
        <nav
          className="flex gap-1 overflow-x-auto border-t border-border/50 px-3 py-1.5"
          aria-label="招新子导航"
        >
          <a
            href={hashForRecruitmentTab("overview")}
            className={subLinkClass(recruitmentTab === "overview")}
          >
            招新总览
          </a>
          <a
            href={hashForRecruitmentTab("roster")}
            className={subLinkClass(recruitmentTab === "roster")}
          >
            招新名单
          </a>
          <a
            href={hashForRecruitmentTab("mail")}
            className={subLinkClass(recruitmentTab === "mail")}
          >
            邮件发送
          </a>
          <a
            href={hashForRecruitmentTab("rounds")}
            aria-current={recruitmentTab === "rounds" ? "page" : undefined}
            className={subLinkClass(recruitmentTab === "rounds")}
          >
            面试轮次
          </a>

        </nav>
      ) : null}

      {activeRoute === "/designer" ? (
        <nav
          className="flex gap-1 overflow-x-auto border-t border-border/50 px-3 py-1.5"
          aria-label="模板设计子导航"
        >
          <a
            href={DESIGNER_OVERVIEW_HASH}
            className={subLinkClass(designerOverview)}
          >
            模板总览
          </a>
          <a
            href="#/designer?target=email"
            className={subLinkClass(designerTarget === "email")}
          >
            邮件设计
          </a>
          <a
            href="#/designer?target=invite_page"
            className={subLinkClass(designerTarget === "invite_page")}
          >
            邀请函网页
          </a>
        </nav>
      ) : null}
    </header>
  );
}
