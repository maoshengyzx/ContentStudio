# AiToEarn 项目总览

**Monetize · Publish · Engage · Create —— 一站式 AI 内容营销平台**

## 1. 项目简介

AiToEarn 是一个开源 AI 内容营销智能体平台，帮助 OPC（一人公司）、创作者、品牌与企业通过 AI Agent 自动化在全球主流社交媒体平台上构建、分发并变现内容。

核心定位：**Content Agent（内容智能体）** —— 每个 Agent 代表一位可配置、可持续工作的 AI 创作者，负责从内容创作到多渠道分发的完整闭环，而非仅生成内容。

- 🇨🇳 中国版：[aitoearn.cn](https://aitoearn.cn/)
- 🌍 国际版：[aitoearn.ai](https://aitoearn.ai/)
- 📖 开源仓库：[github.com/yikart/AiToEarn](https://github.com/yikart/AiToEarn)

---

## 2. 核心业务能力

| 能力 | 说明 |
|------|------|
| **💰 Monetize（变现）** | 内容交易市场，创作者出售内容完成商家推广任务。支持 CPS（按成交）、CPE（按互动）、CPM（按播放）三种结算。 |
| **📢 Publish（发布）** | 一键分发到全球 14 个主流平台，支持日历排期统一规划。 |
| **💬 Engage（互动）** | 浏览器插件实现自动化互动运营：点赞、收藏、关注、AI 智能回复、评论挖掘、品牌监测。 |
| **🎨 Create（创作）** | Agent 驱动的内容制作，支持视频生成（Grok/Veo/Seedance 等模型）、图文生成（Nano Banana 等）、批量并行创作。 |

### 支持平台

| 国内 | 国际 |
|------|------|
| 抖音、快手、B 站、小红书、视频号、微信公众号 | TikTok、YouTube、Facebook、Instagram、Threads、X（Twitter）、Pinterest、LinkedIn |

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       用户接入层                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  Web 前端     │  │  Electron    │  │  MCP / SSE / OpenClaw │  │
│  │  Next.js 14   │  │  桌面客户端   │  │  第三方 AI 工具集成    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬──────────┘   │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      后端服务层                                  │
│                                                                 │
│  ┌──────────────────────────────────────┐                      │
│  │       aitoearn-server (端口 3002)     │  NestJS              │
│  │       核心 API · 认证 · 内容管理 · 发布 │                      │
│  │       MCP 协议 · SSE 长连接            │                      │
│  └──────────────┬───────────────────────┘                      │
│                 │ 内部 API 调用                                  │
│  ┌──────────────▼───────────────────────┐                      │
│  │       aitoearn-ai (端口 3010)         │  NestJS              │
│  │       AI Agent 调度 · 内容生成 · 交互  │                      │
│  │       12 个 AI Skill                  │                      │
│  └──────────────────────────────────────┘                      │
│                                                                 │
│  共享库 (@yikart/*):                                            │
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

### 请求流向

1. **用户 → Web 前端**：Next.js SSR，`[lng]` 国际化路由
2. **前端 → 后端**：Next.js rewrites 将 `/api/*` 代理到 `aitoearn-server:3002`
3. **Server → AI**：`aitoearn-server` 通过内部 HTTP 调用 `aitoearn-ai:3010` 执行 AI 任务
4. **AI Agent 调度**：AI 任务进入 Bull 队列（Redis），由 12 个 Skill 并行处理
5. **MCP/SSE**：第三方 AI 工具直接连接 `aitoearn-server` 的 MCP/SSE 端点

---

## 4. 项目结构

```
AiToEarn/                              # 仓库根目录（无 package.json）
├── README.md                          # 用户面向文档（中文）
├── README_EN.md                       # 英文
├── README_JA.md                       # 日文
├── AGENTS.md                          # AI Agent 工作规则
├── CONTRIBUTING.md / CONTRIBUTING_CN.md
├── DOCKER_DEPLOYMENT_CN.md / DOCKER_DEPLOYMENT_EN.md
├── docker-compose.yml                 # Docker 一键部署
│
├── project/
│   ├── aitoearn-backend/              # 后端 Nx Monorepo（pnpm, Node 24）
│   │   ├── apps/
│   │   │   ├── aitoearn-server/       # 核心 API 服务（端口 3002）
│   │   │   └── aitoearn-ai/           # AI Agent 服务（端口 3010）
│   │   ├── libs/                      # 18 个共享库 (@yikart/*)
│   │   │   ├── aitoearn-ai-client/    # AI 服务客户端
│   │   │   ├── aitoearn-ai-shared/    # AI 共享类型/工具
│   │   │   ├── aitoearn-auth/         # 认证与鉴权
│   │   │   ├── aitoearn-queue/        # Bull 任务队列
│   │   │   ├── aitoearn-server-client/# Server API 客户端
│   │   │   ├── aitoearn-server-shared/# Server 共享类型
│   │   │   ├── ali-oss/               # 阿里云 OSS 存储
│   │   │   ├── ali-sms/               # 阿里云短信
│   │   │   ├── assets/                # 资产管理（S3/R2/OSS）
│   │   │   ├── aws-s3/                # AWS S3 存储
│   │   │   ├── channel-db/            # 渠道数据库操作
│   │   │   ├── common/                # 通用工具与配置加载
│   │   │   ├── helpers/               # 辅助工具函数
│   │   │   ├── mail/                  # 邮件服务
│   │   │   ├── mongodb/               # MongoDB 数据库操作
│   │   │   ├── nest-mcp/              # MCP 协议支持 (NestJS)
│   │   │   ├── redis/                 # Redis 操作
│   │   │   └── redlock/               # Redis 分布式锁
│   │   ├── nx.json                    # Nx 工作区配置
│   │   ├── pnpm-workspace.yaml        # pnpm 工作区
│   │   └── CLAUDE.md                  # Claude 工作规则
│   │
│   ├── aitoearn-web/                  # 前端（pnpm, Node LTS）
│   │   ├── src/
│   │   │   ├── app/[lng]/             # Next.js App Router（国际化路由）
│   │   │   │   ├── accounts/          # 账号管理（绑定/排期）
│   │   │   │   ├── draft-box/         # 草稿箱（AI 创作）
│   │   │   │   ├── ai-social/         # AI 社交（Agent 对话）
│   │   │   │   ├── chat/              # 聊天任务
│   │   │   │   ├── auth/              # 认证登录
│   │   │   │   ├── tasks-history/     # 任务历史
│   │   │   │   ├── agent-assets/      # Agent 资产管理
│   │   │   │   ├── brand-promotion/   # 品牌推广
│   │   │   │   └── websit/            # 官网页面（隐私政策等）
│   │   │   ├── components/            # 共享 UI 组件
│   │   │   ├── hooks/                 # 共享 Hooks
│   │   │   ├── lib/                   # 库函数
│   │   │   ├── store/                 # 状态管理
│   │   │   └── utils/                 # 工具函数
│   │   ├── public/                    # 静态资源（含 TinyMCE）
│   │   ├── next.config.mjs            # Next.js 配置（含 API 代理 rewrites）
│   │   ├── tailwind.config.ts         # Tailwind CSS v4
│   │   └── components.json            # shadcn/ui 配置
│   │
│   └── aitoearn-electron/             # Electron 桌面应用（独立项目）
│       ├── src/                       # React 渲染进程
│       ├── electron/                  # Electron 主进程
│       ├── server/                    # 本地服务端
│       └── build/                     # 构建资源
│
└── presentation/                      # 演示图片与截图
```

---

## 5. 技术栈

### 后端（Nx Monorepo）

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js 24 |
| 框架 | NestJS |
| 语言 | TypeScript |
| 构建工具 | Nx (Monorepo) |
| 包管理 | pnpm（严格 frozen-lockfile） |
| 数据库 | MongoDB（副本集模式） |
| 缓存 | Redis |
| 对象存储 | RustFS（S3 兼容）/ AWS S3 / Cloudflare R2 / 阿里云 OSS |
| 任务队列 | Bull（基于 Redis） |
| 认证 | JWT（access + refresh token） |
| 校验 | Zod（nest-typed-config） |
| 测试 | Vitest |
| 代码规范 | ESLint（no-console: error；禁止 InjectModel；禁止 Logger.staticMethod） |
| API 协议 | REST · MCP（Model Context Protocol）· SSE（Server-Sent Events） |

### 前端

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js LTS |
| 框架 | Next.js 14（App Router） |
| 语言 | TypeScript |
| 包管理 | pnpm |
| UI 库 | shadcn/ui（new-york 风格）+ Ant Design |
| 样式 | Tailwind CSS v4（CSS 变量驱动主题） |
| 国际化 | react-i18next + locize（`[lng]` 路由） |
| 状态管理 | Zustand |
| 富文本 | TinyMCE |
| 代码规范 | ESLint · Prettier（semi: false, singleQuote: true, trailingComma: es5） |
| 测试 | Playwright（E2E） |

### 桌面端

| 类别 | 技术 |
|------|------|
| 框架 | Electron |
| 渲染进程 | React + TypeScript |
| 构建 | Vite |
| 数据库 | SQLite（better-sqlite3） |

---

## 6. 核心设计

### 6.1 后端模块边界

- 共享库通过 `@yikart/*` 命名空间导入，模块边界由 `@nx/enforce-module-boundaries` 强制执行
- `.service.ts` 文件禁止直接使用 `InjectModel`，必须通过 Repository 模式访问数据库
- Logger 必须创建实例使用，禁止静态方法调用
- 配置通过 `select-config.util.ts` 加载，使用 `commander` 解析 `-c` 参数指定配置文件，`nest-typed-config` + Zod 校验

### 6.2 AI Agent Skill 系统

`aitoearn-ai` 包含 12 个独立 Skill，每个 Skill 负责一类 AI 能力：

1. analyzing-videos — 视频分析
2. composing-videos — 视频合成
3. crawling-social-media — 社交媒体数据抓取
4. editing-images — 图片编辑
5. editing-videos — 视频编辑
6. extracting-thumbnails — 缩略图提取
7. generating-drama-recaps — 剧集摘要生成
8. generating-images — 图片生成
9. generating-videos — 视频生成
10. managing-content — 内容管理
11. removing-subtitles — 字幕移除
12. transferring-video-styles — 视频风格迁移

### 6.3 前端 API 代理

开发模式下，Next.js 通过 `rewrites` 将 `/api/*` 请求代理到后端：

```js
// next.config.mjs
rewrites: async () => {
  const rewrites = []
  if (process.env.NEXT_PUBLIC_PROXY_URL) {
    rewrites.push({
      source: '/api/:path*',
      destination: `${process.env.NEXT_PUBLIC_PROXY_URL}/api/:path*`,
    })
  }
  return rewrites
}
```

设置环境变量 `NEXT_PUBLIC_PROXY_URL=http://localhost:3002` 即可启用。

### 6.4 双环境部署

| 环境 | 域名 | MCP 地址 | SSE 地址 | Relay URL |
|------|------|----------|----------|-----------|
| 中国版 | `aitoearn.cn` | `https://aitoearn.cn/api/unified/mcp` | `https://aitoearn.cn/api/unified/sse` | `https://aitoearn.cn/api` |
| 国际版 | `aitoearn.ai` | `https://aitoearn.ai/api/unified/mcp` | `https://aitoearn.ai/api/unified/sse` | `https://aitoearn.ai/api` |

⚠️ API Key 与环境必须匹配，否则返回 401。

---

## 7. 开发环境搭建

### 前置条件

- Node.js 24（后端）/ Node.js LTS（前端）
- pnpm
- Docker Desktop 或 Docker Engine
- Git

### 快速启动（源码开发模式）

```bash
# 1. 克隆仓库
git clone https://github.com/yikart/AiToEarn.git
cd AiToEarn

# 2. 启动基础设施（MongoDB、Redis、RustFS）
docker compose up -d mongodb redis rustfs
docker compose up -d mongodb-rs-init           # 初始化 MongoDB 副本集

# 3. 启动后端
cd project/aitoearn-backend
pnpm install --frozen-lockfile

# 配置本地环境
cp apps/aitoearn-server/config/config.js apps/aitoearn-server/config/local.config.js
cp apps/aitoearn-ai/config/config.js apps/aitoearn-ai/config/local.config.js

# 设置环境变量（根据 local.config.js 中的变量）
export MONGODB_URI="mongodb://localhost:27017/aitoearn?replicaSet=rs0"
export REDIS_RUL="redis://localhost:6379"
export JWT_SECRET="local-dev-secret"
export INTERNAL_TOKEN="local-internal-token"
export ASSETS_CONFIG='{"region":"us-east-1","bucketName":"aitoearn","endpoint":"http://localhost:9001","accessKeyId":"rustfsadmin","secretAccessKey":"rustfsadmin","forcePathStyle":true}'
# ... 其他平台 OAuth 环境变量（开发时设为空字符串）

pnpm nx serve aitoearn-server     # 端口 3002，含调试器（:9229）

# 4. 启动前端（新终端）
cd project/aitoearn-web
pnpm install --frozen-lockfile
NEXT_PUBLIC_PROXY_URL=http://localhost:3002 pnpm run dev   # 默认端口 6060（被占用时自动递增）

# 5. 访问
# 浏览器打开 http://localhost:6060/en/
```

### 常用命令

| 目的 | 命令 |
|------|------|
| 后端 Lint | `pnpm nx run-many --target=lint` |
| 后端测试 | `pnpm nx run-many --target=test` |
| 前端开发 | `pnpm run dev` |
| 前端类型检查 | `pnpm run type-check` |
| 前端构建 | `pnpm build` |
| 前端 E2E 测试 | `pnpm test` |
| Docker 部署 | `docker compose up -d` |
| 停止 Docker | `docker compose down` |

---

## 8. CI / CD

| 检查 | 触发条件 | 内容 |
|------|----------|------|
| `backen-check.yml` | 后端 PR | lint + build |
| `web-check.yml` | 前端 PR | build（仅构建，ESLint 步骤已注释） |

PR 标题强制 [Conventional Commits](https://www.conventionalcommits.org/) 格式：`<type>(<scope>): <description>`。

Nx Cloud 用于缓存加速（ID `68a45c67c639875b4be60423`），CI 中通过 `NX_NO_CLOUD=true` 禁用。

---

## 9. 文档规范

- 三语同步：`README.md`（中）、`README_EN.md`（英）、`README_JA.md`（日）
- Docker 部署同步：`DOCKER_DEPLOYMENT_CN.md` + `DOCKER_DEPLOYMENT_EN.md`
- README 只写当前能力与环境规则，不写开发/测试环境、验证日期等来源信息
- 涉及用户可见能力、安装、OpenClaw、MCP、Relay、API Key、环境地址时需同步更新三语 README

---

## 10. 联系方式

- GitHub Issues：[github.com/yikart/AiToEarn/issues](https://github.com/yikart/AiToEarn/issues)
- Telegram：[t.me/harryyyy2025](https://t.me/harryyyy2025)
- 官方文档：[docs.aitoearn.ai](https://docs.aitoearn.ai/)
