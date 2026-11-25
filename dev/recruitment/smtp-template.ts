import { sampleVariableValues } from "../../shared/design/variables.ts";
import { renderDesignEmail } from "../../shared/email/design-renderer.ts";
import type { AgentStore } from "../open-api/store.ts";
import { templateInput } from "../open-api/templates.ts";
import { RsvpError } from "../rsvp/error.ts";

export function smtpTestTemplateRequest(body: Record<string, unknown>) {
  if (body.templateId === undefined) return undefined;
  if (typeof body.templateId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(body.templateId))
    throw new RsvpError(400, "邮件模板标识无效，请重新选择。");
  if (body.organizationName !== undefined && (typeof body.organizationName !== "string" || body.organizationName.length > 160))
    throw new RsvpError(400, "组织名称格式无效。");
  return { id: body.templateId, organizationName: body.organizationName?.trim() };
}

export function renderSmtpTestTemplate(store: AgentStore, { id, organizationName }: NonNullable<ReturnType<typeof smtpTestTemplateRequest>>) {
  const template = store.requireTemplate(id);
  if (template.target !== "email" || template.document.target !== "email")
    throw new RsvpError(400, "测试邮件只支持已保存的邮件模板。");
  const { document } = templateInput({ name: template.name, document: template.document }, true);
  const values = sampleVariableValues();
  if (organizationName) values.organization_name = organizationName;
  const rendered = renderDesignEmail(document, values);
  const subject = rendered.subject.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu, " ").trim() || "CampusFlow 邮件模板测试";
  return { subject, bodyText: rendered.text, bodyHtml: rendered.html };
}
