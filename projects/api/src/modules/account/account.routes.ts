import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { Env } from '../../env'
import { createDb } from '../../shared'
import { AccountService } from './account.service'
import { createAccountSchema, updateAccountSchema, idSchema } from '../../shared'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  platform: z.string().optional(),
})

export function createAccountRoutes() {
  const account = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  const getService = (c: any) => new AccountService(createDb(c.env.DB))

  account.post('/', zValidator('json', createAccountSchema), async (c) => {
    const body = c.req.valid('json')
    const service = getService(c)
    return service.createAccount(c.get('userId'), body)
  })

  account.put('/:id', zValidator('json', updateAccountSchema), async (c) => {
    const body = c.req.valid('json')
    const service = getService(c)
    return service.updateAccount(c.get('userId'), c.req.param('id'), body)
  })

  account.get('/:id', async (c) => {
    const service = getService(c)
    return service.getAccount(c.get('userId'), c.req.param('id'))
  })

  account.get('/', zValidator('query', querySchema), async (c) => {
    const { page, pageSize, platform } = c.req.valid('query')
    const service = getService(c)
    return service.listAccounts(c.get('userId'), platform, page, pageSize)
  })

  account.delete('/:id', async (c) => {
    const service = getService(c)
    return service.deleteAccount(c.get('userId'), c.req.param('id'))
  })

  return account
}
