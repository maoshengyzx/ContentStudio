/**
 * 抖音发布器 — 参照 aitoearn 的 Share Schema 方式。
 * 不需要上传视频，只需构造深链 URL（snssdk1128://），用户在手机打开即可。
 *
 * API 端点：
 *   client_token: POST https://open.douyin.com/oauth/client_token/
 *   share_id:     GET  https://open.douyin.com/share-id/
 *   open_ticket:  GET  https://open.douyin.com/open/getticket/
 */
import { createHash } from 'node:crypto'

const DOUYIN_API = {
  CLIENT_TOKEN: 'https://open.douyin.com/oauth/client_token/',
  SHARE_ID: 'https://open.douyin.com/share-id/',
  GET_TICKET: 'https://open.douyin.com/open/getticket/',
}

// =====================================================================
// 类型定义
// =====================================================================

export interface DouyinPublishParams {
  title: string
  description?: string
  videoUrl?: string
  imageUrls?: string[]
  topics?: string[]
  /** 1=允许下载, 2=不允许 */
  downloadType?: number
  /** 0=所有人, 1=自己, 2=好友 */
  privateStatus?: number
}

export interface DouyinPublishResult {
  success: boolean
  permalink?: string
  shortLink?: string
  shareId?: string
  error?: string
}

// =====================================================================
// 工具函数
// =====================================================================

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join('')
}

function md5(str: string): string {
  return createHash('md5').update(str).digest('hex')
}

async function douyinRequest<T>(
  url: string,
  options: { method?: string; body?: URLSearchParams; headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
  })
  const data = (await res.json()) as any
  // 抖音 API 返回格式: { message: 'success', data: ... } 或 { data: { error_code: 0, ... } }
  if (data.message && data.message !== 'success') {
    throw new Error(`抖音 API 错误: ${data.message}`)
  }
  if (data.data?.error_code && data.data.error_code !== 0) {
    throw new Error(`抖音 API 错误 [${data.data.error_code}]: ${data.data.description || JSON.stringify(data.data)}`)
  }
  return data
}

// =====================================================================
// ① 获取 Client Token（应用级别 token，有效期 2 小时）
// TODO: 缓存 clientToken（Redis/D1），避免每次发布都请求抖音 API
// =====================================================================

async function getClientToken(
  clientKey: string,
  clientSecret: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'client_credential',
  })

  const res = await douyinRequest<{ message: string; data: { access_token: string; expires_in: number } }>(
    DOUYIN_API.CLIENT_TOKEN,
    { method: 'POST', body },
  )
  return res.data.access_token
}

// =====================================================================
// ② 获取 Share ID（用于标识本次分享，webhook 回调匹配）
// =====================================================================

async function getShareId(
  clientToken: string,
  defaultHashtag?: string,
): Promise<string> {
  const params = new URLSearchParams({ need_callback: 'true' })
  if (defaultHashtag) params.set('default_hashtag', defaultHashtag)
  
  const res = await douyinRequest<{ data: { share_id: string } }>(
    `${DOUYIN_API.SHARE_ID}?${params.toString()}`,
    { headers: { 'access-token': clientToken } },
  )
  return res.data.share_id
}

// =====================================================================
// ③ 获取 Open Ticket（用于签名 Schema URL）
// =====================================================================

async function getOpenTicket(clientToken: string): Promise<string> {
  const res = await douyinRequest<{ data: { ticket: string } }>(
    DOUYIN_API.GET_TICKET,
    { headers: { 'access-token': clientToken } },
  )
  return res.data.ticket
}

// =====================================================================
// ④ 生成 Share Schema URL（参照 aitoearn generateShareSchema）
// =====================================================================

function generateShareSchema(params: {
  clientKey: string
  shareId: string
  ticket: string
  title: string
  videoPath?: string
  imageListPath?: string[]
  hashtagList?: string[]
  titleHashtagList?: { name: string; start: number }[]
  downloadType: number
  privateStatus: number
}): string {
  const nonceStr = randomString(32)
  const timestamp = Math.floor(Date.now() / 1000)

  // 签名: md5("nonce_str=X&ticket={ticket}&timestamp={ts}")
  const signStr = `nonce_str=${nonceStr}&ticket=${params.ticket}&timestamp=${timestamp}`
  const signature = md5(signStr)

  const schemaParams: Record<string, string> = {
    client_key: params.clientKey,
    state: params.shareId,
    nonce_str: nonceStr,
    title: params.title,
    timestamp: String(timestamp),
    signature,
    share_type: 'h5',
    share_to_publish: '1',
    download_type: String(params.downloadType),
    private_status: String(params.privateStatus),
  }

  if (params.videoPath) schemaParams.video_path = params.videoPath
  if (params.imageListPath?.length) {
    schemaParams.image_list_path = JSON.stringify(params.imageListPath)
  }
  if (params.hashtagList?.length) {
    schemaParams.hashtag_list = JSON.stringify(params.hashtagList)
  }
  if (params.titleHashtagList?.length) {
    schemaParams.title_hashtag_list = JSON.stringify(params.titleHashtagList)
  }

  const query = Object.entries(schemaParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/\+/g, '%20')}`)
    .join('&')

  return `snssdk1128://openplatform/share?${query}`
}

// =====================================================================
// ⑤ 主发布入口 — 参照 aitoearn DouyinPubService.doPublish()
// =====================================================================

export async function douyinPublish(
  params: DouyinPublishParams,
  config: { clientId: string; clientSecret: string },
): Promise<DouyinPublishResult> {
  if (!config.clientId || !config.clientSecret) {
    return { success: false, error: '抖音 clientId/clientSecret 未配置' }
  }

  try {
    const clientToken = await getClientToken(config.clientId, config.clientSecret)
    const [shareId, ticket] = await Promise.all([
      getShareId(clientToken),
      getOpenTicket(clientToken),
    ])

    // 将话题嵌入 title（参照 aitoearn formatTitle），生成带话题标签的标题
    let fullTitle = params.title
    const titleHashtagEntries: { name: string; start: number }[] = []
    if (params.topics?.length) {
      for (const tag of params.topics) {
        const name = tag.startsWith('#') ? tag.slice(1) : tag
        const hashtagStr = ` #${name}`
        titleHashtagEntries.push({ name, start: fullTitle.length + 1 }) // +1 跳过空格，指向 # 后第一个字符
        fullTitle += hashtagStr
      }
    }

    const permalink = generateShareSchema({
      clientKey: config.clientId,
      shareId,
      ticket,
      title: fullTitle,
      videoPath: params.videoUrl,
      imageListPath: params.imageUrls,
      hashtagList: params.topics,
      titleHashtagList: titleHashtagEntries.length ? titleHashtagEntries : undefined,
      downloadType: params.downloadType ?? 1,
      privateStatus: params.privateStatus ?? 0,
    })

    return {
      success: true,
      permalink,
      shareId,
    }
  } catch (err: any) {
    return { success: false, error: `抖音 API 调用异常: ${err.message}` }
  }
}
