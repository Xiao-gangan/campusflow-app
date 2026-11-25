import type { CSSProperties, ReactNode } from "react";
import type {
  DesignBlock,
  DesignTarget,
  DesignTheme,
} from "@/shared/contracts/design";
import { sanitizeRichTextMap } from "@/shared/design/rich-text";
import { isMobilePreviewWidth } from "@/shared/design/devices";
import {
  boxStyleProperties,
  fontWeightValue,
  resolveBlockStyle,
  richTextWithBlockStyle,
} from "@/shared/design/block-style";
import {
  dividerSpec,
  styleRecipeFor,
  type ResolvedStyle,
} from "@/shared/design/style-recipes";
import {
  interpolateDesignVariables,
  sampleVariableValues,
} from "@/shared/design/variables";
import { cn } from "@/lib/utils";
import { InviteRichText } from "../invite/InviteRichText";
import {
  orgPreviewVariables,
  readOrganizationProfile,
  useOrganizationProfile,
} from "../org/organization";

const SAMPLE_CONTEXT = sampleVariableValues();

type BlockPreviewProps = {
  block: DesignBlock;
  theme: DesignTheme;
  target: DesignTarget;
  viewportWidth?: number;
  interactiveLinks?: boolean;
  editingField?: string | null;
  renderInlineEditor?: (fieldKey: string) => ReactNode;
};

function inlineFieldProps(
  fieldKey: string,
  renderInlineEditor?: (fieldKey: string) => ReactNode,
) {
  if (!renderInlineEditor) return {};
  return {
    "data-inline-field": fieldKey,
    className: "inline-edit-target",
  };
}

function textProp(
  props: Record<string, unknown>,
  key: string,
  fallback = "",
  context: Record<string, string> = orgPreviewVariables(
    SAMPLE_CONTEXT,
    readOrganizationProfile(),
  ),
): string {
  const raw = typeof props[key] === "string" ? (props[key] as string) : fallback;
  return interpolateDesignVariables(raw, context);
}

function numberProp(
  props: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(props[key]);
  return Number.isFinite(value) ? value : fallback;
}

function alignProp(props: Record<string, unknown>, fallback = "left") {
  const value = textProp(props, "align", fallback);
  return ["left", "center", "right"].includes(value) ? value : fallback;
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

function ImageBlock({
  block,
  theme,
  target,
  logo,
  wordmarkColor,
}: {
  block: DesignBlock;
  theme: DesignTheme;
  target: DesignTarget;
  logo?: boolean;
  wordmarkColor?: string;
}) {
  const src = textProp(block.props, "src");
  const assetId = textProp(block.props, "assetId");
  const alt = textProp(block.props, "alt", logo ? "组织 Logo" : "图片");
  const width = Math.max(48, numberProp(block.props, "width", logo ? 200 : 320));
  const align = alignProp(block.props, "center");
  const wrapper: CSSProperties = { textAlign: align as CSSProperties["textAlign"] };

  if (!src) {
    if (logo) {
      const org = readOrganizationProfile();
      const brand =
        alt.replace(/\s*logo\s*$/iu, "").trim() ||
        org.name ||
        SAMPLE_CONTEXT.organization_name ||
        "";
      return (
        <div style={wrapper}>
          <p
            style={{
              margin: 0,
              fontFamily: theme.fontFamily,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: wordmarkColor ?? theme.primaryColor,
            }}
          >
            {brand || "组织品牌"}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: theme.fontFamily,
              fontSize: 10,
              color: theme.mutedTextColor,
            }}
          >
            {assetId
              ? "Logo 素材不可用，发送时使用文字品牌名"
              : "未设置 Logo，发送时使用文字品牌名"}
          </p>
        </div>
      );
    }
    return (
      <div style={wrapper}>
        <div
          className="mx-auto grid min-h-24 place-items-center rounded-2xl border border-dashed px-4 py-5 text-xs"
          style={{
            maxWidth: width,
            borderColor:
              theme.borderColor ??
              (target === "invite_page" ? "rgba(255,255,255,.35)" : "var(--border)"),
            color: theme.mutedTextColor,
            backgroundColor:
              target === "invite_page" ? "rgba(255,255,255,.06)" : "rgba(29,83,67,.03)",
          }}
        >
          {assetId ? "图片引用不可用 · 素材缺失" : "图片未设置 · 发送时省略"}
        </div>
      </div>
    );
  }

  return (
    <div style={wrapper}>
      <img
        src={src}
        alt={alt}
        width={width}
        style={{
          display: "inline-block",
          maxWidth: "100%",
          height: "auto",
          border: 0,
        }}
      />
    </div>
  );
}

