# CampusFlow 共享 API 与领域契约

- 本文记录共享领域契约。当前可直接调用的招新开放接口以本机 `/api/open/v1/openapi.json` 为准。
- 适用范围：单组织；无多租户、无 `orgId`
- 数据库迁移：仅设计文件 `db/schema/0001_shared.sql`，**未执行**

## 1. 路径与响应

业务路径统一为 `/api/v1/...`。

网关部署可使用下列路径前缀：

```text
/api/v1/health
/functions/v1/app/api/v1/health
/functions/v1/app-d<32-hex>/api/v1/health
```

成功响应：

```json
{ "data": { "...": "..." } }
```

错误响应：

```json
{
  "error": "invalid_request",
  "message": "请求参数不完整或格式不正确。",
  "details": { "field": "name", "reason": "string_required" }
}
```

所有响应带 `cache-control: no-store`。

## 2. 错误码

| 错误码 | HTTP | 说明 |
| --- | --- | --- |
| `invalid_request` | 400 | 参数缺失或格式错误 |
| `invalid_json` | 400 | 请求体不是有效 JSON |
| `unsupported_media_type` | 415 | 非 `application/json` |
| `payload_too_large` | 413 | 超出请求体上限 |
| `unauthorized` | 401 | 未建立有效身份 |
| `forbidden` | 403 | 无权限或 token 不匹配 |
| `not_found` | 404 | 资源不存在 |
| `method_not_allowed` | 405 | 方法不支持，返回 `Allow` |
| `conflict` | 409 | 状态冲突 |
| `onboarding_not_found` | 404 | 入组邀请不存在 |
| `onboarding_expired` | 410 | 入组邀请过期 |
| `onboarding_revoked` | 410 | 入组邀请撤销 |
| `onboarding_incomplete` | 409 | 入组步骤未完成 |
| `member_not_active` | 403 | 身份有效但成员未激活 |
| `admin_already_initialized` | 409 | 管理员已完成初始化 |
| `invalid_bootstrap_token` | 403 | 初始化令牌无效 |
| `bootstrap_not_configured` | 503 | 初始化未配置 |
| `rate_limited` | 429 | 敏感认证操作触发限流 |
| `internal_error` | 500 | 未分类服务错误 |
| `service_unavailable` | 503 | 依赖服务不可用 |

## 3. 身份模型

身份解析由应用自己的 `ActorResolver` 完成，普通成员和候选人不依赖托管平台账号：

```ts
type Actor =
  | { kind: "member"; memberId: string; role: Role; memberStatus: MemberStatus }
  | { kind: "candidate"; applicantId: string; onboardingInviteId: string }
  | { kind: "demo"; demoSessionId: string }
  | { kind: "anonymous" };
```

- `member`：通过应用会话 token 认证；支持 `Authorization: Bearer`、`x-session-token` 或 `campusflow_session` Cookie。
- `candidate`：通过专属 onboarding token 认证；支持 `x-onboarding-token`、`Authorization: Bearer` 或 `campusflow_onboarding` Cookie。
- `demo`：评委演示会话，后续接入演示数据隔离。
- `anonymous`：未登录。

会话与 onboarding token 只存 SHA-256 哈希；原始 token 不落库。会话过期、撤销、邀请过期/撤销/完成都不会再产生有效 Actor。

普通成员会话通过 `issueMemberSession` 签发；管理员初始化演示了同一会话模型。具体登录/激活入口将在 onboarding API 批次接入，本批不提供业务登录页面。

会话生命周期：

- 创建：`issueMemberSession` 每次生成新的随机 token，不复用旧会话（避免会话固定）。
- 过期：解析器拒绝已过期会话。
- 撤销：成员可通过 `POST /api/v1/auth/logout` 撤销当前会话；管理员可通过 `POST /api/v1/members/:id/sessions/revoke` 撤销指定成员的全部会话。
- 退出：撤销当前会话并记录 `auth.logout` 审计事件。
- Cookie 写入使用 `HttpOnly; Secure; SameSite=Strict`；Cookie 认证的写操作要求同源 `Origin`，否则 403。
- 管理员初始化按客户端键做内存限流；生产需在网关或分布式限流器实现。

角色保护要求成员 `status = active`；`pending_onboarding` 访问正式权限接口返回 `member_not_active`。因此，`account_activated` 与 `completed` 之间不存在可使用正式成员权限的半完成状态。

