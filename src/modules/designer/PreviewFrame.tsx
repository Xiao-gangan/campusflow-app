import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PreviewFrameProps = {
  width: number;
  height: number;
  kind: "phone" | "tablet" | "desktop" | "custom";
  label: string;
  children: ReactNode;
  className?: string;
};

const MIN_SCALE = 0.05;

export function PreviewFrame({
  width,
  height,
  kind,
  label,
  children,
  className,
}: PreviewFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const chrome = kind === "phone" ? 20 : kind === "tablet" ? 24 : 12;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const availableWidth = Math.max(80, container.clientWidth - 8);
      const availableHeight = Math.max(
        160,
        Math.min(window.innerHeight * 0.64, 720) - chrome,
      );
      setScale(
        Math.max(
          MIN_SCALE,
          Math.min(
            1,
            (availableWidth - chrome) / width,
            availableHeight / height,
          ),
        ),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [chrome, width, height]);

  const bezel =
    kind === "phone"
      ? "rounded-[34px] border-[5px] p-[5px]"
      : kind === "tablet"
        ? "rounded-[26px] border-[7px] p-[5px]"
        : "rounded-[16px] border p-[5px]";
  const screenRadius =
    kind === "phone" ? "rounded-[28px]" : kind === "tablet" ? "rounded-[19px]" : "rounded-[11px]";
  const frameWidth = width * scale + chrome;

  return (
    <div ref={containerRef} className={cn("w-full min-w-0", className)}>
      <div
        className="mx-auto flex w-full max-w-full min-w-0 flex-col items-center"
        style={{ maxWidth: frameWidth }}
      >
        <div
          className={cn(
            "relative max-w-full bg-[#1b221e] shadow-[0_30px_70px_-32px_rgba(12,30,22,.55)]",
            bezel,
          )}
          style={{ width: frameWidth }}
        >
          {kind === "desktop" ? (
            <div className="mb-[5px] flex items-center gap-1.5 px-1.5 pt-0.5">
              <span className="size-2 rounded-full bg-[#f0a29a]" />
              <span className="size-2 rounded-full bg-[#f2d39a]" />
              <span className="size-2 rounded-full bg-[#a8d5b1]" />
              <span className="ml-2 h-3.5 flex-1 rounded-full bg-white/10" />
            </div>
          ) : null}
          <div
            className={cn("relative overflow-hidden bg-white", screenRadius)}
            style={{ width: width * scale, height: height * scale }}
          >
            <div
              style={{
                width,
                height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              {children}
            </div>
          </div>
        </div>
        <p className="mt-2 max-w-full text-center text-[10px] leading-4 text-muted-foreground">
          {label} · {width} × {height} CSS px
        </p>
      </div>
    </div>
  );
}
