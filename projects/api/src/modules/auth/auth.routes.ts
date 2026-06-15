import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../../env'
import type { AuthConfig } from '../../config'
import { createDb } from '../../shared'
import { AuthService } from './auth.service'
import { createAuthMiddleware } from '../../middlewares'
import {
  registerSchema, loginSchema, createApiKeySchema, changePasswordSchema,
  idSchema,
} from '../../shared'
import { errorResponse } from '../../shared'

export function createAuthRoutes(config: AuthConfig) {
  const auth = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  const getService = (c: any) => new AuthService(createDb(c.env.DB), config)

  auth.post('/register', zValidator('json', registerSchema), async (c) => {
    const body = c.req.valid('json')
    const service = getService(c)
    return service.register(body.email, body.password, body.name)
  })

  auth.post('/login', zValidator('json', loginSchema), async (c) => {
    const body = c.req.valid('json')
    const service = getService(c)
    return service.login(body.email, body.password)
  })

  const authenticated = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  authenticated.use('*', (c, next) => {
    const service = getService(c)
    return createAuthMiddleware(service)(c, next)
  })

  authenticated.get('/profile', async (c) => {
    const service = getService(c)
    const payload = await service.verifyToken(
      c.req.header('Authorization')!.slice(7),
    )
    return Response.json({
      code: 0,
      data: { userId: c.get('userId'), email: payload?.email },
    })
  })

  authenticated.post('/api-key', zValidator('json', createApiKeySchema), async (c) => {
    const body = c.req.valid('json')
    const service = getService(c)
    return service.createApiKey(c.get('userId'), body.name)
  })

  authenticated.get('/api-key', async (c) => {
    const service = getService(c)
    return service.listApiKeys(c.get('userId'))
  })

  authenticated.delete('/api-key/:id', zValidator('param', idSchema), async (c) => {
    const service = getService(c)
    return service.deleteApiKey(c.get('userId'), c.req.param('id'))
  })

  auth.route('/', authenticated)
  return auth
}
