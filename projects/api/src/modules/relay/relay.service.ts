import type { DbClient } from '../../shared'
import { accounts } from '../../shared'
import { eq, and } from 'drizzle-orm'
import { uuid, now, jsonResponse, errorResponse } from '../../shared'

const BILIBILI_OAUTH_AUTHORIZE = 'https://member.bilibili.com/platform/login.html'
const BILIBILI_OAUTH_TOKEN = 'https://api.bilibili.com/x/account-oauth2/v1/token'
const BILIBILI_PUBLISH_URL = 'https://member.bilibili.com/x/vu/client/add'

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

export class RelayService {
  constructor(private db: DbClient) {}

  getBilibiliOAuthUrl(clientId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'all',
      state,
    })
    return `${BILIBILI_OAUTH_AUTHORIZE}?${params.toString()}`
  }

  async exchangeBilibiliToken(
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

  async saveBilibiliAccount(
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

    const existing = await this.db.select({ id: accounts.id }).from(accounts)
      .where(and(
        eq(accounts.userId, userId),
        eq(accounts.platform, platform),
        eq(accounts.platformUid, platformUid),
      ))
      .get()

    const ts = now()
    const tokenExpiresAt = ts + tokenData.expiresIn * 1000

    if (existing) {
      await this.db.update(accounts).set({
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokenExpiresAt,
        nickname: tokenData.name,
        avatar: tokenData.avatar || null,
        updatedAt: ts,
      }).where(eq(accounts.id, existing.id))

      return jsonResponse({ id: existing.id, platform, platformUid, nickname: tokenData.name, updated: true })
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

    return jsonResponse({ id, platform, platformUid, nickname: tokenData.name, created: true })
  }

  async bilibiliPublish(
    accessToken: string,
    params: {
      title: string
      description?: string
      videoUrl?: string
    },
  ) {
    const body: Record<string, unknown> = {
      access_key: accessToken,
      title: params.title,
      desc: params.description || '',
      copyright: 2,
      source: params.description || params.title,
      tid: 17,
      no_reprint: 1,
      open_elec: 0,
    }

    if (params.videoUrl) {
      body.videos = [{ title: params.title, filename: `mvp_${now()}.mp4`, desc: params.description || '' }]
    }

    try {
      const response = await fetch(BILIBILI_PUBLISH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(
          Object.fromEntries(
            Object.entries(body).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
          )
        ),
      })

      const data = await response.json() as any

      if (data.code === 0) {
        return jsonResponse({
          success: true,
          workUrl: `https://www.bilibili.com/video/av${data.data?.aid || ''}`,
          platformWorkId: String(data.data?.aid || ''),
        })
      }

      return errorResponse(`B站发布失败: ${data.message || JSON.stringify(data)}`, 502)
    } catch (err: any) {
      return errorResponse(`B站 API 调用异常: ${err.message}`, 502)
    }
  }
}
