import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../../env'
import { createDb } from '../../shared'
import { CreditService } from './credit.service'
import { creditAddSchema, creditDeductSchema, paginationSchema } from '../../shared'

export function createCreditRoutes() {
  const credit = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  const getService = (c: any) => new CreditService(createDb(c.env.DB))

  credit.get('/balance', async (c) => {
    const service = getService(c)
    return service.getBalance(c.get('userId'))
  })

  credit.get('/logs', zValidator('query', paginationSchema), async (c) => {
    const { page, pageSize } = c.req.valid('query')
    const service = getService(c)
    return service.getCreditLogs(c.get('userId'), page, pageSize)
  })

  credit.post('/recharge', zValidator('json', creditAddSchema), async (c) => {
    const body = c.req.valid('json')
    const service = getService(c)
    return service.addCredits(c.get('userId'), body.amount, body.type, body.description)
  })

  credit.post('/deduct', zValidator('json', creditDeductSchema), async (c) => {
    const body = c.req.valid('json')
    const service = getService(c)
    try {
      return await service.deductCredits(c.get('userId'), body.amount, body.type, body.description, body.metadata)
    } catch (e: any) {
      return new Response(JSON.stringify({ code: 402, message: e.message, data: null }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  })

  return credit
}
