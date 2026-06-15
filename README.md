# mvp-slim

> 基于 [AiToEarn](https://github.com) 架构理念，完全运行在 Cloudflare 原生服务上的多平台内容分发 SaaS MVP。
> 对照文档：[CLOUDFLARE_REWRITE_PLAN.md](D:/StudyApps/Code/maosheng/AiToEarn/CLOUDFLARE_REWRITE_PLAN.md)

---

## 1. 项目定位

将原 AiToEarn（NestJS + MongoDB + Redis + VPS）重写为纯 Cloudflare 架构（Hono + D1 + R2 + Queues），以降低运维成本并按模块分批交付。

| 对比维度 | AiToEarn (旧) | mvp-slim (新) |
|----------|---------------|---------------|
| 后端框架 | NestJS | Hono v4 |
| 数据库 | MongoDB (Mongoose) | D1 / SQLite (Drizzle ORM) |
| 缓存 / 锁 | Redis (BullMQ / Redlock) | Cloudflare Queues / KV |
| 对象存储 | S3 / OSS | R2 |
| 前端 | Next.js 14 | React 18 + Vite (SPA) |
| 认证 | JWT + API Key | 自签名 JWT (Web Crypto) + API Key |
| 运行环境 | VPS (Node.js) | Cloudflare Workers |
| 包管理 | pnpm | npm (workspaces) |
| 成本 | $50-100+/月 | $0-15/月 (免费计划内) |

---

## 2. 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| Runtime | Cloudflare Workers (wrangler v4) | 边缘计算，全球部署 |
| 后端框架 | Hono v4 | 轻量 Web 框架，兼容 Web Standard |
| 数据库 | D1 (SQLite) + Drizzle ORM v0.39 | 关系型，事务支持 |
| 文件存储 | R2 | S3 兼容，免费 10GB |
| 消息队列 | Cloudflare Queues | 异步任务解耦 |
| 参数校验 | Zod + `@hono/zod-validator` | 类型安全校验 |
| 前端框架 | React 18 + Vite 6 | SPA，Tailwind CSS v4 |
| 状态管理 | Zustand v5 | 轻量全局状态 |
| 路由 | react-router-dom v6 | 前端路由 |
| 认证 | 自签名 JWT (HS256, Web Crypto) | 无第三方 JWT 库 |
| Monorepo | npm workspaces | 轻量，无额外工具 |

---

## 3. 架构概览

```
                          ┌──────────────────────┐
                          │   Cloudflare DNS     │
                          └──────┬───────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
     ┌────▼─────┐          ┌────▼─────┐          ┌─────▼────┐
     │ @mvp/api │          │ @mvp/ai  │          │ @mvp/web │
     │ :8787    │          │ Worker   │          │ :5173    │
     │ Hono API │          │ (skeleton│          │ Vite SPA │
     └────┬─────┘          │  )       │          └──────────┘
          │                └──────────┘
    ┌─────┼─────────────────────────────┐
    │     │  Cloudflare Bindings        │
    │     │                              │
    │  ┌──▼──────┐  ┌────────┐  ┌──────┐│
    │  │ D1 (DB) │  │ R2     │  │Queue ││
    │  │ 主数据库 │  │ 文件存储│  │发布队列││
    │  └─────────┘  └────────┘  └──────┘│
    └──────────────────────────────────┘
```

**服务清单**：

| 服务 | 包名 | 端口 | 状态 |
|------|------|------|------|
| API Worker | `@mvp/api` | 8787 | ✅ 运行中（认证 / 账号 / 发布 / 积分 / 文件） |
| AI Worker | `@mvp/ai` | — | 🟡 骨架（健康检查 + 空 Queue 消费） |
| Web 前端 | `@mvp/web` | 5173 | ✅ 运行中（登录 / 工作台 / 发布 / 账号 / 设置） |
| 共享库 | `@mvp/shared` | — | ✅（DB / Schema / Utils / Types） |

---

## 4. 项目结构

```
mvp-slim/
├── apps/
│   ├── api/                          # @mvp/api — Hono Workers 后端
│   │   ├── wrangler.toml             #   Cloudflare 绑定配置
│   │   ├── tsconfig.json
│   │   ├── .dev.vars                 #   本地密钥（JWT_SECRET 等）
│   │   └── src/
│   │       ├── index.ts              #   主入口：路由挂载 + 中间件
│   │       ├── env.ts                #   Env 类型定义（扩展 shared Env）
│   │       └── modules/
│   │           ├── auth/             #   认证：注册 / 登录 / API Key
│   │           ├── account/          #   平台账号绑定
│   │           ├── publish/          #   发布任务 + Queue 消费
│   │           ├── credit/           #   积分：余额 / 充值 / 扣减
│   │           ├── file/             #   文件上传（R2）
│   │           └── platform/
│   │               └── bilibili.service.ts  # 仅 B站 实现
│   │
│   ├── ai/                           # @mvp/ai — AI Worker（骨架）
│   │   ├── wrangler.toml
│   │   └── src/index.ts              #   /health + 空 Queue 消费
│   │
│   └── web/                          # @mvp/web — React SPA 前端
│       ├── vite.config.ts            #   Vite 配置 + API 代理
│       ├── tsconfig.json
│       └── src/
│           ├── main.tsx              #   应用入口
│           ├── App.tsx               #   路由守卫
│           ├── lib/api.ts            #   API 客户端
│           ├── store/auth.ts         #   Zustand 认证状态
│           ├── components/Layout.tsx #   侧边栏 + 顶栏布局
│           └── pages/
│               ├── Login.tsx         #   登录 / 注册
│               ├── Dashboard.tsx     #   工作台（数据看板）
│               ├── Publish.tsx       #   内容发布
│               ├── Accounts.tsx      #   账号管理
│               └── Settings.tsx      #   设置
│
├── packages/
│   └── shared/                       # @mvp/shared — 共享库
│       ├── package.json              #   exports: ./src/index.ts
│       ├── tsconfig.json
│       ├── drizzle.config.ts         #   Drizzle Kit 迁移配置
│       ├── migrations/               #   SQL 迁移文件
│       └── src/
│           ├── index.ts              #   统一导出
│           ├── db/
│           │   ├── index.ts          #   createDb() 工厂
│           │   └── schema.ts         #   Drizzle 表定义
│           ├── schemas.ts            #   Zod 校验 Schema
│           ├── utils.ts              #   UUID / SHA1 / 响应封装
│           ├── constants.ts          #   平台 / 状态 / 积分类型
│           └── types.ts              #   Env / PublishJobData 类型
│
├── package.json                      # 根 npm workspaces 配置
└── tsconfig.base.json                # 基础 TS 配置
```

---

## 5. 功能模块 & 实现状态

### ✅ 已完成

| 模块 | 内容 | 对应原计划 Phase |
|------|------|-----------------|
| **认证** | 邮箱注册/登录、JWT 生成验证、API Key 管理、Internal Token | Phase 1 |
| **账号** | 9 个平台的账号绑定/更新/查询/删除 | Phase 2 |
| **发布** | 发布任务创建、幂等检测(flowId)、立即发布队列、失败重试(指数退避)、发布记录 | Phase 2 |
| **队列** | Queues 生产者 + 消费者，仅 B站 平台实现 | Phase 2 |
| **积分** | 余额查询、充值、扣减、退款、变动日志 | Phase 2 |
| **文件** | R2 上传/下载/删除 | Phase 1 |
| **前端** | 登录/注册、工作台看板、发布页面、账号管理、设置页 | Phase 4 |
| **数据库** | 5 张核心表 + 迁移 | Phase 1 |
| **Monorepo** | npm workspaces + 共享包 | Phase 1 |

### 🟡 骨架 / 待完善

| 模块 | 现状 | 对应原计划 |
|------|------|-----------|
| **AI Worker** | 仅 `/health` + 空 Queue 消费，无实际 AI 逻辑 | Phase 3 |
| **多平台发布** | 仅 B站 实现，其余 8 个平台 schema 已声明 | Phase 2 |
| **定时发布** | 仅支持立即发布（30s 内），无 Cron Trigger | Phase 2 / 5 |

### ❌ 尚未开始

| 模块 | 对应原计划 Phase |
|------|-----------------|
| AI 系统（Agent / Skills / 定价 / 结算） | Phase 3 |
| MCP 协议（`@hono/mcp`） | Phase 5 |
| Durable Objects 分布式锁 | Phase 5 |
| KV 缓存 | Phase 2 |
| 邮件 / 短信通知 | Phase 2 |
| 内容草稿 / 素材管理 | Phase 2 |
| 互动记录 / 数据分析 | Phase 2 |
| Workers Cron Triggers（定时任务） | Phase 5 |
| 测试（单元/集成/E2E） | Phase 6 |
| CI/CD（GitHub Actions） | Phase 1 |

---

## 6. API 端点

> 响应格式：`{ code: number, data: T | null, message?: string }`，code=0 成功。
> 所有 `/api/*` 接口需认证（Bearer JWT 或 x-api-key）。

### Auth

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/auth/register` | 无 | 邮箱注册 |
| POST | `/auth/login` | 无 | 登录，返回 7 天有效期 JWT |
| GET | `/auth/profile` | Bearer | 当前用户信息 |
| POST | `/auth/api-key` | Bearer | 创建 API Key |
| GET | `/auth/api-key` | Bearer | API Key 列表 |
| DELETE | `/auth/api-key/:id` | Bearer | 删除 API Key |

### Account

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/accounts` | 绑定平台账号（重复则更新） |
| GET | `/api/accounts` | 列表，支持 `?platform=` 筛选 |
| GET | `/api/accounts/:id` | 详情 |
| PUT | `/api/accounts/:id` | 更新 |
| DELETE | `/api/accounts/:id` | 删除 |

### Publish

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/publish` | 创建发布任务（支持 `flowId` 幂等） |
| GET | `/api/publish` | 列表，支持 `?status=` 筛选 |
| GET | `/api/publish/:id` | 详情 |

内容类型：`video` / `imgText` / `article`

### Credit

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/credit/balance` | 余额查询 |
| POST | `/api/credit/recharge` | 充值 |
| POST | `/api/credit/deduct` | 扣减（不足返回 402） |
| GET | `/api/credit/logs` | 变动日志 |

### File

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/api/files/upload` | 上传到 R2 |
| GET | `/api/files/:key` | 下载（永久缓存） |
| DELETE | `/api/files/:key` | 删除 |

### Health

| 方法 | 路径 | 服务 |
|------|------|------|
| GET | `/health` | API / AI 通用健康检查 |

---

## 7. 数据库

**主键**：UUID（`crypto.randomUUID()`）
**时间戳**：Unix 毫秒（`Date.now()`）
**密码**：HMAC-SHA256 + 随机盐（非 bcrypt）

| 表 | 说明 | 核心字段 |
|----|------|----------|
| `users` | 用户 | email(UNIQUE), password_hash, salt, name, credits, status |
| `api_keys` | API 密钥 | user_id, key_hash(UNIQUE, SHA-1), name |
| `accounts` | 平台账号 | user_id, platform, platform_uid, access_token, refresh_token |
| `publish_records` | 发布记录 | user_id, account_id, platform, type, status, retry_count, publish_time |
| `credit_logs` | 积分日志 | user_id, type, amount, balance_before, balance_after |

- `accounts` 唯一约束：`(user_id, platform, platform_uid)`
- 迁移文件位于 `packages/shared/migrations/`，共享给所有 Worker

---

## 8. 发布流程

```
POST /api/publish
  ├── flowId 存在? → 幂等检测，重复返回 409
  ├── 创建 publish_records 行 (status: waiting)
  └── publishTime 在 30s 内?
        ├── 是 → 立即入队 PUBLISH_QUEUE (status: queued)
        └── 否 → 等待定时调度 (status: waiting, 待 Cron 实现)

Queues Consumer (publish.consumer.ts)
  ├── 读取 account access_token
  ├── 调用平台发布 SDK
  │     ├── 成功 → status: published, 记录 work_url
  │     └── 失败 → 指数退避重试
  │           ├── retryCount < maxRetries → msg.retry(delay: 2^(n+1) × 5s)
  │           └── 达到上限 → status: failed
  └── msg.ack()
```

**已实现的平台发布**：仅 B站（`member.bilibili.com` API）

---

## 9. 快速开始

### 前置条件

- Node.js 18+
- npm 9+
- Cloudflare 账号

### 本地开发

```bash
# 安装依赖
npm install

# 初始化本地 D1 数据库
cd packages/shared
npx drizzle-kit generate          # 生成迁移文件
cd ../..
npx wrangler d1 migrations apply mvp-db --local   # 应用到本地 D1

# 启动所有服务
npm run dev:api      # API Worker → http://localhost:8787
npm run dev:web      # Web 前端  → http://localhost:5173
npm run dev:ai       # AI Worker (待开发)
```

### 环境变量

| 变量 | 必需 | 位置 | 说明 |
|------|------|------|------|
| `JWT_SECRET` | ✅ | `apps/api/.dev.vars` | JWT 签名密钥 |
| `INTERNAL_TOKEN` | ✅ | `apps/api/.dev.vars` | 内部服务令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | 远程 | env / CI | drizzle-kit 远程迁移 |
| `CLOUDFLARE_D1_ID` | 远程 | env / CI | 同上 |
| `CLOUDFLARE_API_TOKEN` | 远程 | env / CI | 同上 |
| `BILIBILI_CLIENT_ID` | 可选 | `apps/api/.dev.vars` | B站 OAuth |
| `BILIBILI_CLIENT_SECRET` | 可选 | `apps/api/.dev.vars` | B站 OAuth |

### 远程部署

```bash
npx wrangler d1 migrations apply mvp-db --remote
npx wrangler secret put JWT_SECRET
npx wrangler secret put INTERNAL_TOKEN
npm -w @mvp/api run deploy
```

---

## 10. 架构差异说明

与原始 `CLOUDFLARE_REWRITE_PLAN.md` 的主要偏差：

| 项目 | 原计划 | mvp-slim 实际 | 原因 |
|------|--------|--------------|------|
| 前端 | Next.js 14 + OpenNext | React 18 + Vite SPA | SPA 更简单，无需处理 Pages SSR 兼容 |
| 包管理 | pnpm | npm | 避免 WSL 跨文件系统符号链接问题 |
| 认证 JWT | `hono/jwt` 官方库 | 自实现（Web Crypto） | 减少依赖，灵活性更高 |
| 密码 | bcrypt/argon2 | HMAC-SHA256 | Web Crypto 原生支持，无额外 C++ 依赖 |
| 模块组织 | `app/<name>/` | `modules/<name>/` | 结构扁平化 |
| RPC 共享 | Hono RPC Client | `@mvp/shared` 源码直引 | MVP 阶段简化 |

---

## 11. 下一步计划

按优先级排列，对应原计划 Phase：

| 优先级 | 功能 | 对应 Phase |
|--------|------|-----------|
| P0 | 补充其余平台发布实现（YouTube/TikTok/Twitter 等） | Phase 2 |
| P0 | 补充测试（Vitest + miniflare） | Phase 6 |
| P1 | 定时发布调度（Workers Cron Triggers） | Phase 5 |
| P1 | AI Worker 核心逻辑（模型调用 / SSE 流式） | Phase 3 |
| P2 | 积分与 AI 定价结算联动 | Phase 3 |
| P2 | KV 缓存热数据 | Phase 2 |
| P3 | MCP 协议支持 | Phase 5 |
| P3 | Durable Objects 分布式锁 | Phase 5 |
