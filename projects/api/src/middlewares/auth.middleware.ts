import type { Context } from 'hono'
import type { Env } from '../env'
import type { AuthService } from '../modules/auth/auth.service'
import { jsonResponse } from '../shared'

/**
 * JWT Bearer Token 或 x-api-key 认证中间件。
 * 优先检查 x-api-key 请求头，其次检查 Authorization: Bearer <token>。
 */
export function createAuthMiddleware(authService: AuthService) {
  return async (c: Context<{ Bindings: Env; Variables: { userId: string } }>, next: () => Promise<void>) => {
    const apiKey = c.req.header('x-api-key')
    if (apiKey) {
      const userId = await authService.validateApiKey(apiKey)
      if (userId) {
        c.set('userId', userId)
        return next()
      }
      return jsonResponse({ code: 401, message: 'Invalid API Key', data: null }, 401)
    }

    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ code: 401, message: '未登录', data: null }, 401)
    }

    const token = authHeader.slice(7)
    const payload = await authService.verifyToken(token)
    if (!payload) {
      return jsonResponse({ code: 401, message: 'Token 无效或已过期', data: null }, 401)
    }

    c.set('userId', payload.userId)
    return next()
  }
}
