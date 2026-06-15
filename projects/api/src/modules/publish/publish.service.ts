import type { DbClient } from '../../shared'
import { publishRecords, accounts } from '../../shared'
import { eq, and, sql } from 'drizzle-orm'
import { uuid, now, jsonResponse, errorResponse, paginatedResponse } from '../../shared'
import { IMMEDIATE_PUBLISH_TOLERANCE_MS, PUBLISH_STATUS } from '../../shared'
import type { Env } from '../../env'
import type { PublishJobData } from '../../shared'

export class PublishService {
  constructor(
    private db: DbClient,
    private env: Env,
  ) {}

  async createPublishTask(
    userId: string,
    data: {
      accountId: string
      type: string
      title: string
      description?: string
      topics?: string[]
      videoUrl?: string
      coverUrl?: string
      imageUrls?: string[]
      publishTime?: number
      flowId?: string
    },
  ) {
    if (data.flowId) {
      const existing = await this.db.select({ id: publishRecords.id }).from(publishRecords)
        .where(and(eq(publishRecords.flowId, data.flowId), eq(publishRecords.userId, userId)))
        .get()
      if (existing) return errorResponse('重复提交 (flowId)', 409)
    }

    const platform = await this.getAccountPlatform(data.accountId)
    if (!platform) return errorResponse('账号不存在', 404)

    const recordId = uuid()
    const queueId = `publish:${platform}:${recordId}`
    const ts = now()
    const effectivePublishTime = data.publishTime || ts

    await this.db.insert(publishRecords).values({
      id: recordId,
      userId,
      accountId: data.accountId,
      platform,
      flowId: data.flowId || null,
      type: data.type,
      title: data.title,
      description: data.description || null,
      topics: data.topics?.length ? JSON.stringify(data.topics) : null,
      videoUrl: data.videoUrl || null,
      coverUrl: data.coverUrl || null,
      imageUrls: data.imageUrls?.length ? JSON.stringify(data.imageUrls) : null,
      publishTime: effectivePublishTime,
      status: PUBLISH_STATUS.WAITING,
      createdAt: ts,
      updatedAt: ts,
    })

    const isImmediate = Math.abs(effectivePublishTime - ts) <= IMMEDIATE_PUBLISH_TOLERANCE_MS

    if (isImmediate) {
      await this.enqueuePublish(recordId, platform, data.accountId, 3, data)
      return jsonResponse({ id: recordId, queueId, status: PUBLISH_STATUS.QUEUED, immediate: true })
    }

    return jsonResponse({ id: recordId, queueId, status: PUBLISH_STATUS.WAITING, immediate: false, publishTime: effectivePublishTime })
  }

  async enqueuePublish(
    recordId: string,
    platform: string,
    accountId: string,
    maxRetries: number,
    params: Record<string, unknown>,
  ) {
    const jobData: PublishJobData = {
      recordId,
      platform,
      accountId,
      retryCount: 0,
      maxRetries,
      params,
    }

    const msg = await this.env.PUBLISH_QUEUE.send(jobData) as any
    const msgId = msg?.id || `${recordId}-${now()}`

    await this.db.update(publishRecords)
      .set({ status: PUBLISH_STATUS.QUEUED, queueMessageId: msgId, updatedAt: now() })
      .where(eq(publishRecords.id, recordId))

    return msgId
  }

  async getPublishRecord(userId: string, recordId: string) {
    const record = await this.db.select().from(publishRecords)
      .where(and(eq(publishRecords.id, recordId), eq(publishRecords.userId, userId)))
      .get()

    if (!record) return errorResponse('记录不存在', 404)
    return jsonResponse(record)
  }

  async listPublishRecords(userId: string, status?: string, page = 1, pageSize = 20) {
    const whereCond = status
      ? and(eq(publishRecords.userId, userId), eq(publishRecords.status, status))
      : eq(publishRecords.userId, userId)

    const totalResult = await this.db.select({ count: sql<number>`count(*)` }).from(publishRecords)
      .where(whereCond).get()
    const total = totalResult?.count || 0

    const list = await this.db.select().from(publishRecords)
      .where(whereCond)
      .limit(pageSize).offset((page - 1) * pageSize)
      .orderBy(publishRecords.createdAt).all()

    return paginatedResponse(list, total, page, pageSize)
  }

  async markPublishFailed(recordId: string, error: string) {
    await this.db.update(publishRecords).set({
      status: PUBLISH_STATUS.FAILED,
      errorMessage: error,
      updatedAt: now(),
    }).where(eq(publishRecords.id, recordId))
  }

  async markPublishSuccess(recordId: string, workUrl: string, platformWorkId?: string) {
    await this.db.update(publishRecords).set({
      status: PUBLISH_STATUS.PUBLISHED,
      workUrl,
      platformWorkId: platformWorkId || null,
      updatedAt: now(),
    }).where(eq(publishRecords.id, recordId))
  }

  async markPublishing(recordId: string) {
    await this.db.update(publishRecords).set({
      status: PUBLISH_STATUS.PUBLISHING,
      updatedAt: now(),
    }).where(eq(publishRecords.id, recordId))
  }

  async shouldRetry(record: typeof publishRecords.$inferSelect): Promise<boolean> {
    return record.retryCount < record.maxRetries
  }

  async incrementRetry(recordId: string, currentCount: number) {
    await this.db.update(publishRecords).set({
      retryCount: currentCount + 1,
      updatedAt: now(),
    }).where(eq(publishRecords.id, recordId))
  }

  private async getAccountPlatform(accountId: string): Promise<string | null> {
    const account = await this.db.select({ platform: accounts.platform }).from(accounts)
      .where(eq(accounts.id, accountId)).get()
    return account?.platform || null
  }
}
