import { useEffect, useState } from "react";
import {
  Building2,
  Code2,
  CalendarDays,
  ChevronRight,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  Mail,
  Send,
  Settings2,
  Users,
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

type SidebarProps = {
  activeRoute: AppRoute;
};

function navItemClass(active: boolean) {
  return cn(
    "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
  );
}

function subItemClass(active: boolean) {
  return cn(
    "group flex h-8 items-center gap-2 rounded-lg px-2.5 text-[12.5px] transition-colors",
    active
      ? "bg-sidebar-accent/90 font-medium text-sidebar-accent-foreground"
      : "text-sidebar-foreground/55 hover:bg-sidebar-accent/45 hover:text-sidebar-foreground",
  );
}

export function Sidebar({ activeRoute }: SidebarProps) {
  const hash = useLocationHash();
  const org = useOrganizationProfile();
  const customized = isOrganizationCustomized(org);

  const [recruitmentOpen, setRecruitmentOpen] = useState<boolean>(true);
  const [designerOpen, setDesignerOpen] = useState<boolean>(true);

  useEffect(() => {
    if (activeRoute === "/recruitment") setRecruitmentOpen(true);
    if (activeRoute === "/designer") setDesignerOpen(true);
  }, [activeRoute]);

  const recruitmentTab =
    activeRoute === "/recruitment" ? recruitmentTabFromHash(hash) : null;
  const designerOverview =
    activeRoute === "/designer" && isDesignerOverviewHash(hash);
  const designerTarget =
    activeRoute === "/designer" && !designerOverview
      ? targetFromHash(hash)
      : null;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-sidebar-border/70 bg-sidebar text-sidebar-foreground lg:flex">
      <div className="px-3 pt-4 pb-2">
        <OrganizationSettingsDialog>
          <button
            type="button"
            title="点击修改组织信息"
            className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60"
          >
            <BrandMark className="size-8 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-sidebar-foreground">
                {customized ? org.name : "CampusFlow"}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-sidebar-foreground/45">
                {customized
                  ? org.subtitle || "点击编辑组织信息"
                  : "点击设置组织信息"}
              </p>
            </div>
            <Settings2
              className="size-3.5 shrink-0 text-sidebar-foreground/35 transition-colors group-hover:text-sidebar-foreground/80"
              aria-hidden="true"
            />
          </button>
        </OrganizationSettingsDialog>
      </div>

      <nav
        className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4"
        aria-label="主导航"
      >
        <a
          href={pathToHash("/")}
          aria-current={activeRoute === "/" ? "page" : undefined}
          className={navItemClass(activeRoute === "/")}
        >
          <LayoutDashboard
            className={cn(
              "size-4 shrink-0",
              activeRoute === "/"
                ? "text-sidebar-primary"
                : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
            )}
            aria-hidden="true"
          />
          <span className="truncate">总览</span>
        </a>

        {/* 招新管理 + 二级菜单 */}
        <div className="mt-2 space-y-0.5">
          <div className="flex items-center gap-0.5">
            <a
              href={hashForRecruitmentTab("overview")}
              aria-current={recruitmentTab === "overview" ? "page" : undefined}
              className={cn(
                navItemClass(recruitmentTab === "overview"),
                "min-w-0 flex-1",
              )}
            >
              <Mail
                className={cn(
                  "size-4 shrink-0",
                  activeRoute === "/recruitment"
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
                )}
                aria-hidden="true"
              />
              <span className="truncate">招新管理</span>
            </a>
            <button
              type="button"
              onClick={() => setRecruitmentOpen((open) => !open)}
              aria-expanded={recruitmentOpen}
              aria-label={recruitmentOpen ? "收起招新子菜单" : "展开招新子菜单"}
              className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
            >
              <ChevronRight
                className={cn(
                  "size-3.5 transition-transform duration-150",
                  recruitmentOpen && "rotate-90",
                )}
                aria-hidden="true"
              />
            </button>
          </div>

          {recruitmentOpen ? (
            <div className="ml-[18px] space-y-0.5 border-l border-sidebar-border/60 pl-2.5 pt-0.5">
              <a
                href={hashForRecruitmentTab("overview")}
                aria-current={recruitmentTab === "overview" ? "page" : undefined}
                className={subItemClass(recruitmentTab === "overview")}
              >
                <Users className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                <span className="truncate">招新总览</span>
              </a>
              <a
                href={hashForRecruitmentTab("roster")}
                aria-current={recruitmentTab === "roster" ? "page" : undefined}
                className={subItemClass(recruitmentTab === "roster")}
              >
                <Users className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                <span className="truncate">招新名单</span>
              </a>
              <a
                href={hashForRecruitmentTab("mail")}
                aria-current={recruitmentTab === "mail" ? "page" : undefined}
                className={subItemClass(recruitmentTab === "mail")}
              >
                <Send className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                <span className="truncate">邮件发送</span>
              </a>
              <a
                href={hashForRecruitmentTab("rounds")}
                aria-current={recruitmentTab === "rounds" ? "page" : undefined}
                className={subItemClass(recruitmentTab === "rounds")}
              >
                <Users className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                <span className="truncate">面试轮次</span>
              </a>

            </div>
          ) : null}
        </div>

        {/* 模板设计 + 二级菜单 */}
        <div className="mt-1 space-y-0.5">
          <div className="flex items-center gap-0.5">
            <a
              href={DESIGNER_OVERVIEW_HASH}
              aria-current={designerOverview ? "page" : undefined}
              className={cn(navItemClass(designerOverview), "min-w-0 flex-1")}
            >
              <LayoutTemplate
                className={cn(
                  "size-4 shrink-0",
                  activeRoute === "/designer"
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
                )}
                aria-hidden="true"
              />
              <span className="truncate">模板设计</span>
            </a>
            <button
              type="button"
              onClick={() => setDesignerOpen((open) => !open)}
              aria-expanded={designerOpen}
              aria-label={designerOpen ? "收起模板设计子菜单" : "展开模板设计子菜单"}
              className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
            >
              <ChevronRight
                className={cn(
                  "size-3.5 transition-transform duration-150",
                  designerOpen && "rotate-90",
                )}
                aria-hidden="true"
              />
            </button>
          </div>

          {designerOpen ? (
            <div className="ml-[18px] space-y-0.5 border-l border-sidebar-border/60 pl-2.5 pt-0.5">
              <a
                href="#/designer?target=email"
                aria-current={designerTarget === "email" ? "page" : undefined}
                className={subItemClass(designerTarget === "email")}
              >
                <Mail className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                <span className="truncate">邮件设计</span>
              </a>
              <a
                href="#/designer?target=invite_page"
                aria-current={
                  designerTarget === "invite_page" ? "page" : undefined
                }
                className={subItemClass(designerTarget === "invite_page")}
              >
                <LayoutTemplate
                  className="size-3.5 shrink-0 opacity-70"
                  aria-hidden="true"
                />
                <span className="truncate">邀请函网页</span>
              </a>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          disabled
          aria-disabled="true"
          title="课表排班暂未开放"
          className="mt-1 flex h-9 w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium text-sidebar-foreground/40"
        >
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">课表排班</span>
          <Lock className="ml-auto size-3.5 shrink-0" aria-hidden="true" />
        </button>
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border/60 p-3">
        <OrganizationSettingsDialog>
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
          >
            <Building2
              className="size-4 shrink-0 text-sidebar-foreground/50"
              aria-hidden="true"
            />
            <span className="truncate">组织信息</span>
          </button>
        </OrganizationSettingsDialog>
        <AiSettingsDialog>
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
          >
            <KeyRound
              className="size-4 shrink-0 text-sidebar-foreground/50"
              aria-hidden="true"
            />
            <span className="truncate">AI 配置</span>
          </button>
        </AiSettingsDialog>
        <OpenApiSettingsDialog>
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
          >
            <Code2 className="size-4 shrink-0 text-sidebar-foreground/50" aria-hidden="true" />
            <span className="truncate">开放 API</span>
          </button>
        </OpenApiSettingsDialog>
      </div>
    </aside>
  );
}
