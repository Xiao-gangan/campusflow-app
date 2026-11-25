import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Clock3,
  Copy,
  GripVertical,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";
import { cloneElement, useEffect, useId, useMemo, useRef, useState, type ReactElement, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type {
  DesignBlockType,
  DesignDocument,
  DesignTheme,
} from "@/shared/contracts/design";
import type {
  InviteAlignment,
  InviteContext,
  InviteSection,
} from "@/shared/invite/model";
import { isSampleResponseInstruction } from "@/shared/invite/presets";
import { buildInvitePage } from "@/shared/invite/model";
import { moduleDefinition } from "@/shared/design/modules";
import {
  boxStyleProperties,
  fontWeightValue,
  gradientFallbackColor,
  resolveBlockStyle,
  shadowValue,
} from "@/shared/design/block-style";
import { contrastText, mixHex } from "@/shared/design/colors";
import {
  dividerSpec,
  resolveStyle,
  styleRecipeFor,
  type ResolvedStyle,
} from "@/shared/design/style-recipes";
import { useModuleDrag } from "../designer/use-module-drag";
import { cn } from "@/lib/utils";
import { InviteRichText } from "./InviteRichText";
import { renderFreeEmailHtml } from "@/shared/email/free-html";

export type InviteAction =
  | { kind: "rsvp-confirm"; blockId: string }
  | { kind: "rsvp-reschedule" | "rsvp-decline"; blockId: string }
  | { kind: "button"; blockId: string };

type InvitePageViewProps = {
  candidateResponse?: ReactNode;
  candidateResponseTitle?: string;
  document: DesignDocument;
  context?: InviteContext;
  embedded?: boolean;
  minHeight?: string;
  editable?: boolean;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string) => void;
  onMoveBlock?: (id: string, direction: -1 | 1) => void;
  onDuplicateBlock?: (id: string) => void;
  onRemoveBlock?: (id: string) => void;
  onReorderBlock?: (
    activeId: string,
    overId: string,
    position: "before" | "after",
  ) => void;
  onEditBlock?: (blockId: string) => void;
  editingBlockId?: string | null;
  editingField?: string | null;
  renderInlineEditor?: (blockId: string, fieldKey: string) => ReactNode;
  onAction?: (action: InviteAction) => void;
};

const EMPTY_CONTEXT: InviteContext = {};

const SECTION_LABELS: Record<InviteSection["kind"], string> = {
  logo: "品牌",
  image: "图片",
  hero: "邀请函首屏",
  event_info: "活动信息",
  rsvp: "出席确认",
  heading: "标题",
  text: "正文",
  info_card: "信息卡片",
  button: "按钮",
  divider: "分隔线",
  footer: "页脚",
  spacer: "留白",
};

function alignClass(align: InviteAlignment): string {
  return `invite-align-${align}`;
}

function organizationInitials(organizationName: string): string {
  const compact = organizationName.replace(/\s+/gu, "");
  const capitals = compact.match(/[A-Z]/g);
  if (capitals && capitals.length >= 2) {
    return capitals.slice(0, 2).join("");
  }
  if (/^[A-Za-z0-9]+$/.test(compact)) {
    return (compact.slice(0, 2) || "CF").toUpperCase();
  }
  return compact.slice(0, 2) || "CF";
}

function styleBox(style: ResolvedStyle): CSSProperties {
  return {
    backgroundColor: style.background ?? undefined,
    border: style.border ?? undefined,
    borderLeft: style.borderLeft ?? undefined,
    borderTop: style.borderTop ?? undefined,
    borderRadius: style.borderRadius,
    padding: style.hasSurface ? style.padding : undefined,
  };
}

function RichField({
  doc,
  context,
  fallback,
  inline = false,
}: {
  doc?: Parameters<typeof InviteRichText>[0]["doc"];
  context: InviteContext;
  fallback: string;
  inline?: boolean;
}) {
  if (!doc) return <>{fallback}</>;
  return <InviteRichText doc={doc} context={context} inline={inline} />;
}

