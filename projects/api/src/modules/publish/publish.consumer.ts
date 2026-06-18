import type { Env } from '../../env'
import type { PublishJobData } from '../../shared'
import { createAppConfig } from '../../config'
import { createDb, accounts } from '../../shared'
import { PublishService } from './publish.service'
import { bilibiliPublish, BilibiliOAuthService } from '../../platforms/bilibili'
import { douyinPublish } from '../../platforms/douyin'
import { eq } from 'drizzle-orm'

const platformPublishers: Record<string, (accountId: string, params: Record<string, unknown>) => Promise<{ success: boolean; workUrl?: string; platformWorkId?: string; error?: string }>> = {}

export async function queue(batch: MessageBatch<PublishJobData>, env: Env) {
  const db = createDb(env.DB)
  const cfg = createAppConfig(env)
  const publishService = new PublishService(db, cfg.publish, env.PUBLISH_QUEUE, cfg.platforms.douyin)
  const oauthService = new BilibiliOAuthService(db)

  for (const msg of batch.messages) {
    const { recordId, platform, accountId, retryCount, maxRetries } = msg.body

    try {
      await publishService.markPublishing(recordId)

      let result: { success: boolean; workUrl?: string; platformWorkId?: string; error?: string }

      if (platform === 'bilibili') {
        // 通过 oauth service 获取有效 token（自动刷新过期 token）
        let accessToken: string
        try {
          accessToken = await oauthService.getAccountAccessToken(
            accountId,
            cfg.platforms.bilibili.clientId,
            cfg.platforms.bilibili.clientSecret,
          )
        } catch {
          // Token 获取失败（可能未授权），回退到直接从 account 读取
          const account = await db
            .select({ accessToken: accounts.accessToken })
            .from(accounts)
            .where(eq(accounts.id, accountId))
            .get()
          accessToken = account?.accessToken || ''
        }

        result = await bilibiliPublish(accessToken, {
          title: (msg.body.params.title as string) || '',
          description: msg.body.params.description as string | undefined,
          videoUrl: msg.body.params.videoUrl as string | undefined,
          coverUrl: msg.body.params.coverUrl as string | undefined,
          tags: msg.body.params.tags as string[] | undefined,
          tid: msg.body.params.tid as number | undefined,
          copyright: msg.body.params.copyright as number | undefined,
        }, {
          clientId: cfg.platforms.bilibili.clientId,
          clientSecret: cfg.platforms.bilibili.clientSecret,
        })
      } else if (platform === 'douyin') {
        // douyinPublish 返回 { permalink, shareId } 而不是 { workUrl, platformWorkId }，做映射
        const douyinRes = await douyinPublish({
          title: (msg.body.params.title as string) || '',
          description: msg.body.params.description as string | undefined,
          videoUrl: msg.body.params.videoUrl as string | undefined,
          imageUrls: msg.body.params.imageUrls as string[] | undefined,
          topics: msg.body.params.topics as string[] | undefined,
        }, {
          clientId: cfg.platforms.douyin.clientId,
          clientSecret: cfg.platforms.douyin.clientSecret,
        })
        result = {
          success: douyinRes.success,
          workUrl: douyinRes.permalink,
          platformWorkId: douyinRes.shareId,
          error: douyinRes.error,
        }
      } else {
        const publisher = platformPublishers[platform]
        if (!publisher) {
          await publishService.markPublishFailed(recordId, `不支持的平台: ${platform}`)
          msg.ack()
          continue
        }

        const account = await db
          .select({ accessToken: accounts.accessToken })
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .get()

        const params = {
          ...msg.body.params,
          _accessToken: account?.accessToken || '',
        }

        result = await publisher(accountId, params)
      }

      if (result.success) {
        await publishService.markPublishSuccess(
          recordId,
          result.workUrl || '',
          result.platformWorkId,
        )
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
}
