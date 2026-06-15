import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import { createAuthRoutes } from './modules/auth/auth.routes'
import { AuthService, createAuthMiddleware } from './modules/auth/auth.service'
import { createDb } from './shared'
import { createAccountRoutes } from './modules/account/account.routes'
import { createPublishRoutes } from './modules/publish/publish.routes'
import { createCreditRoutes } from './modules/credit/credit.routes'
import { createFileRoutes } from './modules/file/file.routes'
import { errorResponse } from './shared'
import { createRelayRoutes } from './modules/relay/relay.routes'
import { default as publishConsumer } from './modules/publish/publish.consumer'

async function createApp(env: Env) {
  const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    exposeHeaders: ['x-request-id'],
    maxAge: 86400,
  }))

  app.use('*', async (c, next) => {
    const start = Date.now()
    c.res.headers.set('x-request-id', crypto.randomUUID())
    await next()
    const ms = Date.now() - start
    if (ms > 1000) console.log(`[SLOW] ${c.req.method} ${c.req.path} ${ms}ms`)
  })

  const db = createDb(env.DB)
  const authService = new AuthService(db, env.JWT_SECRET)
  const authMiddleware = createAuthMiddleware(authService)

  app.route('/auth', createAuthRoutes(env.JWT_SECRET))

  const api = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  api.use('*', authMiddleware)

  api.use('*', async (c, next) => {
    const auth = c.req.header('Authorization')
    if (auth?.startsWith('Internal ')) {
      if (auth.slice(9) === env.INTERNAL_TOKEN) {
        c.set('userId', 'internal')
        return next()
      }
    }
    return next()
  })

  api.route('/accounts', createAccountRoutes())
  api.route('/publish', createPublishRoutes())
  api.route('/credit', createCreditRoutes())
  api.route('/files', createFileRoutes())

  app.route('/api', api)
  app.route('/relay', createRelayRoutes())

  app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
  app.notFound((c) => errorResponse(`Not Found: ${c.req.method} ${c.req.path}`, 404))
  app.onError((err, c) => {
    console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err)
    return errorResponse(err.message || 'Internal Server Error', 500)
  })

  return app
}

export { createApp }
export const queue = publishConsumer.queue

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = await createApp(env)
    return app.fetch(request, env, ctx)
  },
}
