import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ScaledPreview({
  viewportWidth,
  contentWidth,
  children,
  className,
}: {
  viewportWidth: number;
  contentWidth: number;
  children: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [displayWidth, setDisplayWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const safeContentWidth = Math.max(1, Math.round(contentWidth));

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const measure = () => {
      setDisplayWidth(Math.round(container.clientWidth));
      setContentHeight(content.offsetHeight);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [safeContentWidth]);

  const scale =
    displayWidth > 0
      ? Math.min(1, displayWidth / safeContentWidth)
      : 1;
  const scaledWidth = safeContentWidth * scale;

  return (
    <div
      ref={containerRef}
      className={cn("w-full min-w-0", className)}
      data-canvas-viewport=""
      data-logical-width={viewportWidth}
      data-content-width={safeContentWidth}
      data-display-width={displayWidth}
      data-scale={scale.toFixed(4)}
    >
      <div
        className="mx-auto"
        style={{ width: scaledWidth, height: contentHeight * scale }}
      >
        <div
          ref={contentRef}
          style={{
            width: safeContentWidth,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}