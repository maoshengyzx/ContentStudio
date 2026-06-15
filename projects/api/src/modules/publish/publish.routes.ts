import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../../env'
import { createDb } from '../../shared'
import { PublishService } from './publish.service'
import { createPublishSchema, idSchema, paginationSchema } from '../../shared'

export function createPublishRoutes() {
  const publish = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  const getService = (c: any) => new PublishService(createDb(c.env.DB), c.env)

  publish.post('/', zValidator('json', createPublishSchema), async (c) => {
    const body = c.req.valid('json')
    const service = getService(c)
    return service.createPublishTask(c.get('userId'), body)
  })

  publish.get('/:id', zValidator('param', idSchema), async (c) => {
    const service = getService(c)
    return service.getPublishRecord(c.get('userId'), c.req.param('id'))
  })

  publish.get('/', zValidator('query', paginationSchema), async (c) => {
    const { page, pageSize } = c.req.valid('query')
    const status = c.req.query('status')
    const service = getService(c)
    return service.listPublishRecords(c.get('userId'), status, page, pageSize)
  })

  return publish
}
