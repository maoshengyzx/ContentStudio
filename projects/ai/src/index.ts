import { Hono } from 'hono'
import { createDb } from '../../api/src/shared'
import type { Env } from '../../api/src/shared'

interface AiEnv extends Env {
  AI_QUEUE: Queue<any>
  OPENAI_API_KEY?: string
  DOUBAO_API_KEY?: string
}

const app = new Hono<{ Bindings: AiEnv }>()

app.get('/health', (c) => c.json({ service: 'ai', status: 'ok', timestamp: Date.now() }))

export default {
  async fetch(request: Request, env: AiEnv, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx)
  },

  async queue(batch: MessageBatch<any>, env: AiEnv) {
    const db = createDb(env.DB)
    console.log(`[AI Worker] Processing ${batch.messages.length} messages`)
    for (const msg of batch.messages) {
      console.log(`[AI Worker] Task: ${JSON.stringify(msg.body)}`)
      msg.ack()
    }
  },
}
