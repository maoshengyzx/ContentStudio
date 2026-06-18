import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type { Env } from '../../env'
import type { BilibiliConfig } from '../../config'
import { createDb, accounts, publishRecords, errorResponse, jsonResponse } from '../../shared'
import { PUBLISH_STATUS } from '../../shared'
import { requireInternalAuth } from '../../middlewares'
import { BilibiliOAuthService } from './bilibili.oauth'
import { bilibiliPublish } from './bilibili.publisher'

/**
 * B站平台路由工厂 — OAuth 授权流程 + 内部发布端点 + Webhook 回调。
 * 挂载点：/platforms
 *
 * @param config B站平台配置（clientId, clientSecret, redirectUri）
 * @param internalToken 内部认证令牌
 */
export function createBilibiliRoutes(config: BilibiliConfig, internalToken: string) {
  const bilibili = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  const getOAuthService = (c: any) => new BilibiliOAuthService(createDb(c.env.DB))

  // ---------------------------------------------------------------------------
  // OAuth 授权流程
  // ---------------------------------------------------------------------------

  bilibili.get('/bilibili/oauth/authorize', (c) => {
    if (!config.clientId) return errorResponse('BILIBILI_CLIENT_ID not configured', 500)

    const redirectUri =
      config.redirectUri ||
      `${new URL(c.req.url).origin}/platforms/bilibili/oauth/callback`

    const userId = c.req.query('userId') || ''
    const statePayload = encodeURIComponent(
      JSON.stringify({ state: crypto.randomUUID(), userId, redirectUri }),
    )

    const service = getOAuthService(c)
    const url = service.getOAuthUrl(config.clientId, redirectUri, statePayload)
    return c.redirect(url)
  })

  bilibili.get('/bilibili/oauth/callback', async (c) => {
    const code = c.req.query('code')
    const stateParam = c.req.query('state')
    if (!code) return errorResponse('Missing authorization code', 400)

    let userId = 'internal'
    let redirectUri = `${new URL(c.req.url).origin}`
    if (stateParam) {
      try {
        const stateData = JSON.parse(decodeURIComponent(stateParam))
        if (stateData.userId) userId = stateData.userId
        if (stateData.redirectUri) redirectUri = stateData.redirectUri
      } catch {
        /* ignore malformed state */
      }
    }

    if (!config.clientId || !config.clientSecret) return errorResponse('B站凭据未配置', 500)

    const service = getOAuthService(c)
    const tokenRes = await service.exchangeToken(config.clientId, config.clientSecret, code)
    if (tokenRes.code !== 0 || !tokenRes.data) {
      return errorResponse(`B站授权失败: ${tokenRes.message || '未知错误'}`, 502)
    }

    const tokenInfo = tokenRes.data.token_info
    const mid = tokenInfo?.mid || ''
    const name = tokenInfo?.name || `B站用户_${mid}`

    const result = await service.saveAccount(userId, {
      accessToken: tokenRes.data.access_token,
      refreshToken: tokenRes.data.refresh_token,
      expiresIn: tokenRes.data.expires_in,
      mid,
      name,
      avatar: tokenInfo?.avatar,
    })

    const resultData = (await result.json()) as any
    const returnUrl = new URL(redirectUri)
    returnUrl.searchParams.set('relay_callback', '1')
    returnUrl.searchParams.set('account_id', resultData.id || '')
    returnUrl.searchParams.set('platform', 'bilibili')
    returnUrl.searchParams.set('nickname', name)
    return c.redirect(returnUrl.toString())
  })

  // ---------------------------------------------------------------------------
  // 内部发布端点（服务间调用，需 Internal Token）
  // 支持通过 accountId 自动获取/刷新 token
  // ---------------------------------------------------------------------------

  bilibili.post(
    '/bilibili/publish',
    requireInternalAuth(internalToken),
    async (c) => {
      const body = await c.req.json<{
        accessToken?: string
        accountId?: string
        title: string
        description?: string
        videoUrl?: string
        coverUrl?: string
        tags?: string[]
        tid?: number
        copyright?: number
      }>()

      if (!body.title) return errorResponse('title is required', 400)

      const db = createDb(c.env.DB)
      const oauthService = new BilibiliOAuthService(db)

      let accessToken = body.accessToken
      let resolvedAccountId = body.accountId

      if (!accessToken && resolvedAccountId) {
        // 通过 accountId 自动获取/刷新 token
        try {
          accessToken = await oauthService.getAccountAccessToken(
            resolvedAccountId,
            config.clientId,
            config.clientSecret,
          )
        } catch (err: any) {
          return errorResponse(err.message, 401)
        }
      }

      if (!accessToken) return errorResponse('accessToken or accountId required', 400)
      if (!config.clientId || !config.clientSecret) {
        return errorResponse('B站 clientId/clientSecret 未配置', 500)
      }

      const result = await bilibiliPublish(accessToken, {
        title: body.title,
        description: body.description,
        videoUrl: body.videoUrl,
        coverUrl: body.coverUrl,
        tags: body.tags,
        tid: body.tid,
        copyright: body.copyright,
      }, { clientId: config.clientId, clientSecret: config.clientSecret })

      if (!result.success) return errorResponse(result.error || '发布失败', 502)
      return jsonResponse(result)
    },
  )

  // ---------------------------------------------------------------------------
  // Webhook 回调端点（B站审核结果通知）
  // ---------------------------------------------------------------------------

  bilibili.post('/bilibili/webhooks', async (c) => {
    const body = await c.req.json<{
      event?: string
      content?: { share_id?: string; video_id?: string }
      from_user_id?: string
    }>()

    if (!body.content?.video_id) {
      return jsonResponse({ code: 0, message: 'ignored' })
    }

    const db = createDb(c.env.DB)
    const videoId = body.content.video_id
    const shareId = body.content.share_id

    // 尝试通过 share_id 匹配发布记录（share_id 在 platformWorkId 中）
    if (shareId) {
      // 查找 platformWorkId 包含该 share_id 的、状态为 publishing 的记录
      const records = await db
        .select()
        .from(publishRecords)
        .where(eq(publishRecords.platform, 'bilibili'))
        .all()

      const matched = records.find(
        (r) =>
          r.status === PUBLISH_STATUS.PUBLISHING &&
          r.platformWorkId === shareId,
      )

      if (matched) {
        await db
          .update(publishRecords)
          .set({
            status: PUBLISH_STATUS.PUBLISHED,
            platformWorkId: videoId,
            workUrl: `https://www.bilibili.com/video/${videoId}`,
            updatedAt: Date.now(),
          })
          .where(eq(publishRecords.id, matched.id))
      }
    }

    return jsonResponse({ code: 0, message: 'ok' })
  })

  return bilibili
}
