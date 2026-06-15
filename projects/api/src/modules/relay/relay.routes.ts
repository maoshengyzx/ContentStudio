import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type { Env } from '../../env'
import { createDb, accounts, errorResponse } from '../../shared'
import { RelayService } from './relay.service'

function internalAuth() {
  return async (c: any, next: () => Promise<void>) => {
    const auth = c.req.header('Authorization')
    if (!auth?.startsWith('Internal ')) {
      return errorResponse('Unauthorized', 401)
    }
    if (auth.slice(9) !== c.env.INTERNAL_TOKEN) {
      return errorResponse('Invalid Internal Token', 401)
    }
    c.set('userId', 'internal')
    return next()
  }
}

export function createRelayRoutes() {
  const relay = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

  const getService = (c: any) => new RelayService(createDb(c.env.DB))

  relay.get('/bilibili/oauth/authorize', (c) => {
    const clientId = c.env.BILIBILI_CLIENT_ID
    if (!clientId) {
      return errorResponse('BILIBILI_CLIENT_ID not configured', 500)
    }

    const redirectUri = c.env.BILIBILI_REDIRECT_URI
      || `${new URL(c.req.url).origin}/relay/bilibili/oauth/callback`

    const userId = c.req.query('userId') || ''
    const state = crypto.randomUUID()
    const statePayload = encodeURIComponent(JSON.stringify({ state, userId, redirectUri }))

    const service = getService(c)
    const url = service.getBilibiliOAuthUrl(clientId, redirectUri, statePayload)

    return c.redirect(url)
  })

  relay.get('/bilibili/oauth/callback', async (c) => {
    const code = c.req.query('code')
    const stateParam = c.req.query('state')

    if (!code) {
      return errorResponse('Missing authorization code', 400)
    }

    let userId = 'internal'
    let redirectUri = `${new URL(c.req.url).origin}`

    if (stateParam) {
      try {
        const stateData = JSON.parse(decodeURIComponent(stateParam))
        if (stateData.userId) userId = stateData.userId
        if (stateData.redirectUri) redirectUri = stateData.redirectUri
      } catch {}
    }

    const clientId = c.env.BILIBILI_CLIENT_ID
    const clientSecret = c.env.BILIBILI_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return errorResponse('B站凭据未配置', 500)
    }

    const service = getService(c)
    const tokenRes = await service.exchangeBilibiliToken(clientId, clientSecret, code)

    if (tokenRes.code !== 0 || !tokenRes.data) {
      return errorResponse(`B站授权失败: ${tokenRes.message || '未知错误'}`, 502)
    }

    const tokenInfo = tokenRes.data.token_info
    const mid = tokenInfo?.mid || ''
    const name = tokenInfo?.name || `B站用户_${mid}`

    const result = await service.saveBilibiliAccount(userId, {
      accessToken: tokenRes.data.access_token,
      refreshToken: tokenRes.data.refresh_token,
      expiresIn: tokenRes.data.expires_in,
      mid,
      name,
      avatar: tokenInfo?.avatar,
    })

    const resultData = await result.json() as any

    const returnUrl = new URL(redirectUri)
    returnUrl.searchParams.set('relay_callback', '1')
    returnUrl.searchParams.set('account_id', resultData.id || '')
    returnUrl.searchParams.set('platform', 'bilibili')
    returnUrl.searchParams.set('nickname', name)

    return c.redirect(returnUrl.toString())
  })

  relay.post('/bilibili/publish', internalAuth(), async (c) => {
    const body = await c.req.json<{
      accessToken?: string
      accountId?: string
      title: string
      description?: string
      videoUrl?: string
    }>()

    if (!body.title) {
      return errorResponse('title is required', 400)
    }

    const db = createDb(c.env.DB)
    const service = new RelayService(db)

    let accessToken = body.accessToken

    if (!accessToken && body.accountId) {
      const account = await db.select({ accessToken: accounts.accessToken })
        .from(accounts)
        .where(eq(accounts.id, body.accountId))
        .get()
      if (!account) {
        return errorResponse('Account not found', 404)
      }
      accessToken = account.accessToken
    }

    if (!accessToken) {
      return errorResponse('accessToken or accountId required', 400)
    }

    return service.bilibiliPublish(accessToken, {
      title: body.title,
      description: body.description,
      videoUrl: body.videoUrl,
    })
  })

  return relay
}
