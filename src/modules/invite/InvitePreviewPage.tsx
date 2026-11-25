import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DesignDocument } from "@/shared/contracts/design";
import { createInvitePresetDocument } from "@/shared/invite/presets";
import { readInvitePreviewDraft } from "@/shared/invite/preview-draft";
import { buildInvitePage, type InviteContext } from "@/shared/invite/model";
import { sampleVariableValues } from "@/shared/design/variables";
import { Button } from "@/components/ui/button";
import { createDesignLibrary } from "../designer/local-library";
import {
  documentUsesUploadedAssets,
  resolveDocumentAssetUrls,
} from "../designer/asset-resolution";
import { useAssetUrls } from "../designer/use-asset-urls";
import { InvitePageView, type InviteAction } from "./InvitePageView";

const SAMPLE_CONTEXT: InviteContext = sampleVariableValues();

function getQuery(): URLSearchParams {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf("?");
  return new URLSearchParams(
    queryIndex >= 0 ? hash.slice(queryIndex + 1) : "",
  );
}

function resolveInviteDocument(): DesignDocument {
  const preset = getQuery().get("preset");
  if (preset === "formal" || preset === "playful") {
    return createInvitePresetDocument(preset);
  }
  try {
    const draft = readInvitePreviewDraft(window.localStorage);
    if (draft) return draft;
  } catch {
    // Fall through to the built-in preset when browser storage is unavailable.
  }
  return createInvitePresetDocument("formal");
}

export default function InvitePreviewPage() {
  const [inviteDocument] = useState(resolveInviteDocument);
  const [bare, setBare] = useState(() => getQuery().get("bare") === "1");
  const [notice, setNotice] = useState<string | null>(null);
  const library = useMemo(
    () => createDesignLibrary(window.localStorage),
    [],
  );
  const assets = useMemo(() => library.listAssets(), [library]);
  const assetUrls = useAssetUrls(assets);
  const hasLocalImages = documentUsesUploadedAssets(inviteDocument, assets);
  const renderDocument = useMemo(
    () => resolveDocumentAssetUrls(inviteDocument, assetUrls),
    [inviteDocument, assetUrls],
  );

  const model = useMemo(
    () => buildInvitePage(renderDocument, SAMPLE_CONTEXT),
    [renderDocument],
  );
  const hero = model.sections.find((section) => section.kind === "hero");

  useEffect(() => {
    const previousTitle = window.document.title;
    const title =
      hero && hero.kind === "hero" && hero.title
        ? hero.title
        : "邀请函";
    window.document.title = `${title} · ${SAMPLE_CONTEXT.organization_name}`;
    return () => {
      window.document.title = previousTitle;
    };
  }, [hero]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function handleAction(action: InviteAction) {
    setNotice(
      action.kind === "button"
        ? "这是管理员预览，按钮不会打开外部页面。"
        : "这是管理员预览。请通过候选人专属链接提交出席答复。",
    );
  }

  return (
    <div
      className="min-h-dvh"
      style={{ backgroundColor: inviteDocument.theme.backgroundColor }}
    >
      {!bare ? (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#0f2018]/92 text-[#f6f1e6] backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#c7e6a3]/25 bg-[#c7e6a3]/12 px-2.5 py-1 text-[10px] font-semibold text-[#d8efbe]">
                <Eye className="size-3" aria-hidden="true" />
                管理员预览
              </span>
              <p className="hidden truncate text-xs text-white/55 sm:block">
                示例候选人数据 · 不会提交出席确认
                {hasLocalImages ? " · 含本机图片" : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/70 hover:bg-white/10 hover:text-white"
                asChild
              >
                <a href="#/designer?target=invite_page">
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  返回编辑器
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setBare(true)}
              >
                <EyeOff className="size-3.5" aria-hidden="true" />
                隐藏预览栏
              </Button>
            </div>
          </div>
        </header>
      ) : null}

      <div style={{ paddingTop: bare ? 0 : 56 }}>
        <InvitePageView
          document={renderDocument}
          context={SAMPLE_CONTEXT}
          minHeight={bare ? "100dvh" : "calc(100dvh - 56px)"}
          onAction={handleAction}
        />
      </div>

      {notice ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 shadow-2xl"
        >
          {notice}
        </div>
      ) : null}
    </div>
  );
}
