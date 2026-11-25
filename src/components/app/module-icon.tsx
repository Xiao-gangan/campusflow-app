import { Mail } from "lucide-react";
import type { ModuleIcon as ModuleIconName } from "../../app/module-meta";
import { cn } from "@/lib/utils";

const ICONS = {
  mail: Mail,
} as const;

export function ModuleIcon({
  name,
  className,
}: {
  name: ModuleIconName;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon className={cn("size-5", className)} aria-hidden="true" />;
}
