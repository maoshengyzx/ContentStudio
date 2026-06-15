import { Hono } from 'hono'
import type { Env } from '../../env'
import { FileService } from './file.service'
import { uuid } from '../../shared'

export function createFileRoutes() {
  const file = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  const getService = (c: any) => new FileService(c.env.BUCKET)

  file.put('/upload', async (c) => {
    const contentType = c.req.header('Content-Type') || 'application/octet-stream'
    const ext = contentType.includes('video') ? 'mp4' : contentType.includes('image') ? 'png' : 'bin'
    const key = `${c.get('userId')}/${uuid()}.${ext}`

    const body = await c.req.arrayBuffer()
    const service = getService(c)
    const result = await service.putObject(key, body, contentType)

    return Response.json({
      code: 0,
      data: { key: result.key, size: result.size, url: `/files/${result.key}` },
    })
  })

  file.get('/:key', async (c) => {
    const service = getService(c)
    const result = await service.getObject(c.req.param('key'))
    if (!result) return new Response('Not Found', { status: 404 })

    return new Response(result.body, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.size),
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  })

  file.delete('/:key', async (c) => {
    const service = getService(c)
    await service.deleteObject(c.req.param('key'))
    return Response.json({ code: 0, data: null })
  })

  return file
}
