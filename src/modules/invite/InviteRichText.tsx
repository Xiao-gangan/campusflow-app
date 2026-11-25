import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { EditorInlineNode } from "@/shared/design/legacy-text";
import type { EditorDoc } from "@/shared/design/legacy-text";
import type { InviteContext } from "@/shared/invite/model";
import { cn } from "@/lib/utils";

function renderInlineNode(
  node: EditorInlineNode,
  context: InviteContext,
  key: number,
  interactiveLinks: boolean,
): ReactNode {
  if (node.type === "hardBreak") return <br key={key} />;

  let content: ReactNode =
    node.type === "text" ? node.text : context[node.attrs.field] ?? "";
  const marks = node.marks ?? [];
  const style: CSSProperties = {};

  for (const mark of marks) {
    if (mark.type === "textStyle") {
      if (typeof mark.attrs?.color === "string") style.color = mark.attrs.color;
      if (typeof mark.attrs?.fontSize === "string") {
        style.fontSize = mark.attrs.fontSize;
      }
    }
  }
  if (Object.keys(style).length > 0) {
    content = <span style={style}>{content}</span>;
  }
  if (marks.some((mark) => mark.type === "underline")) {
    content = <u>{content}</u>;
  }
  if (marks.some((mark) => mark.type === "italic")) {
    content = <em>{content}</em>;
  }
  if (marks.some((mark) => mark.type === "bold")) {
    content = <strong>{content}</strong>;
  }
  const link = marks.find((mark) => mark.type === "link");
  if (link && typeof link.attrs?.href === "string") {
    content = interactiveLinks ? (
      <a
        href={link.attrs.href}
        target="_blank"
        rel="noreferrer noopener"
        style={{ color: "inherit", textDecoration: "underline" }}
      >
        {content}
      </a>
    ) : (
      <span style={{ textDecoration: "underline" }}>{content}</span>
    );
  }

  return <Fragment key={key}>{content}</Fragment>;
}

export function InviteRichText({
  doc,
  context,
  inline = false,
  interactiveLinks = true,
  className,
}: {
  doc?: EditorDoc | null;
  context: InviteContext;
  inline?: boolean;
  interactiveLinks?: boolean;
  className?: string;
}) {
  if (!doc) return null;

  if (inline) {
    return (
      <>
        {doc.content.map((paragraph, paragraphIndex) => (
          <Fragment key={paragraphIndex}>
            {(paragraph.content ?? []).map((node, nodeIndex) =>
              renderInlineNode(node, context, nodeIndex, interactiveLinks),
            )}
            {paragraphIndex < doc.content.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </>
    );
  }

  return (
    <div className={cn("invite-rich-block", className)}>
      {doc.content.map((paragraph, paragraphIndex) => (
        <p
          key={paragraphIndex}
          style={{ textAlign: paragraph.attrs?.textAlign }}
        >
          {(paragraph.content ?? []).map((node, nodeIndex) =>
            renderInlineNode(node, context, nodeIndex, interactiveLinks),
          )}
        </p>
      ))}
    </div>
  );
}
