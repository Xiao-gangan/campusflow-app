export const API_PREFIX = "/api/v1";

export const API_METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
export type ApiMethod = (typeof API_METHODS)[number];

export const API_ERROR_CODES = [
  "invalid_request",
  "invalid_json",
  "unsupported_media_type",
  "payload_too_large",
  "unauthorized",
  "forbidden",
  "not_found",
  "method_not_allowed",
  "conflict",
  "onboarding_not_found",
  "onboarding_expired",
  "onboarding_revoked",
  "onboarding_incomplete",
  "member_not_active",
  "admin_already_initialized",
  "invalid_bootstrap_token",
  "bootstrap_not_configured",
  "rate_limited",
  "internal_error",
  "service_unavailable",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  invalid_json: 400,
  unsupported_media_type: 415,
  payload_too_large: 413,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  onboarding_not_found: 404,
  onboarding_expired: 410,
  onboarding_revoked: 410,
  onboarding_incomplete: 409,
  member_not_active: 403,
  admin_already_initialized: 409,
  invalid_bootstrap_token: 403,
  bootstrap_not_configured: 503,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
};

export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  invalid_request: "请求参数不完整或格式不正确。",
  invalid_json: "请求体不是有效的 JSON。",
  unsupported_media_type: "请求体必须是 application/json。",
  payload_too_large: "请求体超过允许大小。",
  unauthorized: "需要登录后继续。",
  forbidden: "当前账号无权执行此操作。",
  not_found: "请求的资源不存在。",
  method_not_allowed: "请求方法不被支持。",
  conflict: "操作与当前状态冲突。",
  onboarding_not_found: "入组邀请不存在或已失效。",
  onboarding_expired: "入组邀请已过期。",
  onboarding_revoked: "入组邀请已被撤销。",
  onboarding_incomplete: "入组步骤尚未完成。",
  member_not_active: "成员尚未激活，不能进入正式流程。",
  admin_already_initialized: "管理员已完成初始化，不能重复执行。",
  invalid_bootstrap_token: "初始化令牌无效。",
  bootstrap_not_configured: "管理员初始化尚未配置。",
  rate_limited: "请求过于频繁，请稍后重试。",
  internal_error: "服务暂时不可用，请稍后重试。",
  service_unavailable: "依赖服务暂不可用，请稍后重试。",
};

export type ApiSuccess<T> = {
  data: T;
};

export type ApiErrorBody = {
  error: ApiErrorCode;
  message: string;
  details?: unknown;
};

export type PaginationQuery = {
  limit: number;
  offset: number;
};

export type Paginated<T> = {
  items: T[];
  total: number | null;
  nextOffset: number | null;
};
