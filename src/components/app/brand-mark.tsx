import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-black/15",
        className,
      )}
      aria-hidden="true"
    >
      <span className="absolute -left-2 -top-2 size-5 rounded-full border border-current/30" />
      <span className="absolute -bottom-2 -right-2 size-4 rounded-full border border-current/25" />
      <span className="relative pl-[0.06em] text-[11px] font-black leading-none tracking-[0.06em]">
        CF
      </span>
    </span>
  );
}