## 4. 已实现的 Foundation 接口

| 方法 | 路径 | 权限 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | 公开 | 服务健康信息 |
| POST | `/api/v1/bootstrap/admin` | 一次性 bootstrap token | 首个管理员 + 一次性会话 token |
| POST | `/api/v1/auth/logout` | 成员会话 | 撤销当前会话 |
| POST | `/api/v1/members/:id/sessions/revoke` | `members.manage` | 撤销成员全部会话 |
| GET | `/api/v1/audit-events` | `audit.read` | 审计事件分页 |
| GET | `/api/v1/me` | 任意成员 Actor | 当前成员 |
| GET | `/api/v1/members` | `members.read` | 成员列表（含状态） |
| GET | `/api/v1/departments` | `directory.read` | 部门列表 |
| GET | `/api/v1/terms` | `directory.read` | 学期列表 |
| GET | `/api/v1/onboarding/invites/:id` | `onboarding.read` 或本人候选人 | 入组进度（不含 token hash） |
| GET | `/api/v1/members/:id/availability?termId=` | `members.availability.read` | FREE/BUSY/UNKNOWN，无课程详情 |

### 一次性管理员初始化

`POST /api/v1/bootstrap/admin`

```json
{
  "token": "由服务端配置的一次性初始化令牌",
  "name": "管理员姓名",
  "email": "admin@example.test"
}
```

- 只有系统中尚无 `admin` 成员时才能成功。
- 令牌与平台 Secret 中的值进行恒定时间比较。
- 成功返回首个管理员与**只返回一次**的会话 token；token 只存哈希。
- 重复调用返回 `admin_already_initialized`。
- 未配置令牌返回 `bootstrap_not_configured`。
- 生产适配器仍需在网关层增加限频；内存仓储只用于本地测试。

### 候选人的资源级权限

候选人访问 `/api/v1/onboarding/invites/:id` 时，服务端同时校验：

```text
actor.onboardingInviteId === invite.id
actor.applicantId === invite.applicantId
```

任一不匹配返回 403。候选人 token 不能访问成员 API；成员角色访问 onboarding 还需要 `onboarding.read` 权限。

### 角色权限矩阵

完整矩阵在 `shared/auth/permissions.ts`。关键权限：

| 权限 | admin | recruiter | scheduler | member |
| --- | --- | --- | --- | --- |
| `members.read` | ✅ | ✅ | ✅ | — |
| `members.manage` | ✅ | — | — | — |
| `directory.read` | ✅ | ✅ | ✅ | ✅ |
| `members.availability.read` | ✅ | — | ✅ | — |
| `onboarding.read` | ✅ | ✅ | — | — |
| `onboarding.manage` | ✅ | ✅ | — | — |
| `recruitment.read / manage / send` | ✅ | ✅ | — | — |
| `scheduling.read / manage` | ✅ | — | ✅ | — |
| `email_accounts.manage` | ✅ | — | — | — |
| `email_templates.manage` | ✅ | ✅ | — | — |
| `audit.read` | ✅ | — | — | — |
| `published_schedule.read` | ✅ | ✅ | ✅ | ✅ |
| `self.read / self.timetable.manage` | ✅ | ✅ | ✅ | ✅ |

角色校验还要求成员 `status = active`；`pending_onboarding` 即使拥有角色也会被拒绝。

### 课程隐私

- 成员课程名称、教师、教室只允许本人查看。
- 管理员/排班负责人只得到 `ManagerAvailabilityView`：
  - `memberId`
  - `memberName`
  - `confirmed`
  - `slots: { weekday, startMinute, endMinute, state: "FREE" | "BUSY" | "UNKNOWN" }[]`
- 未确认课表时返回 `UNKNOWN`。
- 响应中不包含课程 ID、名称、教师或教室。

## 5. 入组状态机

```text
invited
  → accepted
  → profile_completed
  → timetable_confirmed
  → account_activated
  → completed
```

任意进行中状态可转为 `expired` 或 `revoked`；`completed / expired / revoked` 为终态。

规则：

