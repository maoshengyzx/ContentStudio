import type { DbClient } from '../../shared'
import { accounts } from '../../shared'
import { eq, and } from 'drizzle-orm'
import { uuid, now, jsonResponse } from '../../shared'

const BILIBILI_OAUTH_AUTHORIZE = 'https://member.bilibili.com/platform/login.html'
const BILIBILI_OAUTH_TOKEN = 'https://api.bilibili.com/x/account-oauth2/v1/token'

export interface BilibiliTokenResponse {
  code: number
  data?: {
    access_token: string
    refresh_token: string
    expires_in: number
    token_info?: { mid: string; name: string; avatar: string }
  }
  message?: string
}

export class BilibiliOAuthService {
  constructor(private db: DbClient) {}

  /** 构造 B站 OAuth 授权跳转 URL */
  getOAuthUrl(clientId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'all',
      state,
    })
    return `${BILIBILI_OAUTH_AUTHORIZE}?${params.toString()}`
  }

  /** 用授权码换取 access_token */
  async exchangeToken(
    clientId: string,
    clientSecret: string,
    code: string,
  ): Promise<BilibiliTokenResponse> {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
    })

    const res = await fetch(BILIBILI_OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    return res.json() as Promise<BilibiliTokenResponse>
  }

  /** 将 B站授权信息保存（或更新）到 accounts 表 */
  async saveAccount(
    userId: string,
    tokenData: {
      accessToken: string
      refreshToken: string
      expiresIn: number
      mid: string
      name: string
      avatar?: string
    },
  ) {
    const platform = 'bilibili'
    const platformUid = tokenData.mid

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
}
