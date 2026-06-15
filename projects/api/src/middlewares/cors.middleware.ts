import { cors } from 'hono/cors'

/**
 * CORS 中间件 — 允许所有来源，预置常用方法和请求头。
 */
export const corsMiddleware = cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  exposeHeaders: ['x-request-id'],
  maxAge: 86400,
})
