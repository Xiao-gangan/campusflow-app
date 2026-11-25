import {
  AlignLeft,
  CalendarClock,
  CheckSquare,
  Heading,
  Image as ImageIcon,
  LayoutList,
  Minus,
  MousePointerClick,
  MoveVertical,
  PanelBottom,
  PanelTop,
  Plus,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import type {
  DesignBlockType,
  DesignTarget,
  DesignTheme,
} from "@/shared/contracts/design";
import { modulesForTarget } from "@/shared/design/modules";
import { StyleVariantPicker } from "./StyleVariantPicker";

const MODULE_ICONS: Record<DesignBlockType, LucideIcon> = {
  logo: Stamp,
  heading: Heading,
  text: AlignLeft,
  image: ImageIcon,
  info_card: LayoutList,
  button: MousePointerClick,
  divider: Minus,
  spacer: MoveVertical,
  footer: PanelBottom,
  hero: PanelTop,
  event_info: CalendarClock,
  rsvp: CheckSquare,
};

type ModulePaletteProps = {
  target: DesignTarget;
  theme: DesignTheme;
  onAdd: (type: DesignBlockType, variant?: string) => void;
};

export function ModulePalette({
  target,
  theme,
  onAdd,
}: ModulePaletteProps) {
  const modules = modulesForTarget(target);
  const categories = [...new Set(modules.map((module) => module.category))];

  return (
    <section className="rounded-[24px] border border-border/70 bg-card/80 p-3.5">
      <h2 className="px-1.5 text-sm font-semibold">模块库</h2>

      <div className="mt-3 space-y-4">
        {categories.map((category) => (
          <div key={category}>
            <p className="mb-1.5 px-1.5 text-[11px] font-medium tracking-[0.12em] text-muted-foreground">
              {category}
            </p>
            <div className="space-y-0.5">
              {modules
                .filter((module) => module.category === category)
                .map((module) => {
                  const Icon = MODULE_ICONS[module.type];
                  return (
                    <div
                      key={module.type}
                      className="group flex items-center gap-0.5 rounded-xl px-1 py-0.5 transition-colors hover:bg-accent/65"
                    >
                      <button
                        type="button"
                        onClick={() => onAdd(module.type)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <Icon
                          className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                          {module.label}
                        </span>
                        <Plus
                          className="size-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-all group-hover:text-primary group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      </button>
                      <StyleVariantPicker
                        compact
                        module={module.type}
                        value="style:plain"
                        theme={theme}
                        onChange={(next) => onAdd(module.type, next)}
                        compactLabel={`选择样式并添加${module.label}`}
                        side="right"
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
