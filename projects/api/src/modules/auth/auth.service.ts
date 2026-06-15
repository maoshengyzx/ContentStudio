import type { DbClient } from '../../shared'
import type { AuthConfig } from '../../config'
import { users, apiKeys } from '../../shared'
import { eq, and } from 'drizzle-orm'
import { uuid, now, sha1, errorResponse, jsonResponse } from '../../shared'

export interface JwtPayload {
  userId: string
  email: string
  iat: number
  exp: number
}

export class AuthService {
  constructor(
    private db: DbClient,
    private config: AuthConfig,
  ) {}

  async register(email: string, password: string, name?: string) {
    const existing = await this.db.select({ id: users.id }).from(users)
      .where(eq(users.email, email))
      .get()

    if (existing) return errorResponse('邮箱已注册', 409)

    const salt = crypto.randomUUID()
    const passwordHash = await this.hashPassword(password, salt)

    const id = uuid()
    const ts = now()
    await this.db.insert(users).values({
      id,
      email,
      passwordHash,
      salt,
      name: name || email.split('@')[0],
      createdAt: ts,
      updatedAt: ts,
    })

    const token = await this.generateToken(id, email)
    return jsonResponse({ token, user: { id, email, name: name || email.split('@')[0] } })
  }

  async login(email: string, password: string) {
    const user = await this.db.select().from(users)
      .where(eq(users.email, email))
      .get()

    if (!user) return errorResponse('邮箱或密码错误', 401)

    if (user.status !== 'active') return errorResponse('账号已被禁用', 403)

    const hash = await this.hashPassword(password, user.salt)
    if (hash !== user.passwordHash) return errorResponse('邮箱或密码错误', 401)

    const token = await this.generateToken(user.id, user.email)
    return jsonResponse({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
    })
  }

  async createApiKey(userId: string, name: string) {
    const raw = `ak_${uuid().replace(/-/g, '')}${uuid().replace(/-/g, '').slice(0, 16)}`
    const hash = await sha1(raw)

    const id = uuid()
    const ts = now()
    await this.db.insert(apiKeys).values({
      id,
      userId,
      name,
      keyHash: hash,
      createdAt: ts,
      updatedAt: ts,
    })

    return jsonResponse({ id, name, apiKey: raw, createdAt: ts })
  }

  async validateApiKey(rawKey: string): Promise<string | null> {
    const hash = await sha1(rawKey)
    const record = await this.db.select().from(apiKeys)
      .where(eq(apiKeys.keyHash, hash))
      .get()

    if (!record) return null

    await this.db.update(apiKeys)
      .set({ lastUsedAt: now() })
      .where(eq(apiKeys.id, record.id))

    return record.userId
  }

  async listApiKeys(userId: string) {
    const list = await this.db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    }).from(apiKeys).where(eq(apiKeys.userId, userId)).all()

    return jsonResponse(list)
  }

  async deleteApiKey(userId: string, keyId: string) {
    await this.db.delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))

    return jsonResponse({ success: true })
  }

  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      const key = await this.importKey(this.config.jwtSecret)
      const payload = await crypto.subtle.verify(
        { name: 'HMAC', hash: 'SHA-256' },
        key,
        Uint8Array.from(atob(token.split('.')[2]), (c) => c.charCodeAt(0)),
        new TextEncoder().encode(token.split('.').slice(0, 2).join('.')),
      )
      if (!payload) return null
      const body = JSON.parse(atob(token.split('.')[1]))
      if (body.exp < Math.floor(Date.now() / 1000)) return null
      return body as JwtPayload
    } catch {
      return null
    }
  }

  private async generateToken(userId: string, email: string): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' }
    const now_ = Math.floor(Date.now() / 1000)
    const payload: JwtPayload = {
      userId,
      email,
      iat: now_,
      exp: now_ + 7 * 24 * 3600,
    }

    const encodedHeader = btoa(JSON.stringify(header))
    const encodedPayload = btoa(JSON.stringify(payload))
    const signingInput = `${encodedHeader}.${encodedPayload}`

    const key = await this.importKey(this.config.jwtSecret)
    const signature = await crypto.subtle.sign(
      { name: 'HMAC', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(signingInput),
    )

    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    return `${signingInput}.${sig}`
  }

  private async hashPassword(password: string, salt: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(password))
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private async importKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
    )
  }
}