function richAlignment(
  section: InviteSection,
  key: string,
  fallback: InviteAlignment,
): InviteAlignment {
  return section.richText?.[key]?.content[0]?.attrs?.textAlign ?? fallback;
}

function sectionOverride(section: InviteSection, theme: DesignTheme): CSSProperties {
  const custom = section.customStyle;
  if (!custom) return {};
  const css: CSSProperties = {};
  if (custom.borderColor !== undefined || custom.borderWidth !== undefined ||
      custom.borderStyle !== undefined || custom.borderPlacement !== undefined) {
    const resolved = resolveBlockStyle(section.kind, { ...custom, variant: section.variant }, theme);
    const { borderWidth, borderColor, borderStyle } = boxStyleProperties(resolved.box);
    Object.assign(css, { borderWidth, borderColor, borderStyle: borderStyle ?? "none" });
  }
  if (custom.backgroundGradient !== undefined) {
    css.backgroundColor = custom.backgroundColor ?? gradientFallbackColor(custom.backgroundGradient);
    css.backgroundImage = custom.backgroundGradient;
  } else if (custom.backgroundColor !== undefined) {
    css.background = custom.backgroundColor;
  }
  const boxShadow = shadowValue(custom.shadow);
  if (boxShadow !== undefined) css.boxShadow = boxShadow;
  if (custom.borderRadius !== undefined) css.borderRadius = custom.borderRadius;
  if (custom.paddingX !== undefined) css.paddingInline = custom.paddingX;
  if (custom.paddingY !== undefined) css.paddingBlock = custom.paddingY;
  return css;
}

function SectionContent(props: Parameters<typeof renderSection>[0]) {
  const root = renderSection(props);
  const { section, theme } = props;
  const custom = section.customStyle;
  if (!root || !custom) return root;
  const element = root as ReactElement<React.HTMLAttributes<HTMLElement>>;
  const customWeight = fontWeightValue(custom.fontWeight);
  const style = {
    ...element.props.style,
    ...(section.kind === "button" ? {} : sectionOverride(section, theme)),
    "--invite-custom-text": custom.textColor,
    "--invite-custom-size": custom.fontSize === undefined ? undefined : `${custom.fontSize}px`,
    "--invite-custom-line": custom.lineHeight,
    "--invite-custom-weight": customWeight,
    "--invite-custom-tracking":
      custom.letterSpacing === undefined ? undefined : `${custom.letterSpacing}px`,
  } as CSSProperties;
  return cloneElement(element, {
    style,
    className: cn(
      element.props.className,
      custom.textColor && "invite-custom-color",
      custom.fontSize !== undefined && "invite-custom-size",
      custom.lineHeight !== undefined && "invite-custom-line",
      customWeight !== undefined && "invite-custom-weight",
      custom.letterSpacing !== undefined && "invite-custom-tracking",
    ),
  });
}

