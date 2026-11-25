import type { AppRoute } from "./navigation";

export type ModuleId = "recruitment";
export type ModuleIcon = "mail";

export type ModuleMeta = {
  id: ModuleId;
  name: string;
  description: string;
  path: Extract<AppRoute, "/recruitment">;
  eyebrow: string;
  icon: ModuleIcon;
};

export const MODULE_LIST: ModuleMeta[] = [
  {
    id: "recruitment",
    name: "招新管理",
    description:
      "管理候选人名单、预览并模拟发送面试邮件、查看出席答复。",
    path: "/recruitment",
    eyebrow: "招新与邮件",
    icon: "mail",
  },
];

export function getModuleByPath(path: AppRoute): ModuleMeta | undefined {
  return MODULE_LIST.find((module) => module.path === path);
}

export function getModuleById(id: ModuleId): ModuleMeta | undefined {
  return MODULE_LIST.find((module) => module.id === id);
}