- 不允许跳步。
- `timetable_confirmed` 要求 `profileCompletedAt`。
- `account_activated` 要求 `timetableConfirmedAt`。
- `completed` 要求 `accountActivatedAt` 以及完整资料、课表确认时间。
- 完成入组后才允许 `members.status: pending_onboarding → active`。
- `pending_onboarding` 成员不进入正式排班候选池；只有 `active` 成员可排班。
- RSVP 只表示面试出席，不改变候选人状态；录用也不等于正式成员。

### 邀请 Token 生命周期

- 邀请 token 使用密码学安全随机值，服务端只存哈希；每个邀请独立。
- 邀请有 `expires_at`、`revoked_at`、`version`。
- `GET /api/v1/onboarding/invites/:id` 对候选人同时校验：token 解析出的邀请、`applicantId`、邀请状态、撤销状态和有效期。
- 仅打开链接不会修改状态或消耗 token。
- 重新生成：替换 `token_hash` 并递增 `version`，旧 token 立即失效；不改变已完成/已撤销的终态。
- 撤销：状态变为 `revoked`，递增 `version`；旧 token 失效。
- 已完成：旧 token 永久失效，不能重复注册或重复激活。
- 异步发送/邮件结果应用前必须校验当前 `version` 与 `status`；旧版本的结果不能把已撤销邀请恢复为有效。
- 生产数据库需用条件更新或事务保证版本条件写入；内存仓储只模拟该约束。

### 审计事件

已定义并通过代码记录的审计动作：

- `admin.bootstrap`
- `auth.login`（当前由管理员初始化会话触发）
- `auth.logout`
- `auth.session_revoked`
- `member.activated`
- `security.access_denied`

契约中已预留、供后续业务模块记录的动作：

- `member.role_changed`
- `member.deactivated`
- `invitation.created`
- `invitation.revoked`
- `invitation.regenerated`
- `onboarding.transitioned`

审计事件包含 actor 类型/ID、action、target 类型/ID、result、时间和脱敏 metadata。钥匙串式敏感字段（token、password、cookie、authorization、email、phone、student id）会在写入前移除。管理员通过 `GET /api/v1/audit-events` 分页查看；其他角色 403。

### 激活事务边界

- `activateMemberFromOnboarding` 只接受 `completed` 且所有时间戳齐全的邀请。
- 成员必须仍是 `pending_onboarding`；`active` 时按幂等成功处理，其他状态拒绝。
- 仓储接口 `commitOnboardingActivation` 是唯一的提交点。
- 内存仓储先完成全部校验再修改，因此前置条件失败不会留下部分变更。
- **当前尚未具备生产级数据库事务**：生产适配器必须使用数据库事务或一条能同时更新邀请与成员的条件更新；本批不宣称已完成生产级原子性保证。
- `account_activated → completed` 之间成员始终是 `pending_onboarding`，`requirePermission` 会返回 `member_not_active`，不存在可使用正式成员权限的半完成状态。

## 6. 成员与候选人状态

```ts
type MemberStatus = "pending_onboarding" | "active" | "inactive";
type ApplicantStatus = "new" | "screening" | "interview" | "accepted" | "rejected";
type OnboardingStatus =
  | "invited" | "accepted" | "profile_completed" | "timetable_confirmed"
  | "account_activated" | "completed" | "expired" | "revoked";
```

- 候选人 `accepted` 才能创建入组邀请。
- 录用 ≠ 正式成员；完成入组才激活。
- `pending_onboarding` 不进入排班池。
- 管理员只能看到 FREE/BUSY/UNKNOWN。

## 7. 邮件、邀请与排班契约

### 邮件

- `EmailTransport`：`mock / smtp_gateway / http_api`；当前只实现 `MockEmailTransport`。
- `EmailAccount` / `EmailAccountInput`：发件账号元数据与 `hasSecret`，不保存明文凭据。
- `EmailEditorDocument` / `EmailBlock`：结构化邮件模板 JSON；支持标题、正文、图片、Logo、按钮、分隔线、页脚、间距。
- `shared/email/template-renderer.ts`：结构化 JSON → email-safe HTML + plain text；变量替换、HTML 转义、URL 白名单、缺失变量报告。
- `EmailPreflightResult`、`EmailBatch`、`EmailDelivery`：
  - 批次 mode：`dry_run / send`；
  - delivery 状态：`pending / sending / simulated / sent / failed / cancelled / skipped`；
  - 字段包含 `sourceVersion`、`providerMessageId`、`attemptCount`、`retryable`、`errorCode`；
  - 创建批次支持 `idempotencyKey`；
  - `sendBatch` / `retryBatch` 前重新调用资格/版本检查；
  - `retryBatch` 只处理 `failed && retryable`，不会重发 `sent/simulated`；
  - `cancelBatch` 只取消 `pending`。
