import type { SmtpProvider } from "../contracts/smtp.ts";

export type SmtpPreset = {
  provider: SmtpProvider;
  label: string;
  host: string;
  port: number;
  encryption: "ssl" | "starttls" | "none";
};

export const SMTP_PRESETS: Record<SmtpProvider, SmtpPreset> = {
  qq: {
    provider: "qq",
    label: "QQ 邮箱",
    host: "smtp.qq.com",
    port: 465,
    encryption: "ssl",
  },
  "163": {
    provider: "163",
    label: "网易 163 邮箱",
    host: "smtp.163.com",
    port: 465,
    encryption: "ssl",
  },
  "126": {
    provider: "126",
    label: "网易 126 邮箱",
    host: "smtp.126.com",
    port: 465,
    encryption: "ssl",
  },
  exmail: {
    provider: "exmail",
    label: "腾讯企业邮箱",
    host: "smtp.exmail.qq.com",
    port: 465,
    encryption: "ssl",
  },
};

export function smtpPreset(provider: SmtpProvider): SmtpPreset {
  return SMTP_PRESETS[provider];
}
export function smtpAddress(value: string): string | null {
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) return null;
  const address = value.trim();
  if (address.length > 254) return null;
  const [local, domain, extra] = address.split("@");
  if (!domain || extra !== undefined || local.length > 64 ||
    !/^[a-z0-9_!#$%&'*+\/=?^`{|}~-]+(?:\.[a-z0-9_!#$%&'*+\/=?^`{|}~-]+)*$/iu.test(local) ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/iu.test(domain)) return null;
  return address;
}
