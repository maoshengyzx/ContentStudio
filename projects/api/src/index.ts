import { Hono } from 'hono'
import type { Env } from './env'
import { createAppConfig } from './config'
import { createAuthRoutes } from './modules/auth/auth.routes'
import { AuthService } from './modules/auth/auth.service'
import { createDb } from './shared'
import { createAccountRoutes } from './modules/account/account.routes'
import { createPublishRoutes } from './modules/publish/publish.routes'
import { createCreditRoutes } from './modules/credit/credit.routes'
import { createFileRoutes } from './modules/file/file.routes'
import { errorResponse } from './shared'
import { createBilibiliRoutes } from './platforms/bilibili'
import { createDouyinRoutes } from './platforms/douyin'
import type { PublishJobData } from './shared'
import {
  createAuthMiddleware,
  tryInternalAuth,
  corsMiddleware,
  requestLogger,
} from './middlewares'
import { queue as consumerQueue } from './modules/publish/publish.consumer'

async function createApp(env: Env) {
  const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  // ---- 全局中间件 ----
  app.use('*', corsMiddleware)
  app.use('*', requestLogger())

  // ---- 配置 & 数据库 & 认证服务 ----
  const cfg = createAppConfig(env)
  const db = createDb(env.DB)
  const authService = new AuthService(db, cfg.auth)
  const authMiddleware = createAuthMiddleware(authService)

  // ---- /auth 路由（公开 + JWT 保护） ----
  app.route('/auth', createAuthRoutes(cfg.auth))

  // ---- /api 路由（需认证：JWT 或 x-api-key 或 Internal Token） ----
  const api = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  api.use('*', tryInternalAuth(cfg.auth.internalToken))
  api.use('*', authMiddleware)

  api.route('/accounts', createAccountRoutes())
  api.route('/publish', createPublishRoutes(cfg.publish, cfg.platforms.douyin))
  api.route('/credit', createCreditRoutes())
  api.route('/files', createFileRoutes())

  app.route('/api', api)

  // ---- /platforms 路由（OAuth 流程 + 内部发布端点） ----
  app.route('/platforms', createBilibiliRoutes(cfg.platforms.bilibili, cfg.auth.internalToken))
  app.route('/platforms', createDouyinRoutes(cfg.platforms.douyin, cfg.auth.internalToken))

  // ---- 健康检查 & 错误处理 ----
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
  app.notFound((c) => errorResponse(`Not Found: ${c.req.method} ${c.req.path}`, 404))
  app.onError((err, c) => {
    console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err)
    return errorResponse(err.message || 'Internal Server Error', 500)
  })

  return app
}

export { createApp }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = await createApp(env)
    return app.fetch(request, env, ctx)
  },
  async queue(batch: MessageBatch<PublishJobData>, env: Env): Promise<void> {
    await consumerQueue(batch, env)
  },
}
