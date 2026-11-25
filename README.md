# CampusFlow

[在线体验 CampusFlow](https://campusflow-review-demo-7k790m5nvqf.qoder.zone/)

面向高校学生组织的招新工作台。支持模板设计、候选人管理、跨设备专属邀请、真实邮件投递和 Open API。

## 本地启动

下载或克隆 [GitHub 仓库](https://github.com/Xiao-gangan/campusflow-app)，进入项目目录。要求 Node `^22.13.0 || >=24.0.0`。

```sh
npm ci && npm run dev
```

打开 `http://127.0.0.1:5173/`。一个进程提供 SQLite 持久化、招新管理、真实 QQ/163/126/腾讯企业邮箱 SMTP 发信、多模型 AI 和 Open API。`npm start` 与 `npm run dev:rsvp` 也可启动同一服务。

| 可选环境变量 | 用途 |
| --- | --- |
| `CAMPUSFLOW_HOST` | 监听地址，默认 `127.0.0.1`。局域网邀请可设为 `0.0.0.0`。 |
| `PORT` | HTTP 端口，默认 `5173`。 |
| `CAMPUSFLOW_PUBLIC_URL` | 对收件人可达的 HTTP 或 HTTPS 源地址，用于生成邀请与回传链接。未设置时使用本机访问地址。 |
| `CAMPUSFLOW_RSVP_DB` | SQLite 路径，默认 `~/.campusflow/demo/rsvp.sqlite`。 |

例如 `CAMPUSFLOW_HOST=0.0.0.0 PORT=5173 CAMPUSFLOW_PUBLIC_URL=http://192.168.1.20:5173 npm run dev` 可为同一局域网签发邀请。请把示例 IP 换成主机地址。管理和 Agent API 在服务主机使用。对外分享时，确保候选人可以访问设定地址，并用 HTTPS 反向代理面向候选人的页面与接口。

## 公网评委演示

生产构建打开即进入浏览器演示，初始包含 8 套精选模板、3 个面试轮次和合成候选人。可体验模板编辑、AI 模拟设计、名单和面试管理、模拟发信、专属邀请答复及评价。邀请请用同一浏览器配置中的新标签页打开，答复和面试环节会回写管理端。不同浏览器配置的数据相互独立，招新页可重置演示工作区。

发件测试只写入本浏览器的模拟收件箱。开放 API 面板可查看完整规范及管理演示密钥。演示密钥与外部互动配置只能在演示中配置和查看，真实 HTTP 接口及外部回传使用下述本机服务。

## 使用本地工作台

### 邀请函网页的 AI 设计

进入「模板编辑器 → 邀请函网页 → AI 帮我设计」，可生成整页或优化所选组件。首屏、活动信息和出席答复支持单独设计。生成后可查看前后对比，再应用、撤销或将整页保存为 AI 邀请函模板。已保存的邀请函模板可以在本机招新管理页签发。

本地体验时，直接在设计面板勾选「本地演示」。使用真实模型时，从工作台的「AI 配置」配置 DeepSeek、通义千问或 Kimi：三家密钥、模型和默认选择相互独立，邮件与邀请函共用同一份默认模型。每家可保存到当前浏览器、仅当前标签页临时使用、更换或清除，并可发起一个小请求的连接测试。

- DeepSeek：官方 Chat Completions 地址，可选 `deepseek-flash`、`deepseek-v4-pro`，默认 `deepseek-flash`。
- 通义千问（阿里云百炼）：官方 OpenAI 兼容地址，固定可选 `qwen-plus`、`qwen-max`、`qwen-turbo`。
- Kimi：官方 Chat Completions 地址，可选 `kimi-k3.1-pro`、`kimi-k3`、`kimi-k3.1-pro-highspeed`，默认 `kimi-k3.1-pro`；请求使用 `max_completion_tokens` 和 `reasoning_effort: low`，不发送 `temperature` 或 `thinking`。

服务端只接受已注册的厂商 ID 和该厂商标注支持 JSON 输出的固定模型，不接受浏览器传入任意 Base URL，也不会把某家的密钥转发到另一家。

持久配置使用 AES-GCM 加密后写入独立 IndexedDB；master key 通过 IndexedDB `add` 原子初始化，多个标签页并发首次保存时会读取唯一赢家密钥而不是互相覆盖。旧版 `campusflow.ai.deepseek-key.v1` 明文 localStorage 会在读取时尝试迁移：只有新记录写入并解密读回一致后才删除旧项；迁移失败会保留旧项，仍可用于真实调用或改为仅当前标签页临时使用。该措施只降低静态存储泄露风险，不能阻止同源脚本读取运行时密钥。密钥不随模板导出。AI 中间件随本地工作台启动。单独调试时仍可运行 `AI_MOCK=1 npm run ai:server`，独立端口由 `AI_PORT` 设置。

### 发件邮箱设置（本机）

在「邮件发送 → 发件邮箱设置」可添加 QQ、163、126 或腾讯企业邮箱。SMTP 主机、端口和 TLS 方式来自服务端固定预设，浏览器不能提交任意主机。客户端授权凭据使用服务端独立密钥（AES-256-GCM）加密保存，接口只返回 `hasSecret` 和验证状态，不回显凭据；SQLite 与日志不保存明文。

默认可直接测试真实 SMTP。先点「测试连接」验证 TLS 和授权码，再给自己发送一封测试邮件。单封测试可以选用已保存的邮件模板。测试邮件通过后，账号显示在「撰写发送」，与默认的「招新组 · 本机模拟」并列。选中真实账号、逐人预览并确认后才会发送。发件箱按收件人记录投递结果。

- `CAMPUSFLOW_TEST_RECIPIENT` 可选。设置后，仅允许向指定邮箱发单封测试。
- `CAMPUSFLOW_SMTP_MODE=synthetic` 使用离线合成测试，`disabled` 关闭 SMTP，`real` 为默认值。旧的 `CAMPUSFLOW_REAL_MAIL_TEST` 和 `CAMPUSFLOW_REAL_SMTP_TEST` 仍可使用。
- `CAMPUSFLOW_SMTP_KEY` 可选，提供 32 字节 Base64 密钥。未提供时在数据库旁生成 `smtp-credentials.key`（`0600`）。

QQ/163 建议每批不超过 10 封，批次间隔数分钟。发送前请确认候选人的邮箱，以及链接所用地址能从收件人的设备访问。发件箱把 SMTP 接收确认记录为成功，最终收件状态以邮箱服务商为准。

### 候选人出席答复（本机）

运行 `npm run dev` 后，从「招新名单」选择候选人，生成专属邀请链接。也可通过 `/#/recruitment?tab=legacy` 体验单链接示例。

1. 在同一浏览器与端口选择已保存的邀请函网页模板；首次也可点击「保存示例邀请函模板」。跨浏览器的本机图片引用暂不支持，发链时会提示使用可访问的图片 URL。
2. 设置截止时间，点击「生成专属链接」，从「打开候选人邀请函」进入独立候选人页。这里使用模拟候选人林知夏，演示面试安排在截止次日 14:00–14:30（北京时间）。模板在签发时保存快照，活动信息使用该次邀请的时间、地点。
3. 点击「确认参加」，刷新查看已保存答复，再改为「婉拒邀请」并刷新。关闭或换一个浏览器后，使用同一有效链接仍能读回服务端结果。
4. 保留候选人标签页，在发链标签页换发。老标签页再提交或刷新应显示链接失效，新链接可读取既有答复。撤销后，新链接也无法读取或写入。另签发一份短截止的邀请，跨过截止时刻后尝试提交。
5. 正常编辑器的 `/#/invite/preview` 仍为管理员预览。演示组织端的原始链接只在签发/换发时展示，请保留该标签页进行换发、撤销操作。

本机服务仅在显式启动的 `rsvp-demo` 开发模式挂载。默认数据库为 `~/.campusflow/demo/rsvp.sqlite`，可用 `CAMPUSFLOW_RSVP_DB` 指向比赛目录外的独立文件。刷新或重启服务（使用同一数据库）可恢复答复。生成的回环地址仅在本机可用。公开部署需独立后端适配器及受权限保护的管理入口。

本机模板库首次初始化时可获得 4 套邮件与 4 套邀请函精选预设。一面、二面和录取轮次默认绑定对应的邮件和网页。已有库中，原始且未经编辑的预设会沿用原 ID 更新。「模板设计 → 载入精选预设」可补齐缺少的样式，已编辑的预设会保留为独立作品。验收或脚本需要空库时，可用 `CAMPUSFLOW_TEMPLATE_PRESETS=0 npm run dev:rsvp` 启动。

自由 HTML 邀请函可使用安全的行内 Grid、Flex、渐变和现代排版属性。内置插图经 `/presets/` 同源地址加载，随站点一同部署。邮件预设使用表格与行内样式，邀请确认由系统在正文下方挂载。

### 自定义面试环节与 Agent 接入

在「招新管理 → 面试轮次」编辑轮次并添加环节，或载入「校园协作情景快答」直接试玩。候选人使用专属邀请函完成。配置在签发时冻结。Agent 可用 `rounds:read` / `rounds:write` 读取和更新 `customActivities`，用 `recruitment:read` 查看各轮各次结果。完整输入与限制见 `/api/open/v1/openapi.json`。

- **内嵌环节 `sandbox_widget`** 使用可离线运行的单文件 HTML/CSS/JS，宿主验证 iframe 消息来源并保存。调用 `parent.postMessage({ type: "campusflow:activity:progress", progress: 60, progressText: "第 3/5 题", payload: { answers: [] } }, "*")` 更新进度。重载时先监听 `campusflow:activity:restore`，再发送 `{ type: "campusflow:activity:ready" }`，从返回消息的 `saved` 恢复 `progress`、`progressText`、`payload` 和 `revision`。终态使用 `campusflow:activity:submit`。
- **外部环节 `external_app`** 从跳转 URL 的 hash 解析 `cf_activity_token`、`cf_session_url`、`cf_callback_url`，然后可用 `history.replaceState` 从地址栏移除凭证。配置地址自带的 hash 通过 `cf_app_fragment` 保留。`GET cf_session_url` 使用 `Authorization: Bearer <cf_activity_token>`，也可 `POST` JSON `{ "cf_activity_token": "…" }`。会话只返回该候选人的称呼、轮次、当前环节、到期时间和已保存内容。向 `cf_callback_url` `POST` JSON 更新，凭证可放 Bearer 头或正文 `cf_activity_token`。浏览器来源应与配置 URL 同源，使用 `credentials: "omit"`。
- **凭证与重测** 由 CampusFlow 签发。凭证最长有效两小时且受邀请截止约束，服务端验签并核对 SHA-256 记录。重新打开同一外部环节会替换旧凭证并保留进度。邀请撤销或换发后，该邀请的所有旧环节凭证返回 `401`。后台「面试记录」可以单独吊销或重签一个环节。重签保留历史，新一轮由候选人从原有效邀请重新打开。旧版回传凭证需从邀请函重新打开获取新版凭证。
- **声明式结果** `in_progress` 可多次更新，`completed` / `needs_review` 锁定成绩，重复回传返回首次终态。终态 `summary` 必填，省略 `status` 的旧 `{ score, summary, payload }` 格式按 `completed` 处理。原生卡片支持 `badge`、`score` / `maxScore`、`scoreLabel` / `scoreUnit`、`metrics`（8 项）、`qa`（40 项）、`tags`（10 个）和折叠的 `payload`（JSON 对象 ≤16 KiB）。

## 验证命令

```sh
npm run typecheck     # TypeScript 类型检查
npm run test          # Node 内置测试运行器，自动发现 *.test.mjs
npm run check:secrets # 扫描常见密钥模式与被忽略的 .env 文件
npm run check         # typecheck + test + 密钥扫描
npm run build         # 生产构建，输出到 dist/
```

新增测试文件放在 `tests/` 下并命名为 `*.test.mjs`，`npm run test` 会自动发现，不需要手动维护文件列表。

## 工程结构

```text
src/
  app/                 # 路由、模块元数据、模块组件映射
  components/app/      # 应用壳组件
  components/ui/       # 共享 UI 基础组件
  modules/recruitment/ # 候选人、模拟发信、发件邮箱与专属邀请链接
  modules/designer/    # 邮件/邀请函编辑器、个性字段、图片素材与富文本
  modules/invite/      # 邀请函页面、管理员预览与候选人答复
  pages/               # 工作台首页
shared/
  api/                 # /api/v1 内核、Actor、校验、错误 envelope
  auth/                # ActorResolver、RBAC、一次性管理员初始化
  contracts/           # API、成员、入组、面试邀请、邮箱、排班、演示契约
  data/                # 仓储接口与内存实现（测试用，含邮件仓储）
  domain/              # 入组状态机、面试邀请生命周期、周次/readiness、忙闲脱敏
  design/              # 模块注册表、个性化字段、富文本兼容与默认主题
  email/               # 结构化模板/富文本渲染、Mock Provider、邮件服务
  invite/               # 邀请函渲染模型、预设、富文本与预览草稿
  security/            # token、哈希、恒定时间比较、审计脱敏、限流
  services/            # 成员激活事务服务
db/schema/             # 共享数据库设计（未应用）
tests/                 # 自动发现的纯函数与 API 契约测试
scripts/               # 构建、Node 版本检查、密钥扫描
docs/planning/         # 已确认的总体规划
docs/contracts/        # API/状态机接口契约
```

## 共享 API 基础

- 业务路径：`/api/v1/...`；同时接受 Qoder Sites 的 `/functions/v1/app/api/v1/...` 前缀。
- 成功：`{ "data": ... }`。
- 错误：`{ "error": "code", "message": "...", "details"?: ... }`。
- 身份通过注入的 `ActorResolver` 提供，支持成员、候选人 token 和演示会话，不要求评委拥有 Qoder 账号。
- 详细契约见 [docs/contracts/api-contract.md](docs/contracts/api-contract.md)。
- `db/schema/0001_shared.sql` 仅为设计文件，未执行迁移。

## 安全约定

- 不提交真实密钥、邮箱授权码、SMTP 密码或学生个人信息。
- `.env*` 默认被忽略，仅允许提交示例文件。
- CI 会运行密钥扫描；发现疑似密钥时失败。
- 会话与 onboarding token 只保存 SHA-256 哈希；原始 token 不落库。
- 管理员初始化 token 通过服务端配置注入，不写入仓库；成功后不可重复初始化。
- 审计 metadata 在写入前移除 token、密码、Cookie、邮箱、电话、学号等敏感字段。
- 限流当前为内存实现；生产需在网关或分布式限流器实现。
- 公网演示使用模拟发信。本机真实投递要求通过单封测试并显式确认。
- 生产数据库事务、唯一约束与初始化竞态保护尚未接入，留待数据库集成验收。

## 开放 API v1

通过 `npm run dev:rsvp` 启动本机服务，从桌面侧边栏或手机顶栏进入「开放 API」。创建所需权限的 Key 后，将一次性显示的值保存到 Agent 的环境变量 `CAMPUSFLOW_API_KEY`。列表仅展示掩码和权限，撤销后重新请求会返回 401。

复制「OpenAPI 地址」可读取无需登录的 `/api/open/v1/openapi.json`。规范包含邮件积木和邀请函自由 HTML 的请求样例。终端和本机 Agent 可以直接调用。

```sh
curl -fsS -H "Authorization: Bearer $CAMPUSFLOW_API_KEY" \
  'http://127.0.0.1:5173/api/open/v1/templates?target=email'
```

- `templates:read` 读取模板及预览渲染。`POST /templates/{id}/render` 使用 `{}` 可预览示例变量，也可提交 `variables`。按 `candidateId` 取值同时需要 `recruitment:read`，渲染只返回内容和诊断。
- `templates:write` 创建、完整替换或删除模板。请求使用 `{ name, document }`，`document` 遵守设计器的 DesignDocument v1 结构。专属链接变量在用作 URL 时需占据整个地址，自由 HTML 会经过安全清洗。
- `recruitment:read` 读取候选人名单和最近答复摘要。Key 的权限端点覆盖模板和名单。

演示服务采用回环地址，适用于同一设备上的 Agent 或脚本。托管的 Agent 运行于其他网络，访问该服务需要独立的安全接入方式。浏览器进入设计总览、打开模板库或刷新时会拉取变化。已保存的本机模板会尝试导入，服务暂不可用时仍可读取此前的模板并在当前浏览器保存，待恢复后同步。上传的本机图片继续由原浏览器管理。

## 面试轮次与候选人环节

在本机招新管理的「面试轮次」编辑轮次、绑定默认模板、配置简历问卷或校园协作性格测评。名单可以按当前轮次筛选，勾选后推进到任一可用轮次。发出的专属邀请固定当时的题目配置，旧链接和历史提交按原轮次保留。归档会关闭新签发和推进，已发链接仍按各自的期限和撤销状态处理。

候选人可保存问卷草稿与测评进度，刷新后继续。后台「面试记录」查看提交，轮次列表导出问卷 CSV。团队 MBTI 分布来自当前筛选结果，仅供协作破冰。题目与画像内置团队原创的 88 题校园协作性格测评题库与 16 型画像，支持完整版/精简版切换与自定义编辑。

Open API 的 `rounds:read` 可查询轮次和题目，`rounds:write` 可创建或更新轮次。现有 `recruitment:read` 同时允许查询已提交问卷、测评结果和 RSVP 历史，按需授予可信 Agent。候选人草稿和专属链接只留在对应的候选人或本机管理流程里。
