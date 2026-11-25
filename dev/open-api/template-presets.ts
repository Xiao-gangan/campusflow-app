import { featuredInterviewPresets, featuredOfferPresets, offerRoundTemplates, presetRoundTemplates } from "../../shared/design/featured-templates.ts";
import { templateInput } from "./templates.ts";

export { offerRoundTemplates, presetRoundTemplates };

export function savedTemplatePresets() {
  return featuredInterviewPresets().map(({ id, name, document }) => ({ id, ...templateInput({ name, document }) }));
}
export function savedOfferPresets() {
  return featuredOfferPresets().map(({ id, name, document }) => ({ id, ...templateInput({ name, document }) }));
}
