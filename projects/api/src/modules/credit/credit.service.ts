import type { DbClient } from '../../shared'
import { users, creditLogs } from '../../shared'
import { eq, sql } from 'drizzle-orm'
import { uuid, now, jsonResponse, errorResponse } from '../../shared'

export class CreditService {
  constructor(private db: DbClient) {}

  async getBalance(userId: string) {
    const user = await this.db.select({ credits: users.credits }).from(users)
      .where(eq(users.id, userId)).get()

    if (!user) return errorResponse('用户不存在', 404)
    return jsonResponse({ credits: user.credits })
  }

  async addCredits(userId: string, amount: number, type: string, description?: string) {
    const user = await this.db.select({ credits: users.credits }).from(users)
      .where(eq(users.id, userId)).get()
    if (!user) throw new Error('用户不存在')

    const balanceBefore = user.credits
    const balanceAfter = balanceBefore + amount
    const ts = now()
    const logId = uuid()

    await this.db.batch([
      this.db.update(users).set({ credits: balanceAfter, updatedAt: ts })
        .where(eq(users.id, userId)),
      this.db.insert(creditLogs).values({
        id: logId, userId, type, amount,
        balanceBefore, balanceAfter,
        description: description || null,
        createdAt: ts,
      }),
    ])

    return jsonResponse({ credits: balanceAfter, added: amount })
  }

  async deductCredits(userId: string, amount: number, type: string, description?: string, metadata?: Record<string, unknown>) {
    const user = await this.db.select({ credits: users.credits }).from(users)
      .where(eq(users.id, userId)).get()
    if (!user) throw new Error('用户不存在')

    if (user.credits < amount) throw new Error('积分不足')

    const balanceBefore = user.credits
    const balanceAfter = balanceBefore - amount
    const ts = now()
    const logId = uuid()

    await this.db.batch([
      this.db.update(users).set({ credits: balanceAfter, updatedAt: ts })
        .where(eq(users.id, userId)),
      this.db.insert(creditLogs).values({
        id: logId, userId, type, amount: -amount,
        balanceBefore, balanceAfter,
        description: description || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdAt: ts,
      }),
    ])

    return jsonResponse({ credits: balanceAfter, deducted: amount })
  }

  async refundCredits(userId: string, amount: number, description?: string) {
    return this.addCredits(userId, amount, 'refund', description || '任务失败退款')
  }

  async getCreditLogs(userId: string, page = 1, pageSize = 20) {
    const countResult = await this.db.select({ count: sql<number>`count(*)` }).from(creditLogs)
      .where(eq(creditLogs.userId, userId)).get()
    const total = countResult?.count || 0

    const list = await this.db.select().from(creditLogs)
      .where(eq(creditLogs.userId, userId))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .orderBy(creditLogs.createdAt)
      .all()

    return Response.json({
      code: 0,
      data: { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    })
  }
}
