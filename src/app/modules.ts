import type { ComponentType } from "react";
import RecruitmentPage from "../modules/recruitment/RecruitmentPage";
import type { ModuleId } from "./module-meta";

export const MODULE_COMPONENTS: Record<ModuleId, ComponentType> = {
  recruitment: RecruitmentPage,
};
