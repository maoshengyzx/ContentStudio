import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type { Env } from '../../env'
import type { BilibiliConfig } from '../../config'
import { createDb, accounts, errorResponse, jsonResponse } from '../../shared'
import { requireInternalAuth } from '../../middlewares'
import { BilibiliOAuthService } from './bilibili.oauth'
import { bilibiliPublish } from './bilibili.publisher'

/**
 * B站平台路由工厂 — OAuth 授权流程 + 内部发布端点。
 * 挂载点：/platforms → 实际路径 /platforms/bilibili/oauth/...、/platforms/bilibili/publish
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
      }>()

      if (!body.title) return errorResponse('title is required', 400)

      const db = createDb(c.env.DB)
      let accessToken = body.accessToken
      if (!accessToken && body.accountId) {
        const account = await db
          .select({ accessToken: accounts.accessToken })
          .from(accounts)
          .where(eq(accounts.id, body.accountId))
          .get()
        if (!account) return errorResponse('Account not found', 404)
        accessToken = account.accessToken
      }
      if (!accessToken) return errorResponse('accessToken or accountId required', 400)

      const result = await bilibiliPublish(accessToken, {
        title: body.title,
        description: body.description,
        videoUrl: body.videoUrl,
      })

      if (!result.success) return errorResponse(result.error || '发布失败', 502)
      return jsonResponse(result)
    },
  )

  return bilibili
}
