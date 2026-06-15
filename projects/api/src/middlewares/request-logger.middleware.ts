import type { Context } from 'hono'
import type { Env } from '../env'

/**
 * 请求日志中间件 — 注入 x-request-id 并对耗时 > 1s 的请求输出 [SLOW] 日志。
 */
export function requestLogger() {
  return async (c: Context<{ Bindings: Env; Variables: { userId: string } }>, next: () => Promise<void>) => {
    const start = Date.now()
    c.res.headers.set('x-request-id', crypto.randomUUID())
    await next()
    const ms = Date.now() - start
    if (ms > 1000) console.log(`[SLOW] ${c.req.method} ${c.req.path} ${ms}ms`)
  }
}
