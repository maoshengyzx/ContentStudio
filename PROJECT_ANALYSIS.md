# AiToEarn 项目深度分析（二开参考）

> 本文档覆盖项目完整架构、数据模型、核心业务流程、技术关键点、变现机制，面向二开决策者。

---

## 目录

1. [架构总览](#1-架构总览)
2. [配置系统](#2-配置系统)
3. [认证系统](#3-认证系统)
4. [数据模型](#4-数据模型)
5. [核心业务链路](#5-核心业务链路)
6. [AI Agent 系统](#6-ai-agent-系统)
7. [MCP 协议实现](#7-mcp-协议实现)
8. [队列系统](#8-队列系统)
9. [前端架构](#9-前端架构)
10. [Electron 桌面端](#10-electron-桌面端)
11. [变现系统分析](#11-变现系统分析)
12. [二开建议](#12-二开建议)

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                       用户接入层                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  Web 前端     │  │  Electron    │  │  MCP / SSE / OpenClaw │  │
│  │  Next.js 14   │  │  哎哟赚桌面   │  │  第三方 AI 工具集成    │  │
│  │  :6060        │  │              │  │                      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬──────────┘   │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │ Next.js rewrites│                      │
          │ /api/* → :3002  │                      │
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      后端服务层                                  │
│                                                                 │
│  ┌──────────────────────────────────────┐                      │
│  │       aitoearn-server (:3002)         │  NestJS              │
│  │       核心 API · 认证 · 内容管理 · 发布 │                      │
│  │       MCP 协议 · SSE 长连接            │                      │
│  │       44 个 Controller               │                      │
│  │       8 个 MCP Controller            │                      │
│  └──────────────┬───────────────────────┘                      │
│                 │ HTTP 内部调用                                   │
│  ┌──────────────▼───────────────────────┐                      │
│  │       aitoearn-ai (:3010)             │  NestJS              │
│  │       AI Agent 调度 · 内容生成 · 定价  │                      │
│  │       13 个 AI Skill                  │                      │
│  │       12 个 BullMQ 队列消费者         │                      │
│  └──────────────────────────────────────┘                      │
│                                                                 │
│  18 个共享库 (@yikart/*):                                       │
│  auth · queue · mongodb · redis · redlock · mail · assets ·    │
│  aws-s3 · ali-oss · ali-sms · channel-db · nest-mcp · common · │
│  helpers · ai-client · ai-shared · server-client · server-shared│
└─────────────────────────────────────────────────────────────────┘
          │                 │                │
          ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      基础设施层                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐              │
│  │ MongoDB   │  │  Redis   │  │  RustFS (S3)      │             │
│  │ 副本集     │  │  缓存/队列│  │  对象存储          │             │
│  │ :27017    │  │   :6379   │  │  :9001            │             │
│  └──────────┘  └──────────┘  └──────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 子项目关系

| 子项目 | 技术栈 | 端口 | 包管理 | Node | 角色 |
|--------|--------|------|--------|------|------|
| `aitoearn-server` | NestJS + MongoDB/Redis | 3002 | pnpm (Nx) | 24 | 核心 API，用户/内容/发布/频道 |
| `aitoearn-ai` | NestJS + BullMQ | 3010 | pnpm (Nx) | 24 | AI Agent 调度，内容生成，结算 |
| `aitoearn-web` | Next.js 14 App Router | 6060 | pnpm | LTS | Web 前端，SSR |
| `aitoearn-electron` | Electron + React 18 | — | npm | 20 | 桌面应用，本地发布 |

---

## 2. 配置系统

### 配置加载链路（最重要）

```
环境变量 (process.env)
    ↓ 在 config/local.config.js 中通过 process.env.XXX 读取
JavaScript 配置对象 (module.exports = { ... })
    ↓ 通过 nest-typed-config 的 fileLoader 加载
Zod Schema 校验 (config.ts 中的 appConfigSchema)
    ↓ 校验通过后注入为 NestJS provider
AppModule.forRoot(config) → 各子模块的 forRoot/forRootAsync
```

### 配置文件结构

```
apps/aitoearn-server/config/
├── config.js          # 生产环境（读取 process.env）
├── local.config.js    # 本地开发（读取 process.env + 硬编码端口 3002）
└── dev.config.js      # 预发布环境
```

### 关键环境变量表

| 环境变量 | 配置路径 | 说明 |
|----------|----------|------|
| `NODE_ENV` | `environment` | `development` / `production` |
| `APP_DOMAIN` | `appDomain` | 应用域名 |
| `PORT` | `port` | 硬编码 3002 |
| `MONGODB_HOST/PORT/USERNAME/PASSWORD` | `mongodb.uri`, `channel.channelDb.uri` | MongoDB 连接 |
| `REDIS_HOST/PORT/PASSWORD` | `redis`, `redlock.redis` | Redis 连接 |
| `JWT_SECRET` | `auth.secret` | JWT 签名密钥 |
| `INTERNAL_TOKEN` | `auth.internalToken` | 内部服务间认证 |
| `ASSETS_CONFIG` | `assets` | JSON 字符串（S3 配置） |
| `AI_URL` | `aiClient.baseUrl` | aitoearn-ai 地址 |
| `MAIL_USER/MAIL_PASS` | `mail.transport.auth` | 邮件服务 |
| `ALI_SMS_*` | `aliSms` | 阿里云短信 |
| `*_CLIENT_ID` / `*_CLIENT_SECRET` | 各平台 OAuth | 抖音/B站/快手/微信等 |
| `RELAY_SERVER_URL/API_KEY/CALLBACK_URL` | `relay` | Relay 代理（可选） |

### 配置校验 ZOD Schema 关键字段

```typescript
// apps/aitoearn-server/src/config.ts → appConfigSchema
{
  environment: 'development' | 'production',
  superCode: z.string().optional(),           // 超级管理员码
  auth: { secret, internalToken },           // JWT + 内部 token
  redis: { host, port, username, password },
  mongodb: { uri, dbName },
  redlock: { redis },                        // 分布式锁
  aliSms: { accessKeyId, accessKeySecret, signName, templateCode },
  assets: { region, bucketName, endpoint, accessKeyId, secretAccessKey, forcePathStyle },
  mail: { transport: {host,port,auth}, defaults: {from} },
  aiClient: { baseUrl, token },              // → aitoearn-ai
  newApi: { baseUrl, token }.optional(),     // 新 AI API
  channel: {
    channelDb,                                // 独立 MongoDB
    bilibili, douyin, kwai,                  // 国内平台 OAuth
    google, googleBusiness, pinterest,        // 国际平台 OAuth
    tiktok, twitter, youtube,
    wxPlat, myWxPlat,                        // 微信平台
    oauth: { facebook, threads, instagram, linkedin }
  },
  relay: { serverUrl, apiKey, callbackUrl }.optional(),
}
```

---

## 3. 认证系统

### 认证架构

```
请求进入
    ↓
AitoearnAuthGuard (全局 Guard)
    ├── @Internal() 装饰路由? → Bearer Token == internalToken → 放行
    ├── x-api-key header 存在? → SHA1(key) 查 ApiKeyRepository → 挂载 request.user
    ├── Authorization: Bearer <jwt> → jwtService.verifyAsync() → 挂载 request.user
    └── @Public() 装饰路由 且 无 token? → 放行（匿名）
```

### 三层认证优先级

| 优先级 | 方式 | 装饰器 | 场景 |
|--------|------|--------|------|
| 1 | 内部 Token | `@Internal()` | aitoearn-ai → aitoearn-server 内部调用 |
| 2 | API Key | `x-api-key` header | MCP / SSE / 第三方集成 |
| 3 | JWT | `Authorization: Bearer` | Web 前端用户登录 |

### JWT 生成

```typescript
// aitoearn-auth.service.ts
generateToken(payload: { mail, id, name, shopDomain })
  → jwtService.sign(payload, { secret, expiresIn })
```

### API Key 生成与验证

```typescript
// api-key.service.ts
create(userId, name):
  1. nanoid(48) 生成原文（前缀 ak_）
  2. SHA1(原文) → keyHash
  3. 存入 MongoDB (userId, name, keyHash)
  4. 仅返回原文（后续无法找回）

validateKey(rawKey):
  1. SHA1(rawKey) → 查库比对
  2. 校验通过更新 lastUsedAt
```

### 代码规范

- 不依赖 Passport.js，自定义 Guard 模式
- `.service.ts` 禁止直接 `InjectModel`，必须用 Repository 模式
- Logger 禁止 `staticMethod()`，必须创建实例

---

## 4. 数据模型

### MongoDB 数据库分布

| 数据库 | 用途 | Schema 文件 |
|--------|------|-------------|
| `aitoearn`（主库） | 用户、账号、内容、发布、通知 | user, account, publish-record, notification, asset, api-key, etc. |
| `aitoearn_channel`（渠道库） | 渠道数据、互动记录、OAuth 凭证 | oauth2-credential, engagement-task, interaction-record, etc. |

### 核心 Schema 字段速查

#### User (`user`)

```typescript
{
  mail: string,           // 邮箱（索引）
  phone?: string,         // 手机（索引）
  password?: string,      // 凭证（select: false）
  salt?: string,
  status: UserStatus,
  isDelete: boolean,
  wxOpenid? / wxUnionid?, // 微信绑定
  douyinUnionid?,         // 抖音绑定
  googleAccount?,         // Google 账号
  vipInfo?: { tier, expireAt, status, startAt },
  storage: { total: 500*MB, expiredAt? },  // 存储配额
  usedStorage: number,
  aiInfo?: { image?, edit?, video?, agent? },  // AI 模型偏好
  // ⚠️ 注意: User Schema 没有 credits/balance/points 字段
}
```

#### Account (`account`) — 渠道账号

```typescript
{
  userId: string,         // 所属用户
  type: AccountType,      // 平台枚举（douyin/kwai/bilibili/youtube/...）
  uid: string,            // 平台唯一标识
  nickname: string,
  fansCount / readCount / likeCount / collectCount / commentCount / workCount,
  income: number,         // 收入（字段存在但未实现结算写入）
  status: AccountStatus,  // NORMAL / ABNORMAL
  loginCookie / access_token / refresh_token,  // OAuth 凭证
}
```

#### PublishRecord (`publishRecord`)

```typescript
{
  userId / flowId / materialGroupId?,
  type: PublishType,      // video / imgText
  accountType: AccountType,
  accountId?,
  title? / desc? / topics: string[],
  videoUrl? / coverUrl? / imgUrlList?: string[],
  publishTime: Date,
  status: PublishStatus,  // WaitingForPublish → Publishing → Published / Failed
  queueId?,               // publish:<platform>:<uuid>
  inQueue / queued,       // 队列控制
  errorData? / errorMsg?,
  workLink? / platformWorkId?,
  source?: PublishRecordSource,
}
```

#### AiLog (`aiLogs`) — AI 调用日志

```typescript
{
  userId / userType / libraryId? / taskId?,
  type: AiLogType,        // Chat/Image/Video/Agent/Aideo/Crawler/...
  model: string,
  channel: AiLogChannel,
  status: AiLogStatus,    // Generating/Success/Failed
  startedAt / duration?,
  points: number,         // 消耗/预扣点数
  settlement?: {          // 结算信息
    status: Pending/Settled/Failed/Refunded,
    prepaidPoints, actualPoints?, deltaPoints?
  },
}
```

### Repository 模式

所有数据访问通过 Repository 封装，基类提供：

```typescript
class BaseRepository<T> {
  getById(id)           → LeanDoc | null
  create(data)          → LeanDoc
  updateById(id, data)  → LeanDoc | null
  deleteById(id)        → LeanDoc | null
  findWithPagination({ page, pageSize, filter }) → [LeanDoc[], count]
  findOne(filter)       → LeanDoc | null
  find(filter)          → LeanDoc[]
  count(filter)         → number
  exists(filter)        → boolean
}
```

共 18+ Repository 子类，如 `UserRepository`（扩展 `getByMail`, `getByPhone`, `getByDouyinUnionid` 等）。

---

## 5. 核心业务链路

### 5.1 用户注册/登录

```
POST /login
  ↓
LoginController
  ├── 邮箱登录: 验证密码 → 生成 JWT → 返回 token + userInfo
  ├── 手机登录: 验证短信码 → 查找/创建用户 → 生成 JWT
  └── 第三方登录:
      ├── 微信: code → openid/unionid → 查找绑定用户
      ├── 抖音: code → unionid → 查找绑定用户
      └── Google: idToken → googleAccount → 查找绑定用户
```

### 5.2 发布流程（最核心的业务链路）

```
用户前端操作
    ↓
POST /plat/publish (PublishController)
    ↓
PublishingService.createPublishingTask()
    ├── 1. 平台参数校验 (publishingProviders[accountType].validatePublishParams)
    ├── 2. 幂等检查 (flowId → publishRecordService 查重)
    ├── 3. Meta 特殊处理 (FB default=post, IG video→reel)
    ├── 4. 创建 PublishRecord (status: WaitingForPublish, queueId)
    └── 5. 路由决策:
        ├── 抖音 → 立即同步发布（不走队列）
        └── 其他平台 → publishTime 在 ±30s 窗口内?
            ├── 是 → enqueuePublishingTask() 立即入队
            └── 否 → 返回 pending，等待定时调度器

定时调度器 (enqueue-publishing-task.scheduler.ts)
    ↓ @Cron 定期扫描 publishTime <= now + tolerance
    ↓ Redlock 分布式锁防并发
    ↓ 逐个 enqueuePublishingTask()

队列入队 → PostPublish 队列 (BullMQ)
    ↓ Job: { publishRecordId, accountType, queueId }
    ↓ 重试配置: attempts=3, backoff=exponential(5s)

ImmediatePublishPostConsumer (concurrency=3)
    ↓ process(job):
    ├── 1. 查 PublishRecord
    ├── 2. publishingProviders[platform].publish()
    │     ├── 抖音: 同步发布
    │     ├── Meta: 分两步（先post再media，入 PostMediaTask 队列）
    │     └── 其他: 平台 SDK 调用
    ├── 3. 成功 → status=Published, workLink
    └── 4. 失败 → 重试(re-attempt) / status=Failed

FinalizePublishPostConsumer (concurrency=3)
    ↓ PostMediaTask 队列消费者
    ↓ Meta 两步发布的第二步（媒体上传完成确认）
```

### 5.3 账号 OAuth 绑定

```
用户 → 前端点击"绑定账号"
    ↓
Relay 模块（relay-oauth.controller.ts）
    ↓ 向官方 Relay 服务器发起 OAuth 请求
    ↓ 用户在平台授权

POST /plat/relay-callback (@Public())
    ↓ 接收 Relay 回调 (platformUid, nickname, avatar, token...)
    ↓ channelAccountService.createAccount()
    ↓ 在本地 Account 表创建记录
    ↓ 返回 HTML 视图 auth/back（关闭窗口回前端）
```

### 5.4 通知推送

```
通知生成 → NotificationService
    ↓ 创建 Notification 记录 (userId, type, title, content)
    ↓
NotificationModule
    ├── BullMQ Notification 队列
    └── 消费者:
        ├── OneSignal (移动端推送)
        └── Mail (邮件通知)
```

---

## 6. AI Agent 系统

### 架构

```
aitoearn-ai/apps/aitoearn-ai/src/core/agent/
├── agent.module.ts                    # Agent 功能模块
├── agent.controller.ts                # HTTP 控制器
├── agent.service.ts                   # 核心业务逻辑
├── skill-init.service.ts              # Skill 初始化
├── agent-task-timeout.scheduler.ts    # 任务超时调度
├── claude-code-router/                # Claude Code Router 集成
│   ├── claude-code-router.module.ts
│   └── claude-code-router.service.ts
├── mcp/                               # AI 内部 MCP 工具集
│   ├── image-edit.mcp.ts              # 图片编辑
│   ├── media.mcp.ts                   # 媒体处理
│   ├── subtitle.mcp.ts                # 字幕处理
│   ├── util.mcp.ts                    # 通用工具
│   ├── video-utils.mcp.ts             # 视频工具
│   ├── mcp.utils.ts
│   └── volcengine/                    # 火山引擎工具
│       ├── aideo.mcp.ts               # Aideo 视频创建
│       ├── drama-recap.mcp.ts         # 剧集拆解
│       ├── style-transfer.mcp.ts      # 风格迁移
│       ├── video-edit.mcp.ts          # 视频编辑
│       └── volcengine.utils.ts
├── services/
│   └── agent-runtime.service.ts       # Agent 运行时
└── skills/                            # 13 个 Skill 定义
    ├── analyzing-videos/SKILL.md
    ├── composing-videos/SKILL.md
    ├── crawling-social-media/SKILL.md
    ├── editing-images/SKILL.md
    ├── editing-videos/SKILL.md
    ├── extracting-thumbnails/SKILL.md
    ├── generating-drama-recaps/SKILL.md
    ├── generating-images/SKILL.md
    ├── generating-videos/SKILL.md
    ├── managing-content/SKILL.md
    ├── removing-subtitles/SKILL.md
    ├── transferring-video-styles/SKILL.md
    └── translating-videos/SKILL.md
```

### Skill 工作方式

每个 Skill 是一个 `.md` 文件（SKILL.md），包含该能力的自然语言描述，由 AI Agent 运行时解析和执行。MCP 工具文件（`.mcp.ts`）提供底层工具能力支持。

### AI 任务执行流程

```
aitoearn-server → HTTP 调用 aitoearn-ai
    ↓
AgentController → AgentService
    ↓
创建 ContentGenerationTask
    ↓
入队到对应队列 (DraftGeneration / AiImageAsync / etc.)
    ↓
消费者调用 AI 模型 API（Groq/Veo/Seedance/火山引擎/Doubao...）
    ↓ AsyncSettlementService:
    ├── 预扣点数 (createPendingSettlement)
    ├── AI 调用完成 → 结算 (settleSuccess)
    │   ├── delta > 0 → 追加扣减
    │   └── delta < 0 → 退还差额
    └── AI 调用失败 → 退款 (refundFailedTask)
```

---

## 7. MCP 协议实现

### 核心类

| 类 | 文件 | 职责 |
|----|------|------|
| `McpRegistryService` | `mcp-registry.service.ts` | 工具发现与注册（`OnApplicationBootstrap`） |
| `McpToolsHandler` | `mcp-tools.handler.ts` | 处理 ListTools / CallTool MCP 请求 |
| `McpExecutorService` | — | REQUEST 作用域，执行工具调用 |
| `McpModule` | `mcp.module.ts` | DynamicModule，支持 SSE + Streamable HTTP + STDIO |

### 工具发现机制

```
OnApplicationBootstrap
    ↓
McpRegistryService.discoverTools()
    ├── 1. 遍历 ModulesContainer
    ├── 2. 找出 __isMcpModule 标记的模块
    ├── 3. 收集其完整导入子树 (collectSubtreeModules)
    ├── 4. 对子树中所有 providers/controllers:
    │      MetadataScanner.scanFromPrototype()
    │      检测 Reflect.getOwnMetadataKeys 是否包含 MCP_TOOL_METADATA_KEY
    └── 5. 存入 discoveredToolsByMcpModuleId Map
```

### @Tool() 装饰器

```typescript
export function Tool(options: ToolOptions) {
  if (options.parameters === undefined) {
    options.parameters = z.object({}) // 默认空参数
  }
  return SetMetadata(MCP_TOOL_METADATA_KEY, options)
}
```

### MCP 控制器列表（server 侧）

| 控制器 | 装饰器前缀 | 功能 |
|--------|-----------|------|
| `ContentMcpController` | — | 内容管理工具 |
| `AccountMcpController` | — | 账号管理工具 |
| `TwitterMcpController` | — | Twitter 操作工具 |
| `PublishMcpController` | — | 发布工具 |
| `InteractionMcpController` | — | 互动工具 |
| `DraftGenerationMcpController` | — | 草稿生成工具 |

每个 MCP Controller 中的方法使用 `@Tool({ name, description, parameters: zod })` 注册为 MCP 工具。

### 对外暴露端点

| 端点 | 协议 | 说明 |
|------|------|------|
| `/api/unified/mcp` | MCP Streamable HTTP | Claude/Cursor 等 MCP 客户端 |
| `/api/unified/sse` | SSE | 长连接 SSE 端点 |
| `/api/{module}/mcp` | MCP Streamable HTTP | 模块级 MCP 端点 |
| `/api/{module}/sse` | SSE | 模块级 SSE 端点 |

---

## 8. 队列系统

### 队列总表（12 个 BullMQ 队列）

| 队列 | 用途 | 消费者位置 |
|------|------|-----------|
| `post_publish` | 内容发布（核心） | `ImmediatePublishPostConsumer` (server) |
| `post_media_task` | 两步发布第二步 | `FinalizePublishPostConsumer` (server) |
| `ai_image_async` | AI 图片生成 | ai 服务 |
| `engagement_task_distribution` | 互动任务分发 | server |
| `engagement_reply_to_comment_task` | AI 评论回复 | server |
| `dump_social_media_avatar` | 抓取头像 | server |
| `update_published_post` | 更新已发布内容 | `UpdatePublishedPostConsumer` (server) |
| `bull_notification` | 通知推送 | server |
| `ai_task_refund` | AI 任务失败退款 | `AiTaskRefundConsumer` (ai) |
| `place_draft_generation` | 草稿生成 | ai |
| `place_draft_generation_low_priority` | 低优先级草稿 | ai |
| `user_event_batch` | 用户事件批量写入 | server |

### @QueueProcessor 装饰器

```typescript
@QueueProcessor(QueueName.PostPublish, {
  concurrency: 3,           // 并发处理 3 个 job
  stalledInterval: 15000,   // 停滞检测间隔
  maxStalledCount: 1,       // 允许停滞次数
})
export class ImmediatePublishPostConsumer extends WorkerHost {
  async process(job: Job<PostPublishData>) { ... }
}
```

封装了 `@nestjs/bullmq` 的 `@Processor()`，额外增强：
- 自动记录 job 开始/完成/失败日志
- 推断 attempt / maxAttempts，最终失败时 `logger.fatal`
- Worker 事件自动 Pino 日志上下文

---

## 9. 前端架构

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 14 App Router |
| 语言 | TypeScript |
| UI | shadcn/ui (new-york) + Ant Design |
| 样式 | Tailwind CSS v4 (CSS 变量驱动) |
| 国际化 | react-i18next + locize (6 种语言) |
| 状态管理 | Zustand (localStorage / IndexedDB 持久化) |
| HTTP | 原生 fetch + 自研 FetchService 拦截器 |
| 测试 | Playwright (E2E) |

### 状态管理 (Zustand Stores)

| Store | 持久化 | 用途 |
|-------|--------|------|
| `useUserStore` | localStorage | 用户认证、token、偏好、登出 |
| `useAccountStore` | 内存 | 社交媒体账号列表/分组，15s 超时兜底 |
| `useSystemStore` | IndexedDB | UI 偏好（日历视图/公告/导航） |
| `useNotificationStore` | 内存 | 通知中心（列表/未读数/乐观更新） |
| `useThumbnailCache` | IndexedDB | 视频封面缓存（最大并发 3） |
| `usePublishDetailCache` | IndexedDB | 发布记录详情缓存（5 分钟过期） |
| `usePluginStore` | — | 浏览器插件状态（1187 行大文件） |
| `useAgentStore` | — | AI Agent 任务状态、消息、进度 |

### API 调用链路

```
API 文件 (src/api/*.ts)
    ↓ 调用 http.xxx()
http 实例 (src/utils/request.ts)
    ├── 从 useUserStore.getState().token 获取 token
    ├── 自动附加 Authorization: Bearer <token>
    ├── 自动附加 Accept-Language 头
    └── 基础 URL: process.env.NEXT_PUBLIC_API_URL + /
    ↓
FetchService (src/utils/FetchService/FetchService.ts)
    ├── 基于原生 fetch()
    ├── requestInterceptor / responseInterceptor 生命周期
    ├── FormData 直传（不设 Content-Type）
    ├── JSON 自动序列化
    └── Query params → URLSearchParams
    ↓
后端 API
    ↓ 响应拦截
    ├── code === 401 (无 token) → 直接返回 data
    ├── code === 401 (有 token) → logout() 强制登出
    ├── code === 12000 → logout()
    ├── code !== 0 (非 silent) → notification.warning()
    └── 网络异常 → notification.error("网络异常")
```

### 前端 API 代理（开发模式）

Next.js `rewrites` 将 `/api/*` 代理到后端：

```js
// next.config.mjs
if (process.env.NEXT_PUBLIC_PROXY_URL) {
  rewrites.push({
    source: '/api/:path*',
    destination: `${process.env.NEXT_PUBLIC_PROXY_URL}/api/:path*`,
  })
}
```

启动前端时设置: `NEXT_PUBLIC_PROXY_URL=http://localhost:3002 pnpm run dev`

### 路由页面树

```
src/app/[lng]/
├── page.tsx                    # 首页 = DraftBoxCore (草稿箱)
├── layout.tsx                  # 根布局: Sidebar + MainContent + MobileNav
├── auth/login/                 # 登录页
├── accounts/                   # 账号管理（绑定/排期）
├── draft-box/                  # 草稿箱核心组件
├── ai-social/                  # AI 社交（Agent 对话）
├── chat/[taskId]/              # 聊天任务
├── agent-assets/               # Agent 素材
├── brand-promotion/            # 品牌推广
├── tasks-history/              # 任务历史
└── websit/                     # 静态页（隐私/条款/插件指南）
```

### 支持语言（6 种）

| 代码 | 名称 | hreflang |
|------|------|----------|
| `en` | English | `en` |
| `zh-CN` | 简体中文 | `zh` |
| `ja` | 日本語 | `ja` |
| `de` | Deutsch | `de` |
| `fr` | Français | `fr` |
| `ko` | 한국어 | `ko` |

翻译文件位置: `src/app/i18n/locales/{lang}/{namespace}.json`，通过 `i18next-resources-to-backend` 动态懒加载。

### 中间件路由逻辑

`src/middleware.ts`:
- 检测 cookie (`i18next`) 或 `Accept-Language` 头
- 无语言前缀的路径 → 自动重定向到 `/<lng>/...`
- 白名单跳过: `/api/`、静态资源、`robots.txt`、`/healthz`、`/shortLink`

---

## 10. Electron 桌面端

### 三层架构

```
aitoearn-electron/
├── 主进程 (electron/main/)
│   ├── 自研 IOC 容器 (core/decorators/container)
│   ├── 12 个业务模块: account, publish, reply, interaction, backup, autoRun, tracing, tools, user, update, comment, splash
│   ├── SQLite 本地库 (TypeORM + better-sqlite3) — 11 个数据模型
│   ├── 平台发布模块: douyin / xhs / Kwai / wxSph
│   └── 系统托盘 + 自动更新 (electron-updater)
├── Preload (electron/preload/index.ts) — 暴露 ipcRenderer
└── 渲染进程 (src/)
    ├── React 18 + Ant Design + SCSS + Tailwind
    ├── Zustand 状态管理
    └── Vite 构建
```

### 打包配置

| 配置项 | 值 |
|--------|----|
| 产品名 | **哎哟赚AiToEarn** |
| appId | `cn.aitoearn.pc` |
| Windows | NSIS 安装包 (x64, 可选择目录) |
| Mac | x64 + arm64, hardenedRuntime + 公证 |
| 更新 | generic provider → `https://ylzsfile.yikart.cn/att/` |

### 关键区别 vs Web 前端

| 维度 | Web 前端 | Electron |
|------|----------|----------|
| 状态管理 | 独立 Zustand stores | 独立 Zustand stores |
| 组件库 | shadcn/ui + Ant Design | Ant Design + shadcn/ui |
| 平台调用 | 通过后端 API | 本地直接调用 + IPC 通信 |
| 数据存储 | 不存储（依赖后端） | SQLite 本地数据库 |
| 自动更新 | 不需要 | electron-updater |
| 发布实现 | 通过后端队列 | 本地直接调用平台 SDK |

---

## 11. 变现系统分析

### ⚠️ 关键发现

**开源版本的变现系统严重不完整：**

| 模块 | 状态 | 说明 |
|------|------|------|
| **积分/Credit 系统** | **Stub 空壳** | `CreditsHelperService.getBalance()` 返回 `Number.MAX_SAFE_INTEGER`，`addCredits()`/`deductCredits()` 为空方法 |
| **用户余额** | **无字段** | `User` Schema 没有 credits/balance/points |
| **CPS/CPE/CPM** | **不存在** | 代码库中搜索不到任何实现 |
| **任务市场** | **不存在** | 无品牌推广变现、竞价、分成代码 |
| **AI 定价** | **完整** | Token 阶梯定价 + Flat 定价 + 视频定价 + Twitter API 定价 |
| **AI 结算** | **完整** | `AsyncSettlementService` 实现预扣+实扣校准模式 |
| **账号收入** | **字段存在** | `Account.income` 字段定义但未见结算写入 |

### AI 定价模型（有完整实现）

#### Chat 定价

```typescript
// TieredTokenPricing: 按 token 消耗阶梯计费
interface TieredTokenPricing {
  tiers: [{
    maxInputTokens?: number,   // 当前阶梯上限
    input: TokenModalityPricing,  // { text, image?, video?, audio? }
    output: TokenModalityPricing, // { text, image?, video?, audio? }
  }]
}
// 公式: (input_tokens / 1000 * rate) + (output_tokens / 1000 * rate)
```

#### Image 定价

```typescript
// FlatPricing: 固定单价
{ price: "0.1" }  // 每张图片点数
```

#### Video 定价

```typescript
// 按分辨率和时长阶梯
pricing: [{
  resolution: "1080p",
  duration: 10,        // 秒
  price: 5,            // 点数
  originPrice: 10,     // 原价（用于展示折扣）
}]
```

#### Twitter API 定价

```typescript
pricing: {
  read: { post: 0.5, user: 1, media: 1, list: 0.3 },
  write: {
    contentCreate: 1.5,
    contentCreateWithUrl: 20,   // 含链接的发布
    interactionCreate: 1,
    interactionDelete: 0.5,
    contentManage: 0.5,
    bookmark: 0.5,
    mediaMetadata: 0,
  }
}
```

### 结算流程

```
AI 调用前:
  AsyncSettlementService.createPendingSettlement(prepaidPoints)
  → aiLog.settlement = { status: Pending, prepaidPoints }

AI 调用完成:
  settleSuccess(aiLogId, actualPoints)
  ├── delta = actual - prepaid
  ├── delta > 0 → deductCredits(追加扣减)  [空壳实现]
  ├── delta < 0 → addCredits(退还差额)      [空壳实现]
  └── status = Settled

AI 调用失败:
  markFailed / refundFailedTask
  → 退款到用户余额 [空壳实现]
```

### 对二开的影响

如果要做自己的收费产品，需要：
1. **实现 Credit 系统** — 替换 `CreditsHelperService` 的空壳，接入真实计费
2. **User 模型扩展** — 添加 credits/balance 字段
3. **需要任务市场？** — 需从零开发 CPS/CPE/CPM 体系
4. **AI 定价系统可复用** — 定价模型和结算框架是完整的

---

## 12. 二开建议

### 12.1 可复用 vs 需自建

| 模块 | 可复用性 | 说明 |
|------|----------|------|
| **后端配置系统** | ✅ 高 | ZOD 校验 + env→config 链路完整，可直接修改 |
| **认证系统** | ✅ 高 | JWT + API Key 双模式，去掉微信/抖音等绑定即可 |
| **数据模型** | ✅ 中 | Schema 完整但含大量平台特定字段，需提炼泛用模型 |
| **Repository 模式** | ✅ 高 | 基类 CRUD 封装完整，扩展性好 |
| **发布系统** | ✅ 高 | 队列+重试+定时调度设计成熟 |
| **AI Agent 系统** | ✅ 中 | Skill 框架和 MCP 工具可复用，需改模型接入 |
| **MCP 协议** | ✅ 高 | 工具自动发现+SSE+Streamable HTTP 完整 |
| **前端 UI 框架** | ✅ 中 | 组件库和质量高但强绑定 AiToEarn 业务 |
| **前端状态管理** | ❌ 低 | 强业务耦合，建议重写 |
| **积分/Credit** | ❌ 需自建 | 空壳实现，需从零做 |
| **任务市场/品牌变现** | ❌ 需自建 | 完全不存在 |

### 12.2 移除 AiToEarn 依赖的关键点

| 要移除的内容 | 涉及文件 |
|-------------|----------|
| 微信/抖音/快手等国内平台 OAuth | `config.ts` platform config, `channel/` platform controllers |
| 阿里云 SMS/OSS | `libs/ali-sms/`, `libs/ali-oss/` |
| Relay 代理 OAuth | `core/relay/` |
| locize 国际化服务 | `src/app/i18n/` — 替换翻译文件即可 |
| Rewardful 推广追踪 | `src/app/[lng]/layout.tsx` |
| OpenClaw 插件对接 | MCP/SSE 端点可保留但移除专属逻辑 |
| 哎哟赚品牌 | Electron 的 appId/productName |

### 12.3 保留有价值的部分

| 保留 | 价值 |
|------|------|
| **Nx Monorepo 结构** | 模块边界清晰，依赖管理好 |
| **ZOD 配置校验** | 类型安全的配置管理 |
| **Auth Guard 模式** | 灵活的认证链路，比 Passport.js 更可控 |
| **MCP nest-mcp 库** | 完整的 MCP 协议 NestJS 实现 |
| **BullMQ 队列封装** | `@QueueProcessor` 装饰器设计优雅 |
| **AsyncSettlementService** | 预扣+实扣校准的结算框架 |
| **AI 定价计算器** | Token 阶梯 + Flat + 视频定价 |
| **Repository 模式** | 数据访问层分离 |
| **FetchService** | 无第三方 HTTP 库的拦截器设计 |
| **Electron IOC 容器** | 自研装饰器风格 IOC |

### 12.4 二开改造路线

```
第一阶段: 核心剥离
  1. 移除国内平台代码（微信/抖音/快手/小红书/B站/阿里云）
  2. 精简配置 Schema，保留通用字段
  3. 替换品牌标识（Logo/名称/域名）

第二阶段: 变现体系
  4. 实现 CreditsHelperService（接入真实计费）
  5. 扩展 User Schema（添加 credits/balance）
  6. 实现支付集成（Stripe/支付宝/微信支付）
  7. 设计你的定价模型

第三阶段: 差异化
  8. 替换 AI 模型接入（DeepSeek/豆包/本地模型 → 支持用户自带 API Key）
  9. 改造前端为你的 UI 风格
  10. 添加你的特色功能

第四阶段: 打包分发
  11. Docker 一键部署
  12. Electron 桌面端打包签名
  13. 自动更新渠道
```

---

## 附录 A: 后端模块依赖图

```
aitoearn-server (AppModule)
├── MongoDB (MongodbModule) ────── 主库 (aitoearn)
├── MongoDB (ChannelDbModule) ──── 渠道库 (aitoearn_channel)
├── Redis ───────────────────────── 缓存 + BullMQ 后端
├── Redlock ─────────────────────── 分布式锁
├── Mail ────────────────────────── SES 邮件
├── AliSms ──────────────────────── 阿里云短信
├── Auth ────────────────────────── JWT + API Key 双认证
├── AI Client ───────────────────── HTTP 客户端 → aitoearn-ai
├── Queue ───────────────────────── 12 个 BullMQ 队列
│
├── 业务模块:
│   ├── UserModule
│   ├── AccountModule
│   ├── ContentModule (media/material)
│   ├── ChannelModule (platforms/engagement/data-cube/interact)
│   ├── PublishModule
│   ├── InternalModule
│   ├── ApiKeyModule
│   ├── AssetsModule
│   ├── NotificationModule
│   ├── ShortLinkModule
│   ├── ToolsModule
│   ├── RelayModule
│   └── UnifiedMcpModule (MCP/SSE 端点)
│
└── 全局中间件:
    ├── CORS, EJS 模板, trust proxy
    ├── HttpMetricsInterceptor (指标收集)
    ├── RequestContextInterceptor (请求上下文)
    ├── PropagationInterceptor
    ├── ResponseInterceptor
    ├── ZodValidationPipe (请求校验)
    ├── GlobalExceptionFilter
    ├── /metrics (Prometheus)
    ├── /health (健康检查)
    └── /docs (Scalar API Reference)
```

## 附录 B: 关键文件索引

| 文件 | 用途 |
|------|------|
| `apps/aitoearn-server/src/main.ts` | 服务启动入口 |
| `apps/aitoearn-server/src/app.module.ts` | 根模块（26 个子模块导入） |
| `apps/aitoearn-server/src/config.ts` | ZOD 配置 Schema |
| `apps/aitoearn-server/config/local.config.js` | 本地配置（env→JS 对象） |
| `libs/common/src/utils/select-config.util.ts` | 配置加载工具 |
| `libs/aitoearn-auth/src/aitoearn-auth.guard.ts` | 认证守卫（JWT+API Key） |
| `libs/mongodb/src/schemas/` | 所有 MongoDB Schema |
| `libs/mongodb/src/repositories/base.repository.ts` | Repository 基类 |
| `apps/aitoearn-server/src/core/channel/publishing/publishing.service.ts` | 发布核心引擎 |
| `apps/aitoearn-server/src/core/api-key/api-key.service.ts` | API Key 管理 |
| `apps/aitoearn-ai/src/core/agent/agent.service.ts` | AI Agent 核心 |
| `apps/aitoearn-ai/src/core/ai/settlement/settlement.service.ts` | 异步结算服务 |
| `apps/aitoearn-ai/src/core/ai/pricing/pricing-calculator.ts` | 定价计算器 |
| `libs/nest-mcp/src/mcp.module.ts` | MCP 协议模块 |
| `libs/nest-mcp/src/mcp-registry.service.ts` | MCP 工具自动发现 |
| `libs/aitoearn-queue/src/queue.decorator.ts` | @QueueProcessor 装饰器 |
| `libs/helpers/src/credits/credits-helper.service.ts` | ⚠️ Credit 空壳实现 |
| `src/utils/request.ts` (web) | 前端 HTTP 封装 |
| `src/middleware.ts` (web) | 国际化路由中间件 |
| `electron/main/index.ts` | Electron 主进程入口 |
