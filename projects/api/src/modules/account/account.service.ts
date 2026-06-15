import type { DbClient } from '../../shared'
import { accounts } from '../../shared'
import { eq, and, sql } from 'drizzle-orm'
import { uuid, now, jsonResponse, errorResponse, paginatedResponse } from '../../shared'

export class AccountService {
  constructor(private db: DbClient) {}

  async createAccount(userId: string, data: {
    platform: string
    platformUid: string
    nickname: string
    avatar?: string
    accessToken: string
    refreshToken?: string
  }) {
    const existing = await this.db.select({ id: accounts.id }).from(accounts)
      .where(and(
        eq(accounts.userId, userId),
        eq(accounts.platform, data.platform),
        eq(accounts.platformUid, data.platformUid),
      ))
      .get()

    if (existing) {
      return this.updateAccount(userId, existing.id, {
        nickname: data.nickname,
        avatar: data.avatar,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      })
    }

    const id = uuid()
    const ts = now()
    await this.db.insert(accounts).values({
      id,
      userId,
      platform: data.platform,
      platformUid: data.platformUid,
      nickname: data.nickname,
      avatar: data.avatar,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      createdAt: ts,
      updatedAt: ts,
    })

    return jsonResponse({ id, platform: data.platform, platformUid: data.platformUid, nickname: data.nickname })
  }

  async updateAccount(userId: string, accountId: string, data: {
    nickname?: string
    avatar?: string
    accessToken?: string
    refreshToken?: string
  }) {
    const account = await this.db.select().from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .get()

    if (!account) return errorResponse('账号不存在', 404)

    const updateData: Record<string, unknown> = { updatedAt: now() }
    if (data.nickname !== undefined) updateData.nickname = data.nickname
    if (data.avatar !== undefined) updateData.avatar = data.avatar
    if (data.accessToken !== undefined) updateData.accessToken = data.accessToken
    if (data.refreshToken !== undefined) updateData.refreshToken = data.refreshToken

    await this.db.update(accounts).set(updateData)
      .where(eq(accounts.id, accountId))

    return jsonResponse({ id: accountId, ...data })
  }

  async getAccount(userId: string, accountId: string) {
    const account = await this.db.select().from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .get()

    if (!account) return errorResponse('账号不存在', 404)
    return jsonResponse(account)
  }

  async listAccounts(userId: string, platform?: string, page = 1, pageSize = 20) {
    const whereCond = platform
      ? and(eq(accounts.userId, userId), eq(accounts.platform, platform))
      : eq(accounts.userId, userId)

    const totalResult = await this.db.select({ count: sql<number>`count(*)` }).from(accounts)
      .where(whereCond).get()
    const total = totalResult?.count || 0

    const list = await this.db.select().from(accounts)
      .where(whereCond)
      .limit(pageSize).offset((page - 1) * pageSize)
      .orderBy(accounts.createdAt).all()

    return paginatedResponse(list, total, page, pageSize)
  }

  async deleteAccount(userId: string, accountId: string) {
    await this.db.delete(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))

    return jsonResponse({ success: true })
  }
}
