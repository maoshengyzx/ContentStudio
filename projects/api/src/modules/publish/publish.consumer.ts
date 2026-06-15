import type { Env } from '../../env'
import type { PublishJobData } from '../../shared'
import { createDb } from '../../shared'
import { PublishService } from './publish.service'
import { bilibiliPublish } from '../platform/bilibili.service'
import { RelayService } from '../relay/relay.service'
import { accounts } from '../../shared'
import { eq } from 'drizzle-orm'

async function bilibiliRelayPublish(
  env: Env,
  accountId: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; workUrl?: string; platformWorkId?: string; error?: string }> {
  const db = createDb(env.DB)
  const relayService = new RelayService(db)

  const account = await db.select({
    accessToken: accounts.accessToken,
  }).from(accounts).where(eq(accounts.id, accountId)).get()

  const accessToken = account?.accessToken || ''

  const result = await relayService.bilibiliPublish(accessToken, {
    title: (params.title as string) || '',
    description: params.description as string | undefined,
    videoUrl: params.videoUrl as string | undefined,
  })

  const data = await result.json() as any
  return {
    success: data.code === 0 || data.success === true,
    workUrl: data.workUrl || data.data?.workUrl,
    platformWorkId: data.platformWorkId || data.data?.platformWorkId,
    error: data.message,
  }
}

const platformPublishers: Record<string, (accountId: string, params: Record<string, unknown>) => Promise<{ success: boolean; workUrl?: string; platformWorkId?: string; error?: string }>> = {
  bilibili: bilibiliPublish,
}

export default {
  async queue(batch: MessageBatch<PublishJobData>, env: Env) {
    const db = createDb(env.DB)
    const publishService = new PublishService(db, env)

    for (const msg of batch.messages) {
      const { recordId, platform, accountId, retryCount, maxRetries } = msg.body

      try {
        await publishService.markPublishing(recordId)

        let result: { success: boolean; workUrl?: string; platformWorkId?: string; error?: string }

        if (platform === 'bilibili' && env.BILIBILI_CLIENT_ID) {
          result = await bilibiliRelayPublish(env, accountId, msg.body.params)
        } else {
          const publisher = platformPublishers[platform]
          if (!publisher) {
            await publishService.markPublishFailed(recordId, `不支持的平台: ${platform}`)
            msg.ack()
            continue
          }

          const account = await db.select({
            accessToken: accounts.accessToken,
          }).from(accounts).where(eq(accounts.id, accountId)).get()

          const params = {
            ...msg.body.params,
            _accessToken: account?.accessToken || '',
          }

          result = await publisher(accountId, params)
        }

        if (result.success) {
          await publishService.markPublishSuccess(recordId, result.workUrl || '', result.platformWorkId)
          msg.ack()
        } else {
          if (retryCount + 1 < maxRetries) {
            await publishService.incrementRetry(recordId, retryCount)
            msg.retry({ delaySeconds: Math.pow(2, retryCount + 1) * 5 })
          } else {
            await publishService.markPublishFailed(recordId, result.error || '发布失败')
            msg.ack()
          }
        }
      } catch (err: any) {
        if (retryCount + 1 < maxRetries) {
          await publishService.incrementRetry(recordId, retryCount)
          msg.retry({ delaySeconds: Math.pow(2, retryCount + 1) * 5 })
        } else {
          await publishService.markPublishFailed(recordId, err.message || '未知错误')
          msg.ack()
        }
      }
    }
  },
}