export function BlockPreview({
  block,
  theme,
  target,
  viewportWidth = 600,
  interactiveLinks = true,
  editingField,
  renderInlineEditor,
}: BlockPreviewProps) {
  const org = useOrganizationProfile();
  const sampleContext = orgPreviewVariables(SAMPLE_CONTEXT, org);
  const isInvite = target === "invite_page";
  const mobileEmail = target === "email" && isMobilePreviewWidth(viewportWidth);
  const recipe = styleRecipeFor(
    block.type,
    typeof block.props.variant === "string" ? block.props.variant : "",
  );
  const { style, custom, box, hasBox, linkButton, textColor, mutedColor } =
    resolveBlockStyle(block.type, block.props, theme);
  const customBox = boxStyleProperties(box);
  const cardText = isInvite ? "#182420" : theme.textColor;
  const surfaceStyle: CSSProperties = {
    backgroundColor: theme.surfaceColor,
    borderRadius: theme.radius,
    border: `1px solid ${isInvite ? "rgba(24,36,32,.12)" : "rgba(29,83,67,.14)"}`,
    padding: "18px 20px",
    color: cardText,
  };

  const richText = Object.fromEntries(
    Object.entries(sanitizeRichTextMap(block.props.richText)).map(([key, doc]) => [
      key, richTextWithBlockStyle(doc, custom),
    ]),
  );
  const blockAlign = alignProp(block.props) as CSSProperties["textAlign"];

  switch (block.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, numberProp(block.props, "level", 1)));
      const headingBase = level === 1 ? 30 : level === 2 ? 24 : 20;
      const size = mobileEmail
        ? level === 1
          ? 24
          : level === 2
            ? 21
            : 18
        : headingBase * style.sizeScale;
      const rich = richText.text;
      const align = rich
        ? (rich.content[0]?.attrs?.textAlign ?? blockAlign)
        : blockAlign;
      const heading = (
        <h2
          {...inlineFieldProps("text", renderInlineEditor)}
          title={renderInlineEditor ? "双击直接修改文字" : undefined}
          style={{
            margin: 0,
            fontFamily: theme.fontFamily,
            fontSize: custom.fontSize ?? size,
            lineHeight: custom.lineHeight ?? 1.3,
            fontWeight: fontWeightValue(custom.fontWeight) ?? 600,
            color: textColor,
            textAlign: align,
            fontStyle: style.italic ? "italic" : undefined,
            textDecoration: style.underline ? "underline" : undefined,
            letterSpacing:
              custom.letterSpacing !== undefined
                ? `${custom.letterSpacing}px`
                : style.spaced
                  ? "0.08em"
                  : undefined,
          }}
        >
          {editingField === "text" && renderInlineEditor ? (
            renderInlineEditor("text")
          ) : rich ? (
            <InviteRichText doc={rich} context={sampleContext} interactiveLinks={interactiveLinks} inline />
          ) : (
            textProp(block.props, "text")
          )}
        </h2>
      );
      const bar = style.underline ? (
        <div
          style={{
            width: 48,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.accentColor,
            margin:
              align === "center"
                ? "10px auto 0"
                : align === "right"
                  ? "10px 0 0 auto"
                  : "10px auto 0 0",
          }}
        />
      ) : null;
      return hasBox ? (
        <div style={customBox}>
          {heading}
          {bar}
        </div>
      ) : (
        <>
          {heading}
          {bar}
        </>
      );
    }
    case "text": {
      const rich = richText.text;
      const body = (
        <div
          {...inlineFieldProps("text", renderInlineEditor)}
          title={renderInlineEditor ? "双击直接修改文字" : undefined}
          style={{
            margin: 0,
            whiteSpace: rich || editingField === "text" ? "normal" : "pre-wrap",
            fontFamily: theme.fontFamily,
            fontSize: custom.fontSize ?? (mobileEmail ? 14 : 15) * style.sizeScale,
            lineHeight: custom.lineHeight ?? 1.8,
            fontWeight: fontWeightValue(custom.fontWeight),
            letterSpacing: custom.letterSpacing !== undefined ? `${custom.letterSpacing}px` : undefined,
            fontStyle: style.italic ? "italic" : undefined,
            textDecoration: style.underline ? "underline" : undefined,
            color: textColor,
            textAlign: blockAlign,
          }}
        >
          {editingField === "text" && renderInlineEditor ? (
            renderInlineEditor("text")
          ) : rich ? (
            <InviteRichText doc={rich} context={sampleContext} interactiveLinks={interactiveLinks} />
          ) : (
            textProp(block.props, "text")
          )}
        </div>
      );
      return hasBox ? <div style={customBox}>{body}</div> : body;
    }
    case "logo":
    case "image": {
      const framed = (
        <ImageBlock
          block={block}
          theme={theme}
          target={target}
          logo={block.type === "logo"}
          wordmarkColor={style.textColor}
        />
      );
      return style.hasSurface ? (
        <div style={styleBox(style)}>{framed}</div>
      ) : (
        framed
      );
    }
    case "button": {
      const align = alignProp(block.props, "center");
      const fullWidth = mobileEmail && !linkButton;
      const fontSize = custom.fontSize ?? Math.round(15 * style.sizeScale);
      return (
        <div style={{ textAlign: align as CSSProperties["textAlign"] }}>
          <span
            style={{
              ...customBox,
              display: fullWidth ? "block" : "inline-block",
              ...(fullWidth ? { width: "100%", boxSizing: "border-box" } : {}),
              textAlign: "center",
              fontFamily: theme.fontFamily,
              fontSize,
              fontWeight: fontWeightValue(custom.fontWeight) ?? 600,
              lineHeight: custom.lineHeight ?? 1.4,
              letterSpacing: custom.letterSpacing !== undefined ? `${custom.letterSpacing}px` : undefined,
              color: textColor,
              textDecoration: linkButton ? "underline" : undefined,
            }}
          >
            {textProp(block.props, "text", "查看详情")}
          </span>
        </div>
      );
    }
    case "divider": {
      const spacing = numberProp(block.props, "spacing", 16);
      const spec = dividerSpec(recipe, theme);
      if (spec.short) {
        return (
          <div style={{ textAlign: "center", margin: `${spacing}px 0` }}>
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
          style={{
            border: 0,
            borderTop: `${spec.width}px ${spec.line} ${spec.color}`,
            margin: `${spacing}px 0`,
          }}
        />
      );
    }
    case "info_card": {
      return (
        <div style={customBox}>
          <p
            style={{
              margin: 0,
              fontFamily: theme.fontFamily,
              fontSize: custom.fontSize ?? 15,
              lineHeight: custom.lineHeight ?? 1.6,
              fontWeight: fontWeightValue(custom.fontWeight) ?? 600,
              letterSpacing: custom.letterSpacing !== undefined ? `${custom.letterSpacing}px` : undefined,
              color: textColor,
            }}
          >
            {textProp(block.props, "title", "信息卡片")}
          </p>
          <div
            {...inlineFieldProps("body", renderInlineEditor)}
            title={renderInlineEditor ? "双击直接修改文字" : undefined}
            style={{
              margin: "10px 0 0",
              whiteSpace:
                richText.body || editingField === "body" ? "normal" : "pre-wrap",
              fontFamily: theme.fontFamily,
              fontSize: custom.fontSize ?? 14,
              lineHeight: custom.lineHeight ?? 1.8,
              color: mutedColor,
            }}
          >
            {editingField === "body" && renderInlineEditor ? (
              renderInlineEditor("body")
            ) : richText.body ? (
              <InviteRichText doc={richText.body} context={sampleContext} interactiveLinks={interactiveLinks} />
            ) : (
              textProp(block.props, "body")
            )}
          </div>
        </div>
      );
    }
    case "hero":
      return (
        <div
          style={{
            borderRadius: theme.radius,
            padding: "34px 26px",
            background: `linear-gradient(135deg, ${theme.primaryColor} 0%, #0b1812 100%)`,
            color: theme.textColor,
            textAlign: alignProp(block.props, "center") as CSSProperties["textAlign"],
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: theme.fontFamily,
              fontSize: 11,
              letterSpacing: "0.22em",
              color: theme.accentColor,
            }}
          >
            {textProp(block.props, "eyebrow")}
          </p>
          <h2
            style={{
              margin: "12px 0 0",
              fontFamily: theme.fontFamily,
              fontSize: 32,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
            }}
          >
            {textProp(block.props, "title")}
          </h2>
          <p
            style={{
              margin: "12px auto 0",
              maxWidth: 620,
              whiteSpace: "pre-wrap",
              fontFamily: theme.fontFamily,
              fontSize: 14,
              lineHeight: 1.8,
              color: theme.mutedTextColor,
            }}
          >
            {textProp(block.props, "subtitle")}
          </p>
        </div>
      );
    case "event_info":
      return (
        <div style={surfaceStyle}>
          <p style={{ margin: 0, fontFamily: theme.fontFamily, fontSize: 15, fontWeight: 650 }}>
            {textProp(block.props, "title", "活动信息")}
          </p>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
              margin: "16px 0 0",
              fontFamily: theme.fontFamily,
            }}
          >
            {[
              ["日期", textProp(block.props, "date")],
              ["时间", textProp(block.props, "time")],
              ["地点", textProp(block.props, "location")],
            ].map(([label, value]) => (
              <div key={label}>
                <dt style={{ fontSize: 10, letterSpacing: "0.14em", color: "#7b857f" }}>{label}</dt>
                <dd style={{ margin: "5px 0 0", fontSize: 14, fontWeight: 600 }}>{value}</dd>
              </div>
            ))}
          </dl>
          {textProp(block.props, "note") ? (
            <p
              style={{
                margin: "16px 0 0",
                whiteSpace: "pre-wrap",
                fontFamily: theme.fontFamily,
                fontSize: 12,
                lineHeight: 1.7,
                color: "#66736c",
              }}
            >
              {textProp(block.props, "note")}
            </p>
          ) : null}
        </div>
      );
    case "rsvp":
      return (
        <div style={{ ...surfaceStyle, textAlign: "center" }}>
          <p style={{ margin: 0, fontFamily: theme.fontFamily, fontSize: 17, fontWeight: 650 }}>
            {textProp(block.props, "title", "确认出席")}
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontFamily: theme.fontFamily,
              fontSize: 13,
              lineHeight: 1.7,
              color: "#66736c",
            }}
          >
            {textProp(block.props, "description")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 18 }}>
            <span
              style={{
                borderRadius: 999,
                backgroundColor: theme.primaryColor,
                color: "#fffdfa",
                padding: "10px 20px",
                fontFamily: theme.fontFamily,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {textProp(block.props, "confirmLabel", "确认参加")}
            </span>
            <span
              style={{
                borderRadius: 999,
                border: `1px solid ${theme.primaryColor}`,
                color: theme.primaryColor,
                padding: "10px 20px",
                fontFamily: theme.fontFamily,
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: "transparent",
              }}
            >
              {textProp(block.props, "rescheduleLabel", "申请调整时间")}
            </span>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 10, color: "#8a948e" }}>
            出席确认将在邀请网页上线后开放
          </p>
        </div>
      );
    case "footer": {
      const rich = richText.text;
      const body = (
        <div
          {...inlineFieldProps("text", renderInlineEditor)}
          title={renderInlineEditor ? "双击直接修改文字" : undefined}
          style={{
            margin: 0,
            fontFamily: theme.fontFamily,
            fontSize: custom.fontSize ?? 12 * style.sizeScale,
            lineHeight: custom.lineHeight ?? 1.7,
            fontWeight: fontWeightValue(custom.fontWeight),
            letterSpacing: custom.letterSpacing !== undefined ? `${custom.letterSpacing}px` : undefined,
            fontStyle: style.italic ? "italic" : undefined,
            textDecoration: style.underline ? "underline" : undefined,
            color: mutedColor,
            textAlign: (rich?.content[0]?.attrs?.textAlign ??
              alignProp(block.props, "center")) as CSSProperties["textAlign"],
          }}
        >
          {editingField === "text" && renderInlineEditor ? (
            renderInlineEditor("text")
          ) : rich ? (
            <InviteRichText doc={rich} context={sampleContext} interactiveLinks={interactiveLinks} inline />
          ) : (
            textProp(block.props, "text")
          )}
        </div>
      );
      return hasBox ? <div style={customBox}>{body}</div> : body;
    }
    case "spacer": {
      const height = Math.round(
        numberProp(block.props, "height", 24) * style.sizeScale,
      );
      if (style.hasSurface) {
        return (
          <div style={{ ...styleBox(style), minHeight: height }} aria-hidden="true" />
        );
      }
      return <div style={{ height }} />;
    }
    default:
      return (
        <p className={cn("text-xs text-muted-foreground")}>
          暂不支持的模块：{block.type}
        </p>
      );
  }
}
