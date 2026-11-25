import { BROWSER_DEMO } from "../browser-demo/mode";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DesignBlock, DesignDocument, DesignTheme } from "@/shared/contracts/design";
import {
  parseAiPatch,
  supportsAiBlockType,
  type AiBlockType,
} from "@/shared/ai/schema.ts";
import {
  AI_INCOMPLETE_MESSAGE,
  aiHttpStatusMessage,
  aiTransportErrorMessage,
  scheduleAiTimeout,
} from "@/shared/ai/client-policy";
import {
  isActiveAiEvent,
  isValidAiCompletion,
  resolveAiStreamEnd,
} from "@/shared/ai/stream";
import { displayVariableText } from "@/shared/ai/prompt.ts";
import { matchThemePreset } from "@/shared/design/theme-presets";
import { normalizeVariant } from "@/shared/design/style-recipes";
import { readBlockStyleOverrides } from "@/shared/design/block-style";
import {
  aiBlockInput,
  applyAiBlockFields,
  captureAiBlockRevision,
  previewAiBlockRevision,
  replaceAiBlock,
} from "@/shared/ai/block-revision";
import { MissingCredentialError } from "../ai/credentials";
import { requestDesign } from "../ai/design-request";
import { useActiveProvider } from "../ai/use-ai-configuration";
import { moduleDefinition } from "@/shared/design/modules";
import { sampleVariableValues } from "@/shared/design/variables";

export type AiMode = "full" | "block";
export type AiUiStatus =
  | "idle"
  | "starting"
  | "planning"
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";

type AiPlanView = {
  theme: DesignTheme;
  subject: string;
  preheader: string;
  blocks: { id: string; type: AiBlockType; purpose: string }[];
};

type AiPatchView = {
  blockId: string;
  blockType: AiBlockType;
  before: Record<string, string | number>;
  after: Record<string, string | number>;
};

export type AiSession = {
  requestId: string;
  mode: AiMode;
  status: AiUiStatus;
  stage: string;
  provider?: string;
  plan?: AiPlanView;
  previewDocument?: DesignDocument;
  beforeDocument?: DesignDocument;
  blockTargetId?: string;
  result?: DesignDocument;
  error?: string;
  errorCode?: string;
  patch?: AiPatchView;
};

type UseAiDesignOptions = {
  document: DesignDocument;
  target: "email" | "invite_page";
  selectedBlock: DesignBlock | null;
  onApply: (next: DesignDocument, label: string) => void;
  onSaveTemplate: (name: string, document: DesignDocument) => string;
};

type SseEvent = { event: string; data: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message) return body.message;
  } catch {
    // Fall through.
  }
  return (
    aiHttpStatusMessage(response.status) ??
    "AI 服务暂时不可用，请稍后重试。"
  );
}