- `TestInboxTicket`：独立 test-inbox 契约；`testSendTemplate` 不创建正式批次/投递记录，不消耗正式邀请 token。
- **当前只提供共享服务与 Mock，不提供 HTTP 邮件路由或 UI。**

### 邀请生命周期

- `InterviewInvitation` 与 `OnboardingInvite` 是独立记录：
  - 面试邀请状态：`draft / ready / sent / revoked / expired`；
  - RSVP 状态：`pending / confirmed / reschedule_requested / cancelled`；
  - 入组状态保持原有 `invited → accepted → … → completed`。
- 面试邀请具有 `version`、哈希 token、有效期、撤销、Token 轮换、发送版本校验。
- `markInterviewInvitationSent`、`revokeInterviewInvitation`、`rotateInterviewInvitationToken`、`respondToInterviewInvitation` 均已实现并测试。
- 异步发送结果必须通过 `canApplyAsyncInterviewResult` 校验当前版本和状态，已撤销邀请不会被重新激活。

### 候选人专属邀请（本地服务）

- 候选人使用 `/#/invite/rsvp?token=…`。服务端在 `GET /api/v1/rsvp/:token` 返回模板快照、候选人渲染上下文、截止时间、`rsvpStatus`、`respondedAt` 和 `version`。读取不消费邀请。
- `POST /api/v1/rsvp/:token` 接收 JSON `{response, version}`。确认 `attending → confirmed`，婉拒 `not_attending → cancelled`。婉拒属于出席答复，保留邀请有效性及候选人的原录用/入组状态。
- 服务端在同一事务里按当前 token 哈希查找、判断截止与撤销状态并写入。截止前允许更改，重复相同答复保留原答复时间和版本。对过时版本的相反答复返回 409，请重新读取。成功响应使用 `{data: …}`。
- 未知或换发前的 token 返回 404；当前 token 在撤销或服务端时间达到 `expiresAt` 后返回 410。失效的 GET/POST 均不返回候选人或模板信息。换发只替换凭据，既有答复保留。
- 发链、换发与撤销入口仅供显式本机演示使用，持久层为比赛目录外的 SQLite。服务端只存 token 哈希。静态生产构建不附带该数据库或演示管理接口。

### 课表与排班

- `TimetableReadiness`：`UNINITIALIZED / UNVERIFIED / READY`。
- `Course.weeks: number[]`，支持全周、单周、双周和自定义周次；`weeksForPattern` 已实现。
- `CourseOccurrenceException`：指定日期的课程取消或修改覆盖。
- `ManagerAvailabilityView` 增加 readiness；管理员仍只得到 FREE/BUSY/UNKNOWN，不含课程详情。
- `ScheduleConflict` 增加 `severity: BLOCKING / WARNING`。
- `PublishedScheduleSnapshot` 与 `ScheduleVersion.snapshot`：发布版本快照契约。
- 本轮只补类型、契约和少量纯函数；未实现完整课表解析、自动排班或发布算法。

## 8. 数据模型

`db/schema/0001_shared.sql` 覆盖：

- `app_settings`
- `departments`
- `terms`
- `members`
- `member_sessions`
- `recruitment_cycles`
- `applicants`
- `timetable_confirmations`
- `onboarding_invites`
- `onboarding_events`
- `demo_sessions`
- `audit_logs`

没有 `org_id` 或多租户字段。SQL 仅评审用，未应用。

## 9. 请求校验

- 默认 JSON 请求体上限 64 KiB。
- 只接受对象 JSON。
- 字符串去除首尾空白，限制长度。
- UUID、整数范围、枚举、数组长度均有显式校验。
- 分页默认 `limit=20`，最大 `limit=100`，`offset >= 0`。

## 10. 共享契约边界

- 课表和排班条目是领域设计契约，当前招新工作台未公开对应业务路由。
- 本地招新已提供 SQLite、候选人和答复管理、模拟发信及经验证账号的 SMTP 投递。运行方式见 [项目说明](../../README.md)。
