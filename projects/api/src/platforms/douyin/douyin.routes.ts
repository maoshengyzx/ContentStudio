import { Hono } from 'hono'
import type { Env } from '../../env'
import type { DouyinConfig } from '../../config'
import { createDb, publishRecords, errorResponse, jsonResponse } from '../../shared'
import { PUBLISH_STATUS } from '../../shared'
import { requireInternalAuth } from '../../middlewares'
import { DouyinOAuthService } from './douyin.oauth'
import { douyinPublish } from './douyin.publisher'
import { eq } from 'drizzle-orm'

/**
 * 抖音平台路由工厂 — OAuth 授权流程 + 内部发布端点 + Webhook 回调。
 * 挂载点：/platforms
 */
export function createDouyinRoutes(config: DouyinConfig, internalToken: string) {
  const douyin = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  const getOAuthService = (c: any) => new DouyinOAuthService(createDb(c.env.DB))

  // ---------------------------------------------------------------------------
  // OAuth 授权流程
  // ---------------------------------------------------------------------------

  douyin.get('/douyin/oauth/authorize', (c) => {
    if (!config.clientId) return errorResponse('DOUYIN_CLIENT_ID not configured', 500)

    const redirectUri =
      config.redirectUri ||
      `${new URL(c.req.url).origin}/platforms/douyin/oauth/callback`

    const userId = c.req.query('userId') || ''
    const statePayload = encodeURIComponent(
      JSON.stringify({ state: crypto.randomUUID(), userId, redirectUri }),
    )

    const service = getOAuthService(c)
    const url = service.getOAuthUrl(config.clientId, redirectUri, statePayload)
    return c.redirect(url)
  })

  douyin.get('/douyin/oauth/callback', async (c) => {
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
        /* ignore */
      }
    }

    if (!config.clientId || !config.clientSecret) return errorResponse('抖音凭据未配置', 500)

    const service = getOAuthService(c)
    const tokenRes = await service.exchangeToken(config.clientId, config.clientSecret, code)
    if (tokenRes.message !== 'success' || !tokenRes.data) {
      return errorResponse(`抖音授权失败: ${tokenRes.message}`, 502)
    }

    const userInfo = await service.getUserInfo(
      tokenRes.data.access_token,
      tokenRes.data.open_id,
    )
    const name = userInfo?.data?.nickname || `抖音用户_${tokenRes.data.open_id}`

    const result = await service.saveAccount(userId, {
      accessToken: tokenRes.data.access_token,
      refreshToken: tokenRes.data.refresh_token,
      expiresIn: tokenRes.data.expires_in,
      openId: tokenRes.data.open_id,
      name,
      avatar: userInfo?.data?.avatar,
    })

    const resultData = (await result.json()) as any
    const returnUrl = new URL(redirectUri)
    returnUrl.searchParams.set('relay_callback', '1')
    returnUrl.searchParams.set('account_id', resultData.id || '')
    returnUrl.searchParams.set('platform', 'douyin')
    returnUrl.searchParams.set('nickname', name)
    return c.redirect(returnUrl.toString())
  })

  // ---------------------------------------------------------------------------
  // 内部发布端点（Share Schema 生成）
  // ---------------------------------------------------------------------------

  douyin.post(
    '/douyin/publish',
    requireInternalAuth(internalToken),
    async (c) => {
      const body = await c.req.json<{
        title: string
        description?: string
        videoUrl?: string
        imageUrls?: string[]
        topics?: string[]
        downloadType?: number
        privateStatus?: number
      }>()

      if (!body.title) return errorResponse('title is required', 400)
      if (!config.clientId || !config.clientSecret) {
        return errorResponse('抖音 clientId/clientSecret 未配置', 500)
      }

      const result = await douyinPublish({
        title: body.title,
        description: body.description,
        videoUrl: body.videoUrl,
        imageUrls: body.imageUrls,
        topics: body.topics,
        downloadType: body.downloadType,
        privateStatus: body.privateStatus,
      }, { clientId: config.clientId, clientSecret: config.clientSecret })

      if (!result.success) return errorResponse(result.error || '发布失败', 502)
      return jsonResponse(result)
    },
  )

  // ---------------------------------------------------------------------------
  // Webhook 回调端点（抖音发布完成通知）
  // ---------------------------------------------------------------------------

  douyin.post('/douyin/webhooks', async (c) => {
    const body = await c.req.json<{
      event?: string
      from_user_id?: string
      client_key?: string
      content?: {
        share_id?: string
        item_id?: string
        video_id?: string
        challenge?: number
      }
    }>()

    // 抖音 webhook 验证：echo challenge
    if (body.event === 'verify_webhook' && body.content?.challenge) {
      return jsonResponse({ challenge: body.content.challenge })
    }

    // 发布完成事件
    if (body.event === 'create_video' && body.content?.share_id) {
      const db = createDb(c.env.DB)
      const shareId = body.content.share_id
      const videoId = body.content.video_id || ''

      // 通过 share_id 匹配发布记录
      const records = await db
        .select()
        .from(publishRecords)
        .where(eq(publishRecords.platform, 'douyin'))
        .all()

      const matched = records.find(
        (r) => r.status === PUBLISH_STATUS.PUBLISHING && r.platformWorkId === shareId,
      )

      if (matched) {
        await db
          .update(publishRecords)
          .set({
            status: PUBLISH_STATUS.PUBLISHED,
            platformWorkId: videoId,
            workUrl: videoId ? `https://www.douyin.com/video/${videoId}` : matched.workUrl,
            updatedAt: Date.now(),
          })
          .where(eq(publishRecords.id, matched.id))
      }
    }

    return jsonResponse({ code: 0, message: 'ok' })
  })

  return douyin
}
