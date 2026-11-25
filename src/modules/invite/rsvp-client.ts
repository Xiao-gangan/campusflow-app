import { demoFetch } from "../browser-demo/request.ts";
export class InviteRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function inviteRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await demoFetch(url, {
    ...options,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const json = response.headers
    .get("content-type")
    ?.includes("application/json");
  if (!response.ok) {
    const error = json ? await response.json().catch(() => null) : null;
    const fallback =
      response.status === 404 || response.status === 410
        ? "邀请链接已失效，请联系组织者。"
        : "暂时无法读取邀请。";
    throw new InviteRequestError(response.status, error?.message || fallback);
  }
  if (!json)
    throw new InviteRequestError(503, "暂时无法连接邀请服务，请稍后重试。");
  const body = await response.json();
  return body.data as T;
}