async function readSse(
  response: Response,
  signal: AbortSignal,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error("当前浏览器不支持流式响应。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary).replace(/\r/gu, "");
        buffer = buffer.slice(boundary + 2);
        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (data) {
          try {
            const parsed: unknown = JSON.parse(data);
            if (isRecord(parsed)) onEvent({ event, data: parsed });
          } catch {
            // Ignore a malformed frame; the next validated block can still land.
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
  }
}

function referenceFor(document: DesignDocument, preserveCopy: boolean) {
  const blocks = document.blocks
    .filter((block) => supportsAiBlockType(block.type, document.target))
    .slice(0, 8)
    .map((block) => {
      const props = block.props;
      const text = ["text", "title", "body", "subtitle", "description", "note"]
        .map(key => props[key]).filter(value => typeof value === "string").join("\n");
      return {
        type: block.type,
        ...readBlockStyleOverrides(block.type, props),
        variant:
          typeof props.variant === "string"
            ? `style:${normalizeVariant(block.type, props.variant)}`
            : undefined,
        text: text.slice(0, 200),
      };
    });
  return {
    themePreset: matchThemePreset(document.theme, document.target),
    ...(document.target === "invite_page" ? { colors: document.theme } : {}),
    subject: (document.meta.subjectTemplate ?? "").slice(0, 80),
    blocks,
    preserveCopy,
  };
}

function endAiSession(
  session: AiSession,
  status: "failed" | "cancelled",
  stage: string,
  error?: string,
  errorCode?: string,
): AiSession {
  return {
    ...session,
    status,
    stage,
    error,
    errorCode,
    previewDocument: undefined,
    plan: undefined,
    patch: undefined,
    result: undefined,
  };
}

export function useAiDesign(options: UseAiDesignOptions) {
  const documentRef = useRef(options.document);
  documentRef.current = options.document;
  const selectedBlockRef = useRef(options.selectedBlock);
  selectedBlockRef.current = options.selectedBlock;
  const onApplyRef = useRef(options.onApply);
  onApplyRef.current = options.onApply;
  const onSaveRef = useRef(options.onSaveTemplate);
  onSaveRef.current = options.onSaveTemplate;

  const [mock, setMock] = useState(BROWSER_DEMO);
  const activeProvider = useActiveProvider();
  const [mode, setMode] = useState<AiMode>("full");
  const [fullPrompt, setFullPrompt] = useState("");
  const [style, setStyle] = useState<string | undefined>();
  const [referenceMode, setReferenceMode] = useState(false);
  const [preserveCopy, setPreserveCopy] = useState(true);
  const [blockInstruction, setBlockInstruction] = useState("");
  const [blockQuickAction, setBlockQuickAction] = useState<string | undefined>();
  const [session, setSession] = useState<AiSession | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const settingsRef = useRef({
    fullPrompt,
    style,
    referenceMode,
    preserveCopy,
    blockInstruction,
    blockQuickAction,
    mock,
    provider: activeProvider.provider,
    providerLabel: activeProvider.label,
  });
  settingsRef.current = {
    fullPrompt,
    style,
    referenceMode,
    preserveCopy,
    blockInstruction,
    blockQuickAction,
    mock,
    provider: activeProvider.provider,
    providerLabel: activeProvider.label,
  };

  const isBusy =
    session?.status === "starting" ||
    session?.status === "planning" ||
    session?.status === "generating";
  const previewDocument = session?.previewDocument ?? null;
  const plannedBlocks = session?.plan?.blocks ?? null;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      activeRequestRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeRequestRef.current = null;
    setSession(null);
    setSaveMessage("");
    setTemplateName("");
  }, [options.target]);

  function selectMode(nextMode: AiMode) {
    if (isBusy) return;
    setMode(nextMode);
    setSession((current) =>
      current && current.mode !== nextMode ? null : current,
    );
    setSaveMessage("");
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    activeRequestRef.current = null;
    setSession((current) =>
      current
        ? {
            ...current,
            status: "cancelled",
            stage: "已取消生成",
            error: undefined,
            errorCode: undefined,
            previewDocument: undefined,
            plan: undefined,
            patch: undefined,
            result: undefined,
          }
        : current,
    );
    setSaveMessage("");
  }

  function discard() {
    abortRef.current?.abort();
    abortRef.current = null;
    activeRequestRef.current = null;
    setSession(null);
    setSaveMessage("");
    setTemplateName("");
  }

  async function startFull() {
    const current = settingsRef.current;
    if (!current.fullPrompt.trim()) {
      setSession({
        requestId: "local",
        mode: "full",
        status: "failed",
        stage: "请先描述你的设计需求",
        error: "请输入设计需求，例如“帮我设计一份正式的面试邀请”。",
        errorCode: "missing_prompt",
      });
      return;
    }
    abortRef.current?.abort();
    setSaveMessage("");
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    let timedOut = false;
    const cancelTimeout = scheduleAiTimeout(controller, () => {
      timedOut = true;
    });
    abortRef.current = controller;
    activeRequestRef.current = requestId;
    const beforeDocument = structuredClone(documentRef.current);
    const body = {
      requestId,
      mode: "full",
      target: beforeDocument.target,
      prompt: current.fullPrompt.trim(),
      style: current.style,
      reference: current.referenceMode
        ? referenceFor(beforeDocument, current.preserveCopy)
        : undefined,
      mock: current.mock,
    };
    setSession({
      requestId,
      mode: "full",
      beforeDocument,
      status: "starting",
      stage: current.mock ? "正在连接本地演示…" : `正在连接 ${current.providerLabel}…`,
      provider: current.mock ? "mock" : current.provider,
    });
    let terminalReceived = false;
    try {
      const response = await requestDesign(body, controller.signal);
      if (!response.ok) throw new Error(await readError(response));
      let planView: AiPlanView | null = null;
      let preview: DesignDocument | null = null;
      let completed: DesignDocument | null = null;
      const collected: DesignBlock[] = [];
      await readSse(response, controller.signal, ({ event, data }) => {
        if (!isActiveAiEvent(data.requestId, activeRequestRef.current)) return;
        if (terminalReceived) return;
        if (event === "generation-started") {
          setSession((current) => current && {
            ...current,
            status: "planning",
            stage: "正在理解需求并规划布局",
            provider: typeof data.provider === "string" ? data.provider : undefined,
          });
          return;
        }
        if (event === "structure-ready") {
          const plan = data.plan;
          if (!isRecord(plan) || !isRecord(plan.theme) || !Array.isArray(plan.blocks)) return;
          const blocks = plan.blocks.filter(
            (item): item is AiPlanView["blocks"][number] =>
              isRecord(item) &&
              typeof item.id === "string" &&
              typeof item.type === "string" &&
              supportsAiBlockType(item.type, beforeDocument.target),
          );
          if (blocks.length !== plan.blocks.length) return;
          planView = {
            theme: plan.theme as DesignTheme,
            subject: typeof plan.subject === "string" ? plan.subject : "",
            preheader: typeof plan.preheader === "string" ? plan.preheader : "",
            blocks,
          };
          preview = {
            schemaVersion: 1,
            target: beforeDocument.target,
            meta: beforeDocument.target === "invite_page" ? {} : {
              subjectTemplate: planView.subject,
              preheaderText: planView.preheader,
            },
            theme: planView.theme,
            blocks: [],
          };
          setSession((current) => current && {
            ...current,
            status: "generating",
            stage: "布局已确定，正在生成内容",
            plan: planView ?? undefined,
            previewDocument: preview ?? undefined,
          });
          return;
        }
        if (event === "block-ready") {
          const raw = data.block;
          if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.type !== "string" || !isRecord(raw.props)) return;
          if (!planView) return;
          const planned = planView.blocks.find((item) => item.id === raw.id);
          if (!planned || planned.type !== raw.type) return;
          const block = raw as unknown as DesignBlock;
          const index = planView.blocks.findIndex((item) => item.id === block.id);
          collected[index] = block;
          preview = preview
            ? { ...preview, blocks: collected.filter(Boolean) }
            : preview;
          const label = moduleDefinition(block.type)?.label ?? "内容";
          setSession((current) => current && {
            ...current,
            status: "generating",
            stage: `已完成「${label}」`,
            previewDocument: preview ?? current.previewDocument,
          });
          return;
        }
        if (event === "generation-completed") {
          const design = data.design;
          if (!planView || !isValidAiCompletion(planView.blocks, design, beforeDocument.target)) {
            return;
          }
          terminalReceived = true;
          completed = design as unknown as DesignDocument;
          setSession((current) => current && {
            ...current,
            status: "completed",
            stage: "生成完成，等待你确认",
            result: completed ?? undefined,
            previewDocument: (completed ?? preview) ?? undefined,
          });
          setTemplateName(beforeDocument.target === "invite_page" ? "AI 邀请函模板" : "AI 邮件模板");
          return;
        }
        if (event === "generation-failed") {
          terminalReceived = true;
          setSession((current) => current && endAiSession(
            current,
            "failed",
            "生成失败",
            typeof data.message === "string"
              ? data.message
              : "AI 生成失败，请重试。",
            typeof data.code === "string" ? data.code : undefined,
          ));
          return;
        }
        if (event === "generation-cancelled") {
          terminalReceived = true;
          setSession((current) => current && endAiSession(
            current,
            "cancelled",
            "已取消生成",
          ));
        }
      });
      if (activeRequestRef.current !== requestId) return;
      const ending = resolveAiStreamEnd({
        terminalReceived,
        timedOut,
        aborted: controller.signal.aborted,
      });
      if (ending.kind === "failed-timeout") {
        setSession((current) => current && endAiSession(
          current,
          "failed",
          "生成超时",
          aiTransportErrorMessage(null, true),
          "timeout",
        ));
      } else if (ending.kind === "failed-incomplete") {
        setSession((current) => current && endAiSession(
          current,
          "failed",
          "响应提前结束",
          AI_INCOMPLETE_MESSAGE,
          "incomplete_stream",
        ));
      } else if (ending.kind === "cancelled") {
        setSession((current) => current && endAiSession(
          current,
          "cancelled",
          "已取消生成",
        ));
      }
    } catch (error) {
      if (activeRequestRef.current !== requestId || terminalReceived) return;
      if (timedOut) {
        setSession((current) => current && endAiSession(
          current,
          "failed",
          "生成超时",
          aiTransportErrorMessage(error, true),
          "timeout",
        ));
      } else if (controller.signal.aborted) {
        setSession((current) => current && endAiSession(
          current,
          "cancelled",
          "已取消生成",
        ));
      } else {
        setSession((current) => current && endAiSession(
          current,
          "failed",
          error instanceof MissingCredentialError ? "尚未配置 API Key" : "生成失败",
          aiTransportErrorMessage(error, false),
          error instanceof MissingCredentialError ? "missing_key" : undefined,
        ));
      }
    } finally {
      cancelTimeout();
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function startBlock(retryBlockId?: string) {
    const blockId = retryBlockId ?? selectedBlockRef.current?.id;
    const snapshot = blockId ? captureAiBlockRevision(documentRef.current, blockId) : null;
    const block = snapshot?.block;

    if (!snapshot || !block) {
      setSession({
        requestId: "local",
        mode: "block",
        status: "failed",
        stage: "请先选择一个组件",
        error: "请先在画布中选择标题、正文、卡片或按钮。",
        errorCode: "missing_block",
      });
      return;
    }
    if (!supportsAiBlockType(block.type, options.target)) {
      setSession({
        requestId: "local",
        mode: "block",
        status: "failed",
        stage: "当前组件不支持 AI 优化",
        error: "图片等组件暂不支持 AI 优化，请选择标题、正文、信息卡片等组件。",
        errorCode: "unsupported_block",
      });
      return;
    }
    const current = settingsRef.current;
    abortRef.current?.abort();
    setSaveMessage("");
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    let timedOut = false;
    const cancelTimeout = scheduleAiTimeout(controller, () => {
      timedOut = true;
    });
    abortRef.current = controller;
    activeRequestRef.current = requestId;
    const currentProps = aiBlockInput(block, snapshot.document.theme);
    setSession({
      requestId,
      mode: "block",
      blockTargetId: block.id,
      status: "starting",
      stage: current.mock ? "正在连接本地演示…" : `正在连接 ${current.providerLabel}…`,
      provider: current.mock ? "mock" : current.provider,
    });
    try {
      const response = await requestDesign({
        requestId,
        mode: "block",
        target: snapshot.document.target,
        blockId: block.id,
        blockType: block.type,
        currentProps,
        instruction: current.blockInstruction.trim(),
        quickAction: current.blockQuickAction,
        mock: current.mock,
      }, controller.signal);
      if (!response.ok) throw new Error(await readError(response));
      const responseBody = (await response.json()) as { patch?: unknown };
      if (activeRequestRef.current !== requestId) return;
      if (controller.signal.aborted) throw new Error("请求已结束。");
      const blockType = block.type as AiBlockType;
      const { fields } = parseAiPatch(responseBody.patch, { target: snapshot.document.target, blockId: block.id, blockType, currentProps });
      const preview = previewAiBlockRevision(snapshot, fields);
      const before: Record<string, string | number> = {};
      for (const key of Object.keys(fields)) {
        const oldValue = block.props[key];
        if (typeof oldValue === "string" || typeof oldValue === "number") before[key] = oldValue;
      }
      setSession({
        requestId,
        mode: "block",
        status: "completed",
        stage: "修改预览",
        provider: current.mock ? "mock" : current.provider,
        blockTargetId: block.id,
        beforeDocument: snapshot.document,
        previewDocument: preview.document,
        patch: {
          blockId: block.id,
          blockType: block.type as AiBlockType,
          before,
          after: fields,
        },
      });
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      setSession((current) =>
        current
          ? {
              ...current,
              status:
                controller.signal.aborted && !timedOut ? "cancelled" : "failed",
              stage: timedOut
                ? "生成超时"
                : controller.signal.aborted
                  ? "已取消生成"
                  : error instanceof MissingCredentialError
                    ? "尚未配置 API Key"
                    : "修改失败",
              error:
                controller.signal.aborted && !timedOut
                  ? undefined
                  : aiTransportErrorMessage(error, timedOut),
              errorCode:
                error instanceof MissingCredentialError ? "missing_key" : undefined,
            }
          : current,
      );
    } finally {
      cancelTimeout();
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function apply() {
    if (!session || session.beforeDocument?.target !== documentRef.current.target) return;
    if (session.mode === "full") {
      if (!session.result) return;
      onApplyRef.current(session.result, "AI 整篇设计");
      setSession(null);
      return;
    }
    const patch = session.patch;
    if (!patch) return;
    const currentBlock = documentRef.current.blocks.find(
      (block) => block.id === patch.blockId,
    );
    if (!currentBlock || currentBlock.type !== patch.blockType) {
      setSession(endAiSession(session, "failed", "无法应用修改", "当前组件已不存在，请退出会话后重试。"));
      return;
    }
    const nextBlock = applyAiBlockFields(currentBlock, patch.after);
    onApplyRef.current(replaceAiBlock(documentRef.current, nextBlock), "AI 组件修改");
    setSession(null);
  }

  function regenerate() {
    if ((session?.mode ?? mode) === "block") void startBlock(session?.blockTargetId);
    else void startFull();
  }

  function saveAsTemplate() {
    if (!session?.result) return;
    try {
      const message = onSaveRef.current(
        templateName.trim() || "AI 模板",
        session.result,
      );
      setSaveMessage(message);
    } catch {
      setSaveMessage("保存失败，请检查浏览器本地存储。");
    }
  }

  const previewVariables = useMemo(() => sampleVariableValues(), []);

  return {
    target: options.target,
    mock,
    setMock: BROWSER_DEMO ? () => {} : setMock,
    mode,
    setMode: selectMode,
    fullPrompt,
    setFullPrompt,
    style,
    setStyle,
    referenceMode,
    setReferenceMode,
    preserveCopy,
    setPreserveCopy,
    blockInstruction,
    setBlockInstruction,
    blockQuickAction,
    setBlockQuickAction,
    session,
    canRegenerateBlock: session?.blockTargetId === undefined
      ? Boolean(options.selectedBlock && supportsAiBlockType(options.selectedBlock.type, options.target))
      : options.document.blocks.some((block) => block.id === session.blockTargetId && supportsAiBlockType(block.type, options.target)),
    isBusy,
    templateName,
    setTemplateName,
    saveMessage,
    previewDocument,
    plannedBlocks,
    previewVariables,
    startFull,
    startBlock,
    cancel,
    discard,
    apply,
    regenerate,
    saveAsTemplate,
    displayVariableText,
  };
}

export type UseAiDesign = ReturnType<typeof useAiDesign>;
