# AiToEarn → Cloudflare 全量重写方案

> 目标：将 AiToEarn 完全迁移到 Cloudflare 原生服务，去除 VPS/Node.js/MongoDB/Redis 依赖，保留核心业务逻辑设计，以新产品形态发布。

---

## 目录

1. [技术栈映射](#1-技术栈映射)
2. [架构设计](#2-架构设计)
3. [项目结构](#3-项目结构)
4. [数据库设计迁移](#4-数据库设计迁移)
5. [分阶段执行计划](#5-分阶段执行计划)
6. [关键技术方案](#6-关键技术方案)
7. [成本估算](#7-成本估算)
8. [风险与对策](#8-风险与对策)

---

## 1. 技术栈映射

### 旧 → 新 对照表

| 层级 | AiToEarn (旧) | 新架构 (Cloudflare) | 状态 |
|------|--------------|---------------------|------|
| **后端框架** | NestJS | Hono v4 | ✅ 生产就绪 |
| **类型校验** | Zod (nest-typed-config) | Zod (hono/zod-validator) | ✅ 无缝迁移 |
| **ORM** | Mongoose (MongoDB) | Drizzle ORM (SQLite) | ✅ 生产就绪 |
| **数据库** | MongoDB (副本集) | Cloudflare D1 | ✅ 生产就绪 |
| **缓存** | Redis | Workers KV | ✅ 生产就绪 |
| **队列** | BullMQ (Redis) | Cloudflare Queues | ✅ 生产就绪 |
| **分布式锁** | Redlock (Redis) | Durable Objects | ✅ 生产就绪 |
| **对象存储** | RustFS/AWS S3/OSS | R2 | ✅ S3 API 兼容 |
| **认证** | JWT + API Key (自研) | hono/jwt + 自研 API Key | ✅ 可移植 |
| **配置** | JS env → ZOD | wrangler.toml secrets + env bindings | ✅ 更简单 |
| **MCP 协议** | @yikart/nest-mcp | @hono/mcp | ✅ 生产就绪 |
| **SSE** | nest-mcp SSE | Hono Streaming / Server-Sent Events | ✅ |
| **邮件** | Nodemailer + SES | Resend / Cloudflare Email Routing | ✅ |
| **短信** | 阿里云短信 | Twilio / 替换服务 | ✅ |
| **前端** | Next.js 14 | Next.js 14 + @opennextjs/cloudflare | ⚠️ 需测试 |
| **桌面端** | Electron | Electron（API 地址改为 CF） | ✅ 最小改动 |
| **Monorepo** | Nx + pnpm | pnpm workspace（可选 Turborepo） | ✅ 更轻量 |

### 移除的依赖

| 移除 | 原因 |
|------|------|
| Nx | Cloudflare 不需要构建编排，pnpm workspace 足够 |
| NestJS 全家桶 | Workers 不支持 Node.js 装饰器/反射 |
| Mongoose / MongoDB | 替换为 D1 (SQLite) |
| BullMQ / ioredis | 替换为 Cloudflare Queues |
| Redlock | 替换为 Durable Objects |
| NestJS Guards/Pipes/Filters | Hono 中间件替代 |
| EJS 模板引擎 | Workers 无文件系统，替换为字符串模板或移除 |
| Pino 日志 | Workers 使用 `console.log` 或 CF Logpush |
| Prometheus 指标 | CF Analytics 替代 |
| Scalar API Docs | Hono 有 OpenAPI 支持 |
| 阿里云 OSS/SMS | 移除或替换为云中立方案 |
| 国内平台 OAuth | 移除（抖音/快手/B站/小红书/微信） |

---

## 2. 架构设计

### 2.1 部署拓扑

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare DNA                             │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Pages (前端)                                            │ │
│  │  ├── /          → Next.js SSG/SSR (OpenNext)            │ │
│  │  ├── /api/*     → Workers (Hono)  [不经过 Pages]        │ │
│  │  └── /_next/*   → 静态资源                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Workers (后端 API)                                      │ │
│  │  ├── api.yourdomain.com/*  → Hono App                   │ │
│  │  ├── /mcp                  → MCP Streamable HTTP        │ │
│  │  └── /sse                  → SSE 长连接                 │ │
│  │       bindings:                                          │ │
│  │       ├── DB (D1)                                       │ │
│  │       ├── BUCKET (R2)                                   │ │
│  │       ├── CACHE (KV)                                    │ │
│  │       ├── QUEUE (Queues)                                │ │
│  │       ├── LOCK (DO: RedLock)                            │ │
│  │       ├── AI_QUEUE (Queues: ai-tasks)                   │ │
│  │       └── ENV (secrets)                                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  基础设施                                               │ │
│  │  ├── D1          (aitoearn-db)       — 主数据库         │ │
│  │  ├── R2          (aitoearn-assets)  — 文件存储          │ │
│  │  ├── KV          (aitoearn-cache)   — 缓存/会话         │ │
│  │  ├── Queues      (publish-queue)    — 发布任务          │ │
│  │  ├── Queues      (ai-task-queue)    — AI 任务           │ │
│  │  ├── DO          (redlock)          — 分布式锁          │ │
│  │  └── DO          (mcp-session)      — MCP 会话状态      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  外部服务                                               │ │
│  │  ├── Resend          — 邮件发送                         │ │
│  │  ├── Twilio          — 短信验证                         │ │
│  │  ├── AI API          — OpenAI/DeepSeek/豆包             │ │
│  │  └── 平台 OAuth      — YouTube/Facebook/Twitter 等      │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 请求流向

```
浏览器 → Cloudflare DNS → 路由规则
  ├── yourdomain.com/*       → Pages (前端)
  ├── api.yourdomain.com/*   → Workers (API)
  ├── yourdomain.com/api/*   → Workers (API, 同域名)
  └── yourdomain.com/mcp     → Workers (MCP)

API Worker 内部:
  Hono 中间件链 → 业务处理
    ├── auth middleware (JWT / API Key)
    ├── Zod validator (请求校验)
    ├── Service 逻辑
    │   ├── DB: D1 (通过 Drizzle ORM)
    │   ├── Cache: KV (get/put/delete)
    │   ├── Storage: R2 (上传/下载/S3 API)
    │   ├── Queue: Queues (send/批量处理)
    │   └── Lock: DO (acquire/release)
    └── Response (JSON / SSE stream)
```

### 2.3 与旧架构的核心差异

| 维度 | 旧 (NestJS) | 新 (Hono + CF) |
|------|-------------|-----------------|
| **模块组织** | NestJS Module 装饰器 | 按文件拆分，Hono 子路由挂载 |
| **依赖注入** | NestJS DI 容器 | 手动工厂函数 或 闭包注入 |
| **请求处理** | Controller + Service | Hono Handler → Service 函数 |
| **中间件** | NestJS Guards/Pipes/Filters | Hono Middleware (洋葱模型) |
| **配置加载** | fileLoader + ZOD + CLI arg | wrangler.toml + env bindings |
| **ORM** | Mongoose ODM (文档型) | Drizzle ORM (关系型) |
| **数据查询** | MongoDB Query Language | SQL (Drizzle 查询构建器) |
| **事务** | MongoDB Transactions | D1 事务 (BEGIN/COMMIT) |
| **队列消费** | @QueueProcessor + WorkerHost | Queues Handler (export default) |
| **定时任务** | @nestjs/schedule (@Cron) | Workers Cron Triggers |
| **日志** | Pino multistream | console.log → Logpush |

---

## 3. 项目结构

```
your-product/
├── apps/
│   ├── api/                          # Hono Workers (后端)
│   │   ├── wrangler.toml            # CF 配置 (bindings, routes, queues)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts              # 主入口: Hono App + 路由挂载
│   │       ├── env.ts                # Bindings 类型定义
│   │       ├── app/
│   │       │   ├── auth/             # 认证模块
│   │       │   │   ├── auth.middleware.ts   # JWT + API Key 中间件
│   │       │   │   ├── auth.service.ts     # Token 生成/验证
│   │       │   │   └── auth.routes.ts      # /login, /register, /api-key
│   │       │   ├── user/
│   │       │   │   ├── user.routes.ts
│   │       │   │   ├── user.service.ts
│   │       │   │   └── user.schema.ts      # Drizzle schema
│   │       │   ├── account/
│   │       │   │   ├── account.routes.ts
│   │       │   │   ├── account.service.ts
│   │       │   │   └── account.schema.ts
│   │       │   ├── content/
│   │       │   │   ├── media.routes.ts
│   │       │   │   ├── material.routes.ts
│   │       │   │   └── *.schema.ts
│   │       │   ├── publish/
│   │       │   │   ├── publish.routes.ts
│   │       │   │   ├── publish.service.ts
│   │       │   │   └── publish.consumer.ts  # Queues Handler
│   │       │   ├── ai/
│   │       │   │   ├── agent.routes.ts
│   │       │   │   ├── agent.service.ts
│   │       │   │   ├── skills/             # 13 个 Skill
│   │       │   │   ├── settlement.service.ts
│   │       │   │   ├── pricing.service.ts
│   │       │   │   └── ai-task.consumer.ts  # Queues Handler
│   │       │   ├── notification/
│   │       │   ├── mcp/
│   │       │   │   ├── mcp.module.ts        # @hono/mcp 配置
│   │       │   │   └── tools/               # MCP 工具文件
│   │       │   └── assets/
│   │       │       ├── assets.routes.ts
│   │       │       └── assets.service.ts    # R2 操作
│   │       ├── db/
│   │       │   ├── index.ts              # Drizzle 实例 + 连接
│   │       │   ├── schema.ts             # 所有表 Schema 导出
│   │       │   └── migrations/           # Drizzle Kit 迁移文件
│   │       ├── middlewares/
│   │       │   ├── cors.ts
│   │       │   ├── request-id.ts
│   │       │   ├── error-handler.ts
│   │       │   └── logger.ts
│   │       ├── shared/
│   │       │   ├── types.ts              # 共享类型
│   │       │   ├── utils.ts              # 工具函数
│   │       │   ├── constants.ts
│   │       │   └── enums.ts              # 枚举迁移
│   │       └── queue/
│   │           ├── index.ts              # 队列生产者
│   │           └── types.ts              # Job 类型定义
│   │
│   └── web/                          # Next.js (前端，改动最小)
│       ├── package.json
│       ├── next.config.mjs           # 移除 rewrites (改直接调用)
│       ├── wrangler.toml             # Pages 配置
│       └── src/
│           ├── api/                  # API 客户端
│           │   └── client.ts         # Hono RPC Client (类型安全)
│           ├── app/[lng]/            # 页面路由 (不变)
│           └── ... (其余前端代码结构不变)
│
├── packages/
│   └── shared/                       # 前后端共享类型 (Hono RPC)
│       ├── src/
│       │   ├── routes.ts             # API 路由类型导出
│       │   ├── dtos.ts               # 请求/响应 DTO
│       │   └── index.ts
│       └── package.json
│
├── drizzle.config.ts                 # Drizzle Kit 配置
├── wrangler.toml                     # 根 CF 配置 (可选)
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

---

## 4. 数据库设计迁移

### 4.1 MongoDB → SQLite (D1) 映射

#### 核心表设计

```sql
-- 用户表 (原 user.schema.ts)
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- UUID (替代 MongoDB ObjectId)
  mail TEXT UNIQUE,              -- 邮箱登录
  phone TEXT UNIQUE,             -- 手机登录
  password_hash TEXT,            -- bcrypt 哈希
  salt TEXT,
  name TEXT,
  avatar TEXT,
  status TEXT DEFAULT 'active',  -- active/suspended/deleted
  locale TEXT DEFAULT 'en',
  storage_quota INTEGER DEFAULT 524288000,  -- 500MB
  storage_used INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 0,     -- ⭐ 新增: 用户积分
  vip_tier TEXT,                 -- free/basic/pro
  vip_expire_at INTEGER,         -- Unix timestamp
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 账号表 (原 account.schema.ts)
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,         -- youtube/twitter/facebook/instagram/tiktok
  platform_uid TEXT,              -- 平台唯一 ID
  nickname TEXT,
  avatar TEXT,
  access_token TEXT,              -- OAuth 凭证 (需加密存储)
  refresh_token TEXT,
  token_expires_at INTEGER,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  works_count INTEGER DEFAULT 0,
  income REAL DEFAULT 0,          -- 累计收入
  status TEXT DEFAULT 'active',   -- active/expired/revoked
  group_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, platform, platform_uid)
);

-- 发布记录表 (原 publish-record.schema.ts)
CREATE TABLE publish_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  account_id TEXT REFERENCES accounts(id),
  platform TEXT NOT NULL,
  flow_id TEXT,                   -- 幂等键
  type TEXT NOT NULL,             -- video/imgText/article
  title TEXT,
  description TEXT,
  topics TEXT,                    -- JSON array as text
  video_url TEXT,
  cover_url TEXT,
  image_urls TEXT,                -- JSON array as text
  publish_time INTEGER,           -- 定时发布时间
  status TEXT NOT NULL DEFAULT 'waiting',  -- waiting/queued/publishing/published/failed
  queue_message_id TEXT,          -- CF Queues message ID
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  work_url TEXT,                  -- 发布后平台链接
  platform_work_id TEXT,
  source TEXT DEFAULT 'web',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_publish_status_time ON publish_records(status, publish_time);
CREATE INDEX idx_publish_user ON publish_records(user_id, created_at);

-- AI 日志表 (原 ai-log.schema.ts)
CREATE TABLE ai_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  task_id TEXT,
  type TEXT NOT NULL,             -- chat/image/video/agent/draft
  model TEXT NOT NULL,
  channel TEXT,
  action TEXT,
  status TEXT NOT NULL DEFAULT 'generating',  -- generating/success/failed
  started_at INTEGER NOT NULL,
  duration_ms INTEGER,
  -- 结算相关
  prepaid_points INTEGER DEFAULT 0,
  actual_points INTEGER,
  settlement_status TEXT DEFAULT 'pending',  -- pending/settled/failed/refunded
  settled_at INTEGER,
  -- AI 调用信息
  request_data TEXT,              -- JSON
  response_data TEXT,             -- JSON
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_ai_logs_user ON ai_logs(user_id, created_at);
CREATE INDEX idx_ai_logs_settlement ON ai_logs(settlement_status, created_at);

-- API Key 表 (原 api-key.schema.ts)
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,  -- SHA1 哈希
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 通知表 (原 notification.schema.ts)
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  data TEXT,                      -- JSON
  status TEXT DEFAULT 'unread',   -- unread/read/deleted
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_notif_user ON notifications(user_id, status, created_at);

-- 内容生成任务表 (原 content-generation-task.schema.ts)
CREATE TABLE generation_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  messages TEXT,                  -- JSON array of messages
  status TEXT DEFAULT 'running',
  rating INTEGER,
  rating_comment TEXT,
  share_token TEXT UNIQUE,
  share_expires_at INTEGER,
  favorited_at INTEGER,
  analysis TEXT,                  -- JSON
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 互动记录表 (原 interaction-record.schema.ts)
CREATE TABLE interaction_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  account_id TEXT REFERENCES accounts(id),
  platform TEXT NOT NULL,
  work_id TEXT,
  work_title TEXT,
  action_type TEXT NOT NULL,      -- like/comment/reply/follow/collect
  action_time INTEGER,
  content TEXT,                   -- 评论/回复内容
  created_at INTEGER NOT NULL
);
```

### 4.2 Schema 迁移模式对比

| MongoDB | D1 (SQLite) |
|---------|-------------|
| `{ _id: ObjectId }` | `id TEXT PRIMARY KEY` (UUID) |
| `{ field: string }` | `field TEXT` |
| `{ field: number }` | `field INTEGER` (或 REAL 对浮点数) |
| `{ field: Date }` | `field INTEGER` (Unix timestamp ms) |
| `{ embedded: { ... } }` | 展开为扁平字段 或 `TEXT` (JSON string) |
| `{ array: [...] }` | `TEXT` (JSON array) |
| `{ field?: T }` (可选) | `field T` (允许 NULL) |
| `.lean()` 返回普通对象 | Drizzle 直接返回普通对象 |
| `.populate('ref')` | JOIN 查询 (Drizzle `relations`) |
| `{ timestamps: true }` | `created_at, updated_at` 手动管理 |
| Mongoose Index | `CREATE INDEX ... ON ...` |
| Mongoose Transaction | D1 `batch()` (原子批量) |

### 4.3 Drizzle Schema 示例

```typescript
// db/schema.ts
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  mail: text('mail').unique(),
  phone: text('phone').unique(),
  passwordHash: text('password_hash'),
  salt: text('salt'),
  name: text('name'),
  avatar: text('avatar'),
  status: text('status').default('active'),
  locale: text('locale').default('en'),
  storageQuota: integer('storage_quota').default(524288000),
  storageUsed: integer('storage_used').default(0),
  credits: integer('credits').default(0),
  vipTier: text('vip_tier'),
  vipExpireAt: integer('vip_expire_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const publishRecords = sqliteTable('publish_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  accountId: text('account_id').references(() => accounts.id),
  platform: text('platform').notNull(),
  flowId: text('flow_id'),
  type: text('type').notNull(),
  status: text('status').notNull().default('waiting'),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(3),
  publishTime: integer('publish_time'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  statusTimeIdx: uniqueIndex('idx_publish_status_time').on(table.status, table.publishTime),
}))
```

---

## 5. 分阶段执行计划

### 总时间估算: 12-16 周 (全职) / 24-36 周 (兼职)

```
Phase 1: 骨架搭建          ████████████░░░░░░░░░░░░░░░░  2 周
Phase 2: 核心业务           ░░░░░░░░░░░░████████████░░░░░  4 周
Phase 3: AI 系统            ░░░░░░░░░░░░░░░░░░░░░░░██████  3 周
Phase 4: 前端适配           ░░░░░░░░░░░░░░░░░░░░░░░██████  2 周
Phase 5: MCP & 集成         ░░░░░░░░░░░░░░░░░░░░░░░██████  2 周
Phase 6: 测试 & 部署        ░░░░░░░░░░░░░░░░░░░░░░░██████  3 周
```

### Phase 1: 骨架搭建 (Week 1-2)

**目标**: 项目可运行，数据库可访问，认证可工作

```
□ 初始化项目
  □ pnpm workspace monorepo
  □ tsconfig 配置
  □ ESLint + Prettier

□ 搭建 Hono API Worker
  □ wrangler.toml (D1, R2, KV, Queues bindings)
  □ Hono App 骨架 + 子路由模式
  □ 全局中间件 (CORS, RequestID, ErrorHandler, Logger)
  □ Env bindings 类型定义

□ 数据库
  □ 创建 D1 数据库 (wrangler d1 create)
  □ Drizzle Schema 定义 (所有表)
  □ Drizzle Kit 迁移配置
  □ 生成首次迁移 + 应用

□ 认证模块
  □ POST /auth/login (邮箱/密码)
  □ POST /auth/register (邮箱注册)
  □ JWT 生成 + 验证 (hono/jwt)
  □ API Key 生成 + 验证
  □ authMiddleware (全局)

□ R2 存储
  □ 创建 R2 Bucket
  □ 文件上传端点 (PUT /files/:key)
  □ S3 兼容 API 适配

□ CI/CD
  □ GitHub Actions → wrangler deploy
  □ Staging 环境
```

### Phase 2: 核心业务 (Week 3-6)

**目标**: 用户管理、账号绑定、内容发布全流程跑通

```
□ 用户模块
  □ GET/PUT /user/profile
  □ 存储配额管理
  □ 积分系统 (Credit 实现)

□ 账号模块
  □ CRUD /accounts
  □ 平台分组管理
  □ OAuth 绑定流程 (YouTube/Facebook/Twitter)
  □ Token 刷新机制

□ 内容模块
  □ 媒体上传/管理
  □ 素材管理
  □ 媒体分组

□ 发布模块 (核心)
  □ POST /publish (创建发布任务)
  □ 幂等检查 (flowId)
  □ 平台参数校验
  □ 发布记录管理
  □ 定时发布调度 (Cron Trigger 替代 @Cron)

□ 队列消费者
  □ Queues Handler: publish-queue
  □ 平台发布 SDK 调用
  □ 失败重试逻辑
  □ 发布状态回写

□ 通知模块
  □ 通知创建/查询/已读
  □ 邮件通知 (Resend)
  □ 短信通知 (Twilio)
```

### Phase 3: AI 系统 (Week 7-9)

**目标**: AI Agent 和内容生成能力上线

```
□ AI 任务系统
  □ POST /ai/generate (文本/图片/视频)
  □ Queues Handler: ai-task-queue
  □ AI 模型调用 (OpenAI/DeepSeek/Doubao)
  □ 流式响应 (SSE)

□ 定价与结算
  □ PricingCalculator (移植 Token 阶梯 + Flat 定价)
  □ CreditService (扣减/退款/查询余额)
  □ SettlementService (预扣 + 实扣校准)
  □ AI 任务退款消费者

□ 13 个 Skill 迁移
  □ analyzing-videos → Workers 实现
  □ composing-videos
  □ generating-images / generating-videos
  □ editing-images / editing-videos
  □ ... 等 (根据产品需求选择性迁移)

□ 草稿生成
  □ POST /draft/generate
  □ 批量生成
  □ 生成记忆

□ AI 日志
  □ 调用记录
  □ 费用明细
```

### Phase 4: 前端适配 (Week 10-11)

**目标**: 前端跑在 Cloudflare Pages 上，对接新 API

```
□ Next.js on Cloudflare Pages
  □ 安装 @opennextjs/cloudflare
  □ 适配 Edge 运行时限制
  □ 移除 Node.js 特定 API 调用
  □ wrangler.toml Pages 配置

□ API 对接
  □ 替换 src/utils/request.ts 基础 URL → API Worker
  □ 替换 Authorization 头注入方式
  □ Hono RPC Client (可选，类型安全)

□ 国际化
  □ 移除 locize 依赖（如需要）
  □ 翻译文件内嵌

□ 平台 OAuth
  □ 回调 URL 改为新的 API Worker 地址

□ 品牌定制
  □ 替换 Logo/名称/颜色
  □ 替换 SEO/StructuredData
```

### Phase 5: MCP & 深度集成 (Week 12-13)

**目标**: MCP 协议支持，差异化功能

```
□ MCP 协议
  □ @hono/mcp StreamableHTTP 配置
  □ 工具注册 (Port 现有 MCP 工具逻辑)
  □ SSE 端点
  □ MCP Auth

□ 现有 MCP 工具迁移
  □ ContentMcpTools
  □ AccountMcpTools
  □ PublishMcpTools
  □ TwitterMcpTools
  □ InteractionMcpTools
  □ DraftGenerationMcpTools

□ 分布式锁
  □ Durable Objects Redlock 实现
  □ 发布调度器使用 DO 锁
  □ AI 任务并发控制

□ 定时任务
  □ Workers Cron Triggers
  □ 发布调度 (替代 enqueue-publishing-task.scheduler)
  □ 数据清理任务

□ 你的差异化功能
  □ (根据你的产品需求添加)
```

### Phase 6: 测试 & 上线 (Week 14-16)

```
□ 测试
  □ 单元测试 (Vitest + miniflare)
  □ 集成测试 (CF Workers 本地)
  □ E2E 测试 (Playwright)

□ 性能
  □ D1 查询优化 (索引 + 缓存)
  □ KV 缓存策略
  □ Workers 冷启动优化

□ 部署
  □ Staging 环境验证
  □ 生产环境 wrangler deploy
  □ 域名绑定 + SSL

□ 监控
  □ CF Analytics + Logpush
  □ Sentry / 自定义错误追踪

□ 文档
  □ API 文档 (Hono OpenAPI)
  □ 部署文档
  □ 用户文档
```

---

## 6. 关键技术方案

### 6.1 认证中间件

```typescript
// app/auth/auth.middleware.ts
import { jwt } from 'hono/jwt'
import type { Env } from '../../env'

// JWT 验证
export const jwtAuth = (env: Env) =>
  jwt({
    secret: env.JWT_SECRET,
    cookie: { key: 'token', secret: env.COOKIE_SECRET },
  })

// API Key 验证
export const apiKeyAuth = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const apiKey = c.req.header('x-api-key')
  if (apiKey) {
    const hash = await sha1(apiKey)
    const keyRecord = await db.select().from(apiKeys)
      .where(eq(apiKeys.keyHash, hash))
      .get()
    if (keyRecord) {
      c.set('userId', keyRecord.userId)
      return next()
    }
  }
  return c.json({ error: 'Invalid API Key' }, 401)
}

// 组合中间件: JWT 优先，API Key 兜底
export const auth = (env: Env) => async (c: Context, next: Next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (token) return jwtAuth(env)(c, next)
  return apiKeyAuth(c, next)
}
```

### 6.2 队列生产者 + 消费者

```typescript
// queue/index.ts (生产者)
export async function enqueuePublishTask(
  env: Env,
  data: PublishJobData
): Promise<string> {
  const msg = await env.PUBLISH_QUEUE.send({
    id: data.queueId,
    body: data,
    delaySeconds: data.delaySeconds,
  })
  return msg.id
}

// queue/publish.consumer.ts (消费者)
export default {
  async queue(batch: MessageBatch<PublishJobData>, env: Env) {
    for (const msg of batch.messages) {
      try {
        await processPublish(msg.body, env)
        msg.ack()
      } catch (err) {
        if (msg.body.attempts < msg.body.maxAttempts) {
          msg.retry({ delaySeconds: Math.pow(2, msg.body.attempts) * 5 })
        } else {
          await markPublishFailed(msg.body.recordId, err.message, env)
          msg.ack()
        }
      }
    }
  }
}
```

### 6.3 Durable Objects 分布式锁

```typescript
// durables/redlock.ts
export class RedLock extends DurableObject {
  private locks: Map<string, { owner: string; expiresAt: number }> = new Map()

  async acquire(lockKey: string, owner: string, ttlMs: number): Promise<boolean> {
    const existing = this.locks.get(lockKey)
    if (existing && existing.expiresAt > Date.now()) return false
    this.locks.set(lockKey, { owner, expiresAt: Date.now() + ttlMs })
    // 通过 Alarm API 设置 TTL 自动释放
    await this.ctx.storage.setAlarm(Date.now() + ttlMs)
    return true
  }

  async release(lockKey: string, owner: string): Promise<boolean> {
    const existing = this.locks.get(lockKey)
    if (!existing || existing.owner !== owner) return false
    this.locks.delete(lockKey)
    return true
  }

  async alarm() {
    // 清理过期锁
    const now = Date.now()
    for (const [key, lock] of this.locks) {
      if (lock.expiresAt <= now) this.locks.delete(key)
    }
  }
}
```

### 6.4 Hono RPC 前后端类型共享

```typescript
// packages/shared/src/routes.ts
import { initContract } from '@ts-rest/core'  // 或手写类型

const c = initContract()

export const userContract = c.router({
  getProfile: {
    method: 'GET',
    path: '/user/profile',
    responses: {
      200: c.type<{ user: UserDto }>(),
      401: c.type<{ error: string }>(),
    },
  },
  updateProfile: {
    method: 'PUT',
    path: '/user/profile',
    body: c.type<{ name?: string; avatar?: string }>(),
    responses: {
      200: c.type<{ user: UserDto }>(),
    },
  },
})
```

### 6.5 环境变量 Env 类型定义

```typescript
// apps/api/src/env.ts
export interface Env {
  // Bindings
  DB: D1Database
  BUCKET: R2Bucket
  CACHE: KVNamespace
  PUBLISH_QUEUE: Queue<PublishJobData>
  AI_TASK_QUEUE: Queue<AiTaskJobData>
  REDLOCK: DurableObjectNamespace<import('./durables/redlock').RedLock>
  MCP_SESSION: DurableObjectNamespace

  // Secrets (wrangler secret put)
  JWT_SECRET: string
  INTERNAL_TOKEN: string
  COOKIE_SECRET: string
  RESEND_API_KEY: string
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string

  // AI
  OPENAI_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  DOUBAO_API_KEY?: string

  // OAuth
  YOUTUBE_CLIENT_ID?: string
  YOUTUBE_CLIENT_SECRET?: string
  FACEBOOK_APP_ID?: string
  FACEBOOK_APP_SECRET?: string
  TWITTER_CLIENT_ID?: string
  TWITTER_CLIENT_SECRET?: string
}
```

---

## 7. 成本估算

### Cloudflare 免费计划覆盖范围

| 服务 | 免费配额 | 你的用量预估 | 够用？ |
|------|---------|-------------|--------|
| Workers | 10 万请求/天, 10ms CPU | 初期 < 1 万/天 | ✅ |
| Pages | 500 次构建/月, 无限请求 | ✅ | ✅ |
| D1 | 500 万读行/天, 10 万写行/天, 5GB 存储 | 初期 < 10 万读/天 | ✅ |
| R2 | 10GB 存储, 100 万 A 类操作/月 | ✅ | ✅ |
| KV | 10 万读/天, 1000 写/天 | ✅ | ✅ |
| Queues | 100 万操作/月 | ✅ | ✅ |
| Durable Objects | 100 万请求/月 | ✅ | ✅ |

### 付费估算（月活 1000 用户）

| 服务 | 月费 |
|------|------|
| Workers (API) | ~$5-15 |
| Pages (前端) | $0 (免费) |
| D1 (数据库) | ~$5-10 |
| R2 (存储) | ~$1-5 |
| KV (缓存) | $0-5 |
| Queues | $0-5 |
| Durable Objects | $0-5 |
| **CF 总计** | **~$15-40/月** |

外部服务:
- Resend: $0 (3000 封/月免费) → $20/月 (5 万封)
- Twilio SMS: ~$0.0079/条 (按量)

**对比原架构 VPS + MongoDB Atlas + Redis 云服务: $50-100+/月**

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| **D1 10GB 单库上限** | 用户数据增长受限 | 按租户分库 / 定期归档 / 升级到 CF 付费计划 |
| **Workers 冷启动** | 首次请求慢 100-500ms | 合理设置 concurrency, 预热脚本 |
| **D1 并发查询限制** | 高峰期响应慢 | 合理索引, KV 缓存热数据, 读写分离 |
| **Queues 128KB 消息限制** | 大数据内容无法入队 | 消息体只传 ID, 从 D1/R2 拉取数据 |
| **Durable Objects 1000 rps** | 分布式锁高竞争场景 | 锁粒度细化, 多 DO 实例分片 |
| **Next.js → Pages 兼容性** | OpenNext 不支持某些 Next.js 特性 | 提前验证: API Routes, middleware, ISR |
| **SQLite vs MongoDB** | 文档型查询习惯改变 | Drizzle 查询构建器接近 SQL, 学习成本低 |
| **定时任务精度** | Cron Triggers 最小 1 分钟 | 可接受 (原 NestJS @Cron 也不是秒级) |
| **MCP 协议 Workers 限制** | SSE 长连接 CPU 时间限制 | DO 处理 MCP 会话, WebSocket 备选 |

---

## 附录: 首次启动命令速查

```bash
# 1. 安装依赖
pnpm install

# 2. 创建 CF 资源
npx wrangler d1 create aitoearn-db
npx wrangler r2 bucket create aitoearn-assets
npx wrangler kv namespace create aitoearn-cache
npx wrangler queues create publish-queue
npx wrangler queues create ai-task-queue

# 3. 生成数据库迁移
npx drizzle-kit generate
npx wrangler d1 migrations apply aitoearn-db --local  # 本地测试
npx wrangler d1 migrations apply aitoearn-db --remote # 生产

# 4. 设置密钥
npx wrangler secret put JWT_SECRET
npx wrangler secret put RESEND_API_KEY
# ... 其他密钥

# 5. 本地开发
pnpm --filter @app/api dev     # Workers 本地 (:8787)
pnpm --filter @app/web dev     # Next.js 本地 (:6060)

# 6. 部署
pnpm --filter @app/api deploy  # wrangler deploy
pnpm --filter @app/web deploy  # wrangler pages deploy
```