function renderSection({
  headingId,
  candidateResponse,
  section,
  context,
  organizationName,
  theme,
  editable,
  editingField,
  renderEditor,
  onAction,
}: {
  section: InviteSection;
  headingId: string;
  candidateResponse?: ReactNode;
  context: InviteContext;
  organizationName: string;
  theme: DesignTheme;
  editable: boolean;
  editingField?: string | null;
  renderEditor?: (fieldKey: string) => ReactNode;
  onAction?: (action: InviteAction) => void;
}) {
  const recipe = styleRecipeFor(
    section.kind as DesignBlockType,
    section.variant,
  );
  const style = resolveStyle(recipe, theme);

  const inlineProps = (fieldKey: string, baseClass?: string) =>
    renderEditor
      ? {
          "data-inline-field": fieldKey,
          className: cn(baseClass, "inline-edit-target"),
          title: "双击直接修改文字",
        }
      : baseClass
        ? { className: baseClass }
        : {};
  switch (section.kind) {
    case "logo": {
      const brand = (
        <>
          <span className="invite-brand-mark" aria-hidden="true">
            {organizationInitials(organizationName)}
          </span>
          <span className="invite-brand-copy">
            <span className="invite-brand-name">{organizationName}</span>
            <span className="invite-brand-sub">校园组织</span>
          </span>
        </>
      );
      const content = (
        <div className={cn("invite-brand", alignClass(section.align))}>
          {section.src ? (
            <img
              className="invite-brand-image"
              src={section.src}
              alt={section.alt}
              style={{ width: Math.min(section.width, 240) }}
            />
          ) : (
            brand
          )}
        </div>
      );
      return style.hasSurface ? <div style={styleBox(style)}>{content}</div> : content;
    }
    case "image": {
      if (!section.src) {
        if (!editable) return null;
        return (
          <div className={cn("invite-image-placeholder", alignClass(section.align))}>
            图片未设置
          </div>
        );
      }
      const image = (
        <div className={cn("invite-image-wrap", alignClass(section.align))}>
          <img
            className="invite-image"
            src={section.src}
            alt={section.alt}
            style={{ width: Math.min(section.width, 720) }}
          />
        </div>
      );
      return style.hasSurface ? <div style={styleBox(style)}>{image}</div> : image;
    }
    case "hero":
      return (
        <section
          className={cn("invite-hero", alignClass(section.align))}
          style={{
            textAlign: section.align,
            ...(style.background ? { background: style.background } : {}),
            ...(style.border ? { border: style.border } : {}),
            ...(style.borderLeft ? { borderLeft: style.borderLeft } : {}),
            ...(style.borderTop ? { borderTop: style.borderTop } : {}),
            ...(style.hasSurface
              ? { padding: style.padding, borderRadius: style.borderRadius }
              : {}),
            ...(style.id !== "plain" ? { color: style.textColor } : {}),
          }}
        >
          {section.eyebrow ? (
            <p
              className="invite-hero-eyebrow"
              style={style.id !== "plain" ? { color: style.textColor } : undefined}
            >
              {section.eyebrow}
            </p>
          ) : null}
          <h1
            {...inlineProps("title")}
            style={{
              textAlign: richAlignment(section, "title", section.align),
              ...(style.id !== "plain" ? { color: style.textColor } : {}),
            }}
          >
            {editingField === "title" && renderEditor ? (
              renderEditor("title")
            ) : (
              <RichField
                doc={section.richText?.title}
                context={context}
                fallback={section.title}
                inline
              />
            )}
          </h1>
          {section.subtitle || section.richText?.subtitle ? (
            <p
              {...inlineProps("subtitle", "invite-hero-subtitle")}
              style={{
                textAlign: richAlignment(section, "subtitle", section.align),
                ...(style.id !== "plain" ? { color: style.mutedColor } : {}),
              }}
            >
              {editingField === "subtitle" && renderEditor ? (
                renderEditor("subtitle")
              ) : (
                <RichField
                  doc={section.richText?.subtitle}
                  context={context}
                  fallback={section.subtitle}
                  inline
                />
              )}
            </p>
          ) : null}
        </section>
      );
    case "event_info": {
      const items = [
        { label: "日期", value: section.date, icon: CalendarDays },
        { label: "时间", value: section.time, icon: Clock3 },
        { label: "地点", value: section.location, icon: MapPin },
      ].filter((item) => item.value);
      return (
        <section
          className="invite-card invite-event"
          style={
            style.hasSurface
              ? {
                  ...styleBox(style),
                  color: style.background
                    ? style.textColor
                    : contrastText(theme.surfaceColor),
                }
              : undefined
          }
        >
          <p className="invite-section-kicker">DETAILS</p>
          <h2
            style={
              style.hasSurface
                ? {
                    color: style.background
                      ? style.textColor
                      : contrastText(theme.surfaceColor),
                  }
                : undefined
            }
          >
            {section.title}
          </h2>
          {items.length > 0 ? (
            <div className="invite-event-grid">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="invite-event-item">
                    <span className="invite-event-icon" aria-hidden="true">
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <span className="invite-event-label">{item.label}</span>
                      <span className="invite-event-value">{item.value}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {section.note || section.richText?.note ? (
            <p
              {...inlineProps("note", "invite-note")}
              style={{ textAlign: richAlignment(section, "note", "left") }}
            >
              {editingField === "note" && renderEditor ? (
                renderEditor("note")
              ) : (
                <RichField
                  doc={section.richText?.note}
                  context={context}
                  fallback={section.note}
                  inline
                />
              )}
            </p>
          ) : null}
        </section>
      );
    }
    case "rsvp":
      return (
        <section
          className="invite-rsvp"
          aria-labelledby={headingId}
          style={
            style.hasSurface
              ? {
                  ...styleBox(style),
                  color: style.background
                    ? style.textColor
                    : contrastText(theme.surfaceColor),
                }
              : undefined
          }
        >
          <p className="invite-section-kicker">RSVP</p>
          <h2
            id={headingId}
            style={
              style.hasSurface
                ? {
                    color: style.background
                      ? style.textColor
                      : contrastText(theme.surfaceColor),
                  }
                : undefined
            }
          >
            {section.title}
          </h2>
          {(!candidateResponse || !isSampleResponseInstruction(section.description)) && (section.description || section.richText?.description) ? (
            <p
              {...inlineProps("description")}
              style={{
                textAlign: richAlignment(section, "description", "left"),
              }}
            >
              {editingField === "description" && renderEditor ? (
                renderEditor("description")
              ) : (
                <RichField
                  doc={section.richText?.description}
                  context={context}
                  fallback={section.description}
                  inline
                />
              )}
            </p>
          ) : null}
          {candidateResponse ?? (<div className="invite-actions">
            <button
              type="button"
              className="invite-action invite-action-primary"
              onClick={
                onAction
                  ? () =>
                      onAction({
                        kind: "rsvp-confirm",
                        blockId: section.blockId,
                      })
                  : undefined
              }
            >
              {section.confirmLabel}
            </button>
            <button
              type="button"
              className="invite-action invite-action-secondary"
              onClick={
                onAction
                  ? () =>
                      onAction({
                        kind: section.secondaryAction === "decline" ? "rsvp-decline" : "rsvp-reschedule",
                        blockId: section.blockId,
                      })
                  : undefined
              }
            >
              {section.rescheduleLabel}
            </button>
          </div>)}
        </section>
      );
    case "heading": {
      const Tag = section.level === 1 ? "h2" : section.level === 2 ? "h3" : "h4";
      const align = richAlignment(section, "text", section.align);
      const heading = (
        <Tag
          {...inlineProps(
            "text",
            cn("invite-heading", `invite-heading-${section.level}`),
          )}
          style={{
            textAlign: align,
            color: style.textColor,
            fontStyle: style.italic ? "italic" : undefined,
            textDecoration: style.underline ? "underline" : undefined,
            textDecorationColor: theme.accentColor,
            textDecorationThickness: style.underline ? "3px" : undefined,
            textUnderlineOffset: style.underline ? "8px" : undefined,
            letterSpacing: style.spaced ? "0.08em" : undefined,
          }}
        >
          {editingField === "text" && renderEditor ? (
            renderEditor("text")
          ) : (
            <RichField
              doc={section.richText?.text}
              context={context}
              fallback={section.text}
              inline
            />
          )}
        </Tag>
      );
      return style.hasSurface ? (
        <div style={styleBox(style)}>{heading}</div>
      ) : (
        heading
      );
    }
    case "text": {
      const body = (
        <div
          {...inlineProps("text", "invite-copy")}
          style={{
            textAlign: section.align,
            color: style.textColor,
            fontSize: `${style.sizeScale}rem`,
            fontStyle: style.italic ? "italic" : undefined,
            textDecoration: style.underline ? "underline" : undefined,
          }}
        >
          {editingField === "text" && renderEditor ? (
            renderEditor("text")
          ) : section.richText?.text ? (
            <InviteRichText doc={section.richText.text} context={context} />
          ) : (
            section.text
          )}
        </div>
      );
      return style.hasSurface ? (
        <div style={styleBox(style)}>{body}</div>
      ) : (
        body
      );
    }
    case "info_card": {
      const cardStyle: CSSProperties = {
        ...styleBox(style),
        ...(style.hasSurface ? {} : { border: undefined, padding: undefined }),
      };
      const cardText = style.background
        ? style.textColor
        : contrastText(theme.surfaceColor);
      const cardMuted = style.background
        ? style.mutedColor
        : mixHex(cardText, theme.surfaceColor, 0.72);
      return (
        <section className="invite-card invite-info-card" style={cardStyle}>
          <h2 style={{ color: cardText }}>{section.title}</h2>
          <div
            {...inlineProps("body")}
            style={{ color: cardMuted }}
          >
            {editingField === "body" && renderEditor ? (
              renderEditor("body")
            ) : section.richText?.body ? (
              <InviteRichText doc={section.richText.body} context={context} />
            ) : section.body ? (
              <p>{section.body}</p>
            ) : null}
          </div>
        </section>
      );
    }
    case "button": {
      const scale = style.sizeScale;
      const buttonColor = theme.buttonColor ?? theme.primaryColor;
      const kind =
        style.id === "dashed" ||
        style.id === "outline" ||
        style.id === "pill" ||
        style.id === "mono"
          ? "outline"
          : style.id === "underline"
            ? "link"
            : style.id === "soft" ||
                style.id === "tinted" ||
                style.id === "note" ||
                style.id === "sidebar"
              ? "soft"
              : "solid";
      const buttonStyle: CSSProperties =
        kind === "link"
          ? {
              backgroundColor: "transparent",
              border: "0",
              padding: 0,
              color: buttonColor,
              textDecoration: "underline",
              borderRadius: style.borderRadius,
              fontSize: `${15 * scale}px`,
            }
          : kind === "outline"
            ? {
                backgroundColor: "transparent",
                border: `${style.id === "dashed" ? "1px dashed" : "1px solid"} ${
                  style.id === "mono"
                    ? (theme.borderColor ?? theme.mutedTextColor)
                    : buttonColor
                }`,
                color: style.id === "mono" ? theme.textColor : style.textColor,
                borderRadius: style.borderRadius,
                padding: `${11 * scale}px ${23 * scale}px`,
              }
            : kind === "soft"
              ? {
                  backgroundColor: style.background ?? theme.surfaceColor,
                  border: `1px solid ${style.background ?? theme.borderColor ?? "transparent"}`,
                  color: style.textColor,
                  borderRadius: style.borderRadius,
                  padding: `${12 * scale}px ${24 * scale}px`,
                }
              : {
                  backgroundColor:
                    style.id === "filled" || style.id === "band"
                      ? theme.accentColor
                      : buttonColor,
                  color:
                    style.id === "filled" || style.id === "band"
                      ? contrastText(theme.accentColor)
                      : (theme.buttonTextColor ?? "#fffdfa"),
                  borderRadius: style.borderRadius,
                  padding: `${12 * scale}px ${24 * scale}px`,
                };
      Object.assign(buttonStyle, sectionOverride(section, theme));
      const className = cn(
        "invite-action",
        kind === "solid" && "invite-action-primary",
        kind === "link" && "invite-action-link",
      );
      if (editable) {
        return (
          <div className="invite-single-action" style={{ textAlign: section.align }}>
            <span className={className} style={buttonStyle}>
              {section.text}
            </span>
          </div>
        );
      }
      if (onAction) {
        return (
          <div className="invite-single-action" style={{ textAlign: section.align }}>
            <button
              type="button"
              className={className}
              style={buttonStyle}
              onClick={() => onAction({ kind: "button", blockId: section.blockId })}
            >
              {section.text}
            </button>
          </div>
        );
      }
      return (
        <div className="invite-single-action" style={{ textAlign: section.align }}>
          {section.url ? (
            <a
              className={className}
              style={buttonStyle}
              href={section.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {section.text}
            </a>
          ) : (
            <span
              className={cn(className, "is-disabled")}
              style={buttonStyle}
              aria-disabled="true"
            >
              {section.text}
            </span>
          )}
        </div>
      );
    }
    case "divider": {
      const spec = dividerSpec(recipe, theme);
      if (spec.short) {
        return (
          <div style={{ textAlign: "center", margin: `${section.spacing}px 0` }}>
            <div
              style={{
                display: "inline-block",
                width: 56,
                height: spec.width,
                borderRadius: 2,
                backgroundColor: spec.color,
              }}
            />
          </div>
        );
      }
      return (
        <hr
          className="invite-divider"
          style={{
            marginTop: section.spacing,
            marginBottom: section.spacing,
            borderTopStyle: spec.line,
            borderTopWidth: spec.width,
            borderTopColor: spec.color,
          }}
        />
      );
    }
    case "footer": {
      const footer = (
        <footer
          {...inlineProps("text", "invite-footer")}
          style={{
            textAlign: richAlignment(section, "text", section.align),
            color: style.mutedColor,
            fontSize: `${12 * style.sizeScale}px`,
            fontStyle: style.italic ? "italic" : undefined,
            textDecoration: style.underline ? "underline" : undefined,
          }}
        >
          {editingField === "text" && renderEditor ? (
            renderEditor("text")
          ) : (
            <RichField
              doc={section.richText?.text}
              context={context}
              fallback={section.text}
              inline
            />
          )}
        </footer>
      );
      return style.hasSurface ? <div style={styleBox(style)}>{footer}</div> : footer;
    }
    case "spacer":
      return (
        <div
          style={{
            height: Math.round(section.height * style.sizeScale),
          }}
          aria-hidden="true"
        />
      );
    default:
      return null;
  }
}

function FreeHtmlInviteView({
  document,
  context,
  candidateResponse,
  candidateResponseTitle,
  minHeight,
  onAction,
}: {
  document: DesignDocument;
  context: InviteContext;
  candidateResponse?: ReactNode;
  candidateResponseTitle?: string;
  minHeight?: string;
  onAction?: (action: InviteAction) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sizeObserver = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(660);
  const renderedHtml = useMemo(
    () =>
      renderFreeEmailHtml(document, context as Record<string, string | undefined>, {
        allowDataImageUrls: true,
      }).html,
    [context, document],
  );

  useEffect(() => () => sizeObserver.current?.disconnect(), []);

  function syncHeight() {
    sizeObserver.current?.disconnect();
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) return;
    const measure = () => setHeight(Math.max(120, Math.min(3600, Math.ceil(body.getBoundingClientRect().height))));
    measure();
    sizeObserver.current = new ResizeObserver(measure);
    sizeObserver.current.observe(body);
  }

  return (
    <div
      style={{
        minHeight: minHeight ?? "100vh",
        backgroundColor: document.theme.backgroundColor,
        paddingBottom: 40,
        "--ip-primary": document.theme.primaryColor,
        "--ip-button": document.theme.buttonColor ?? document.theme.primaryColor,
        "--ip-button-text": document.theme.buttonTextColor ?? "#fffdfa",
      } as CSSProperties}
    >
      <iframe
        ref={iframeRef}
        title="专属邀请函内容"
        sandbox="allow-same-origin"
        srcDoc={renderedHtml}
        onLoad={syncHeight}
        style={{
          display: "block",
          width: "100%",
          height,
          border: 0,
          backgroundColor: "transparent",
        }}
      />
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "clamp(12px, 3vw, 30px) 14px 0",
        }}
      >
        <section
          style={{
            backgroundColor: "#fffdfa",
            borderRadius: 18,
            boxShadow: "0 13px 38px rgb(44 30 21 / 8%)",
            padding: "clamp(17px, 4vw, 30px)",
            color: "#302321",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div
              style={{
                fontFamily: "Georgia,'Times New Roman',serif",
                fontSize: 11,
                letterSpacing: "3px",
                color: "var(--ip-primary)",
              }}
            >
              RSVP
            </div>
            <h2
              style={{
                margin: "6px 0 0",
                fontSize: 18,
                fontWeight: 600,
                color: "#241b19",
              }}
            >
              {candidateResponseTitle ?? "出席确认与答复"}
            </h2>
          </div>
          {candidateResponse ? (
            candidateResponse
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
              <button
                type="button"
                onClick={() => onAction?.({ kind: "rsvp-confirm", blockId: "free-html-rsvp" })}
                style={{
                  minWidth: 160,
                  padding: "11px 22px",
                  borderRadius: 4,
                  border: "1px solid var(--ip-button)",
                  backgroundColor: "var(--ip-button)",
                  color: "var(--ip-button-text)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                确认准时参加
              </button>
              <button
                type="button"
                onClick={() => onAction?.({ kind: "rsvp-reschedule", blockId: "free-html-rsvp" })}
                style={{
                  minWidth: 160,
                  padding: "11px 22px",
                  borderRadius: 4,
                  border: "1px solid #c7b8ae",
                  backgroundColor: "transparent",
                  color: "#302321",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                申请调整时间 / 婉拒
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function InvitePageView({
  candidateResponse,
  candidateResponseTitle,
  document,
  context = EMPTY_CONTEXT,
  embedded = false,
  minHeight,
  editable = false,
  selectedBlockId = null,
  onSelectBlock,
  onMoveBlock,
  onDuplicateBlock,
  onRemoveBlock,
  onReorderBlock,
  onEditBlock,
  editingBlockId = null,
  editingField = null,
  renderInlineEditor,
  onAction,
}: InvitePageViewProps) {
  const viewId = useId();
  const drag = useModuleDrag(editable ? onReorderBlock : undefined);
  const model = useMemo(
    () => buildInvitePage(document, context),
    [document, context],
  );
  const organizationName = context.organization_name?.trim() || "CampusFlow";
  const theme = model.theme;
  const style = {
    "--ip-bg": theme.backgroundColor,
    "--ip-primary": theme.primaryColor,
    "--ip-accent": theme.accentColor,
    "--ip-surface": theme.surfaceColor,
    "--ip-text": theme.textColor,
    "--ip-muted": theme.mutedTextColor,
    "--ip-primary-text": contrastText(theme.primaryColor),
    "--ip-surface-text": contrastText(theme.surfaceColor),
    "--ip-accent-text": contrastText(theme.accentColor),
    "--ip-button": theme.buttonColor ?? theme.primaryColor,
    "--ip-button-text": theme.buttonTextColor ?? contrastText(theme.buttonColor ?? theme.primaryColor),
    "--ip-border":
      theme.borderColor ??
      (theme.backgroundColor === "#f4f1ea"
        ? "rgba(24,36,32,.12)"
        : "rgba(255,255,255,.18)"),
    "--ip-radius": `${Math.max(0, theme.radius)}px`,
    "--ip-space": `${Math.max(4, theme.spacing)}px`,
    "--ip-width": `${Math.min(1040, Math.max(320, theme.width))}px`,
    fontFamily: theme.fontFamily,
    ...(minHeight ? { minHeight } : {}),
  } as CSSProperties;

  if (document.target === "invite_page" && document.mode === "html") {
    return (
      <FreeHtmlInviteView
        document={document}
        context={context}
        candidateResponse={candidateResponse}
        candidateResponseTitle={candidateResponseTitle}
        minHeight={minHeight}
        onAction={onAction}
      />
    );
  }

  return (
    <div
      className={cn("invite-page", embedded && "invite-page--embedded")}
      style={style}
    >
      <div className="invite-atmosphere" aria-hidden="true">
        <span className="invite-orb invite-orb-a" />
        <span className="invite-orb invite-orb-b" />
      </div>
      <main className="invite-content">
        <div className="invite-body">
          {model.sections.length === 0 ? (
            <div className="invite-card invite-empty">
              <p>邀请内容正在准备中</p>
            </div>
          ) : (
            model.sections.map((section, index) => {
              const label = SECTION_LABELS[section.kind];
              const selected = editable && section.blockId === selectedBlockId;
              const hasRichField = Boolean(
                moduleDefinition(section.kind)?.fields.some(
                  (field) => field.rich,
                ),
              );
              const activeEditingField =
                editingBlockId === section.blockId ? editingField : null;
              const content = (
                <SectionContent
                  headingId={`${viewId}-${section.blockId}`}
                  candidateResponse={candidateResponse}
                  section={section.kind === "rsvp" && candidateResponseTitle ? { ...section, title: candidateResponseTitle } : section}
                  context={context}
                  organizationName={organizationName}
                  theme={theme}
                  editable={editable}
                  editingField={activeEditingField}
                  renderEditor={
                    renderInlineEditor
                      ? (fieldKey) =>
                          renderInlineEditor(section.blockId, fieldKey)
                      : undefined
                  }
                  onAction={onAction}
                />
              );
              if (!content) return null;

              const handleKeyDown = (
                event: KeyboardEvent<HTMLDivElement>,
              ) => {
                if (!editable || event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectBlock?.(section.blockId);
                }
              };

              return (
                <div
                  key={section.blockId}
                  data-module-id={section.blockId}
                  className={cn(
                    "invite-block invite-reveal",
                    editable && "invite-edit-block",
                    selected && "is-selected",
                    editable && drag.dropClass(section.blockId),
                    editable && drag.isDragging(section.blockId) && "module-dragging",
                  )}
                  style={{
                    animationDelay: `${Math.min(index * 60, 360)}ms`,
                  }}
                  role={editable ? "group" : undefined}
                  tabIndex={editable ? 0 : undefined}
                  aria-label={
                    editable
                      ? `${label}模块${selected ? "，已选中" : ""}`
                      : undefined
                  }
                  onClick={
                    editable ? () => onSelectBlock?.(section.blockId) : undefined
                  }
                  onKeyDown={handleKeyDown}
                  onDragOver={
                    editable
                      ? (event) => drag.onDragOver(event, section.blockId)
                      : undefined
                  }
                  onDrop={
                    editable
                      ? (event) => drag.onDrop(event, section.blockId)
                      : undefined
                  }
                >
                  {selected ? (
                    <div
                      className="invite-edit-toolbar"
                      data-block-toolbar=""
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        draggable
                        tabIndex={-1}
                        className="invite-edit-action invite-edit-drag cursor-grab active:cursor-grabbing"
                        aria-label="按住拖动，调整模块顺序"
                        title="按住拖动，调整模块顺序"
                        onDragStart={(event) =>
                          drag.onDragStart(event, section.blockId)
                        }
                        onDragEnd={drag.onDragEnd}
                      >
                        <GripVertical className="size-3.5" aria-hidden="true" />
                        <span>拖动排序</span>
                      </button>
                      {hasRichField ? (
                        <button
                          type="button"
                          className="invite-edit-action"
                          aria-label="在画布上编辑文字"
                          title="在画布上编辑文字"
                          onClick={() => onEditBlock?.(section.blockId)}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="invite-edit-action"
                        aria-label="上移模块"
                        disabled={index === 0}
                        onClick={() => onMoveBlock?.(section.blockId, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="invite-edit-action"
                        aria-label="下移模块"
                        disabled={index === model.sections.length - 1}
                        onClick={() => onMoveBlock?.(section.blockId, 1)}
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="invite-edit-action"
                        aria-label="复制模块"
                        title="复制模块"
                        onClick={() => onDuplicateBlock?.(section.blockId)}
                      >
                        <Copy className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="invite-edit-action invite-edit-action-danger"
                        aria-label="删除模块"
                        onClick={() => onRemoveBlock?.(section.blockId)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                  {content}
                </div>
              );
            })
          )}
          {candidateResponse && !model.sections.some(section => section.kind === "rsvp") ? <section className="invite-rsvp"><h2>{candidateResponseTitle ?? "出席答复"}</h2>{candidateResponse}</section> : null}
        </div>
      </main>
    </div>
  );
}
