import type { Context } from 'hono'
import type { Env } from '../env'
import { errorResponse } from '../shared'

/**
 * Internal 服务间认证中间件 — 必须提供有效 Internal Token，否则返回 401。
 * 用于内部发布端点等仅允许服务间调用的路由。
 */
export function requireInternalAuth(internalToken: string) {
  return async (c: Context<{ Bindings: Env; Variables: { userId: string } }>, next: () => Promise<void>) => {
    const auth = c.req.header('Authorization')
    if (!auth?.startsWith('Internal ')) {
      return errorResponse('Unauthorized', 401)
    }
    if (auth.slice(9) !== internalToken) {
      return errorResponse('Invalid Internal Token', 401)
    }
    c.set('userId', 'internal')
    return next()
  }
}

/**
 * 可选的 Internal 认证 — 如果请求携带有效 Internal Token，则设置 userId='internal'；
 * 否则透传到下一个中间件（例如 JWT 认证）。
 */
export function tryInternalAuth(internalToken: string) {
  return async (c: Context<{ Bindings: Env; Variables: { userId: string } }>, next: () => Promise<void>) => {
    const auth = c.req.header('Authorization')
    if (auth?.startsWith('Internal ') && auth.slice(9) === internalToken) {
      c.set('userId', 'internal')
    }
    return next()
  }
}
