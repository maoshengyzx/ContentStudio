import type { DbClient } from '../../shared'
import { accounts } from '../../shared'
import { eq, and } from 'drizzle-orm'
import { uuid, now, jsonResponse } from '../../shared'

const DOUYIN_OAUTH_AUTHORIZE = 'https://open.douyin.com/platform/oauth/connect'
const DOUYIN_OAUTH_TOKEN = 'https://open.douyin.com/oauth/access_token/'
const DOUYIN_OAUTH_REFRESH = 'https://open.douyin.com/oauth/refresh_token/'
const DOUYIN_USER_INFO = 'https://open.douyin.com/oauth/userinfo/'

/** Token 剩余有效期 < 10 分钟时自动刷新 */
const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000

export interface DouyinTokenResponse {
  message: string
  data?: {
    access_token: string
    refresh_token: string
    expires_in: number
    open_id: string
    scope?: string
  }
}

interface DouyinUserInfo {
  data: {
    open_id: string
    nickname: string
    avatar: string
    union_id?: string
  }
}

export class DouyinOAuthService {
  constructor(private db: DbClient) {}

  /** 构造抖音 OAuth 授权跳转 URL */
  getOAuthUrl(clientKey: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: 'code',
      scope: 'user_info,data.external.user',
      redirect_uri: redirectUri,
      state,
    })
    return `${DOUYIN_OAUTH_AUTHORIZE}?${params.toString()}`
  }

  /** 用授权码换取 access_token */
  async exchangeToken(
    clientKey: string,
    clientSecret: string,
    code: string,
  ): Promise<DouyinTokenResponse> {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    })

    const res = await fetch(DOUYIN_OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    return res.json() as Promise<DouyinTokenResponse>
  }

  /** 获取抖音用户信息 */
  async getUserInfo(accessToken: string, openId: string): Promise<DouyinUserInfo | null> {
    try {
      const body = new URLSearchParams({ access_token: accessToken, open_id: openId })
      const res = await fetch(DOUYIN_USER_INFO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      const data = await res.json()
      if ((data as any).data?.error_code && (data as any).data.error_code !== 0) return null
      return data as DouyinUserInfo
    } catch {
      return null
    }
  }

  /** 将抖音授权信息保存（或更新）到 accounts 表 */
  async saveAccount(
    userId: string,
    tokenData: {
      accessToken: string
      refreshToken: string
      expiresIn: number
      openId: string
      name: string
      avatar?: string
    },
  ) {
    const platform = 'douyin'
    const platformUid = tokenData.openId

    const existing = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.platform, platform),
          eq(accounts.platformUid, platformUid),
        ),
      )
      .get()

    const ts = now()
    const tokenExpiresAt = ts + tokenData.expiresIn * 1000

    if (existing) {
      await this.db
        .update(accounts)
        .set({
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          tokenExpiresAt,
          nickname: tokenData.name,
          avatar: tokenData.avatar || null,
          updatedAt: ts,
        })
        .where(eq(accounts.id, existing.id))

      return jsonResponse({
        id: existing.id,
        platform,
        platformUid,
        nickname: tokenData.name,
        updated: true,
      })
    }

    const id = uuid()
    await this.db.insert(accounts).values({
      id,
      userId,
      platform,
      platformUid,
      nickname: tokenData.name,
      avatar: tokenData.avatar || null,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      tokenExpiresAt,
      createdAt: ts,
      updatedAt: ts,
    })

    return jsonResponse({
      id,
      platform,
      platformUid,
      nickname: tokenData.name,
      created: true,
    })
  }

  // =====================================================================
  // Token 管理与自动刷新
  // =====================================================================

  async getAccountAccessToken(
    accountId: string,
    clientKey: string,
    clientSecret: string,
  ): Promise<string> {
    const account = await this.db
      .select({
        accessToken: accounts.accessToken,
        refreshToken: accounts.refreshToken,
        tokenExpiresAt: accounts.tokenExpiresAt,
      })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .get()

    if (!account || !account.accessToken) {
      throw new Error(`抖音账号不存在或未授权: ${accountId}`)
    }

    const remaining = (account.tokenExpiresAt || 0) - now()
    if (remaining > TOKEN_REFRESH_THRESHOLD_MS) {
      return account.accessToken
    }

    if (!account.refreshToken) {
      throw new Error(`抖音 token 已过期且无 refresh_token，请重新授权: ${accountId}`)
    }

    return this.refreshAccessToken(accountId, account.refreshToken, clientKey, clientSecret)
  }

  async refreshAccessToken(
    accountId: string,
    refreshToken: string,
    clientKey: string,
    clientSecret: string,
  ): Promise<string> {
    const body = new URLSearchParams({
      client_key: clientKey,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })

    const res = await fetch(DOUYIN_OAUTH_REFRESH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const data = (await res.json()) as DouyinTokenResponse

    if (data.message !== 'success' || !data.data) {
      throw new Error(`抖音 token 刷新失败: ${data.message}`)
    }

    const ts = now()
    await this.db
      .update(accounts)
      .set({
        accessToken: data.data.access_token,
        refreshToken: data.data.refresh_token,
        tokenExpiresAt: ts + data.data.expires_in * 1000,
        updatedAt: ts,
      })
      .where(eq(accounts.id, accountId))

    return data.data.access_token
  }
}
