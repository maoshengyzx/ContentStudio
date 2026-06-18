/**
 * B站发布器 — 参照 aitoearn 实现完整的视频上传管线 + HMAC 签名 + 稿件提交。
 *
 * API 端点：
 *   封面上传:    https://member.bilibili.com/arcopen/fn/archive/cover/upload
 *   视频初始化:   https://member.bilibili.com/arcopen/fn/archive/video/init
 *   分片上传:     https://openupos.bilivideo.com/video/v2/part/upload
 *   合片:         https://member.bilibili.com/arcopen/fn/archive/video/complete
 *   稿件提交:     https://member.bilibili.com/arcopen/fn/archive/add-by-utoken
 *   Token 刷新:  https://api.bilibili.com/x/account-oauth2/v1/refresh_token
 */
import { createHash } from 'node:crypto'

const CHUNK_SIZE = 1024 * 1024 * 5 // 5MB per chunk

// =====================================================================
// 类型定义
// =====================================================================

export interface BilibiliPublishParams {
  title: string
  description?: string
  videoUrl?: string
  coverUrl?: string
  tags?: string[]
  tid?: number          // 分区 ID，默认 17（科技）
  copyright?: number    // 1=自制 2=转载
  source?: string       // 转载来源
}

export interface BilibiliPublishResult {
  success: boolean
  workUrl?: string
  platformWorkId?: string
  shareId?: string
  error?: string
}

interface BilibiliApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// =====================================================================
// HMAC-SHA256 签名头生成（参照 aitoearn generateHeader）
// =====================================================================

async function generateBilibiliHeaders(
  accessToken: string,
  clientId: string,
  clientSecret: string,
  body?: Record<string, unknown>,
  formHeaders?: boolean,
): Promise<Record<string, string>> {
  const encoder = new TextEncoder()
  const bodyStr = body ? JSON.stringify(body) : ''

  const md5Hash = createHash('md5').update(bodyStr).digest('hex')

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': formHeaders ? 'multipart/form-data' : 'application/json',
    'x-bili-content-md5': md5Hash,
    'x-bili-timestamp': String(Math.floor(Date.now() / 1000)),
    'x-bili-signature-method': 'HMAC-SHA256',
    'x-bili-signature-nonce': crypto.randomUUID(),
    'x-bili-accesskeyid': clientId,
    'x-bili-signature-version': '2.0',
    'access-token': accessToken,
    Authorization: '',
  }

  const headerStr = Object.keys(headers)
    .filter((k) => k.startsWith('x-bili-'))
    .sort()
    .map((k) => `${k}:${headers[k]}`)
    .join('\n')

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(clientSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(headerStr))
  headers.Authorization = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return headers
}

// =====================================================================
// B站 API 请求工具
// =====================================================================

async function bilibiliRequest<T>(
  url: string,
  options: {
    accessToken: string
    clientId: string
    clientSecret: string
    method?: string
    body?: Record<string, unknown>
    params?: Record<string, string | number>
    formHeaders?: boolean
    rawBody?: ArrayBuffer
  },
): Promise<BilibiliApiResponse<T>> {
  const { accessToken, clientId, clientSecret, method = 'GET', params, rawBody } = options

  const headers = await generateBilibiliHeaders(
    accessToken,
    clientId,
    clientSecret,
    options.body,
    options.formHeaders,
  )

  const requestUrl = params
    ? `${url}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`
    : url

  const fetchOptions: RequestInit = {
    method,
    headers,
  }

  if (rawBody) {
    fetchOptions.body = rawBody
  } else if (options.body) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  const response = await fetch(requestUrl, fetchOptions)
  const data = (await response.json()) as BilibiliApiResponse<T>

  if (data.code !== 0) {
    throw new Error(`B站 API 错误 [${data.code}]: ${data.message || JSON.stringify(data)}`)
  }

  return data
}

// =====================================================================
// ① 封面上传
// =====================================================================

async function uploadCover(
  coverUrl: string,
  accessToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const imageRes = await fetch(coverUrl)
  if (!imageRes.ok) throw new Error(`下载封面失败: HTTP ${imageRes.status}`)
  const imageBuf = await imageRes.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuf)))

  // B站 cover upload 要求 multipart/form-data
  const boundary = '----BilibiliCover' + crypto.randomUUID()
  const encoder = new TextEncoder()

  const parts: Uint8Array[] = []
  parts.push(encoder.encode(`--${boundary}\r\n`))
  parts.push(encoder.encode('Content-Disposition: form-data; name="file"; filename="cover.jpg"\r\n'))
  parts.push(encoder.encode('Content-Type: image/jpeg\r\n\r\n'))
  parts.push(new Uint8Array(imageBuf))
  parts.push(encoder.encode(`\r\n--${boundary}--\r\n`))

  const totalLen = parts.reduce((sum, p) => sum + p.length, 0)
  const formBody = new Uint8Array(totalLen)
  let offset = 0
  for (const part of parts) {
    formBody.set(part, offset)
    offset += part.length
  }

  const headers = await generateBilibiliHeaders(accessToken, clientId, clientSecret, undefined, true)

  const res = await fetch('https://member.bilibili.com/arcopen/fn/archive/cover/upload', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: formBody,
  })

  const data = (await res.json()) as BilibiliApiResponse<{ url: string }>
  if (data.code !== 0) throw new Error(`封面上传失败: ${data.message}`)
  return data.data.url
}

// =====================================================================
// ② 视频初始化
// =====================================================================

async function videoInit(
  fileName: string,
  accessToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await bilibiliRequest<{ upload_token: string }>(
    'https://member.bilibili.com/arcopen/fn/archive/video/init',
    {
      accessToken, clientId, clientSecret,
      method: 'POST',
      body: { name: fileName, utype: '0' },
    },
  )
  return res.data.upload_token
}

// =====================================================================
// ③ 视频分片上传
// =====================================================================

async function uploadVideoPart(
  chunk: ArrayBuffer,
  uploadToken: string,
  partNumber: number,
  accessToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await bilibiliRequest<{ etag: string }>(
    'https://openupos.bilivideo.com/video/v2/part/upload',
    {
      accessToken, clientId, clientSecret,
      method: 'POST',
      params: { upload_token: uploadToken, part_number: partNumber },
      rawBody: chunk,
    },
  )
  return res.data.etag
}

// =====================================================================
// ④ 合片完成
// =====================================================================

async function videoComplete(
  uploadToken: string,
  accessToken: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  await bilibiliRequest(
    'https://member.bilibili.com/arcopen/fn/archive/video/complete',
    {
      accessToken, clientId, clientSecret,
      method: 'POST',
      params: { upload_token: uploadToken },
    },
  )
}

// =====================================================================
// ⑤ 提交稿件
// =====================================================================

async function archiveAdd(
  uploadToken: string,
  data: {
    title: string
    cover: string
    desc: string
    tid: number
    copyright: number
    source: string
    no_reprint: number
    open_elec: number
    tag: string
  },
  accessToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ resourceId: string; shareId: string }> {
  const body = { ...data } as Record<string, unknown>
  const res = await bilibiliRequest<{ resource_id: string; share_id: string }>(
    'https://member.bilibili.com/arcopen/fn/archive/add-by-utoken',
    {
      accessToken, clientId, clientSecret,
      method: 'POST',
      params: { upload_token: uploadToken },
      body,
    },
  )
  return { resourceId: res.data.resource_id, shareId: res.data.share_id }
}

// =====================================================================
// ⑥ 视频上传管线（下载 → 分片上传 → 合片）
// =====================================================================

async function uploadVideo(
  videoUrl: string,
  accessToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  // 先用 HEAD 请求获取文件大小
  const headRes = await fetch(videoUrl, { method: 'HEAD' })
  const contentLength = parseInt(headRes.headers.get('Content-Length') || '0', 10)
  if (contentLength === 0) throw new Error('无法获取视频文件大小')

  // 从 URL 提取文件名
  const urlObj = new URL(videoUrl)
  const pathParts = urlObj.pathname.split('/')
  const fileName = pathParts[pathParts.length - 1] || `video_${Date.now()}.mp4`

  // 初始化上传
  const uploadToken = await videoInit(fileName, accessToken, clientId, clientSecret)

  // 分片上传
  const chunkCount = Math.ceil(contentLength / CHUNK_SIZE)
  for (let seq = 1; seq <= chunkCount; seq++) {
    const start = (seq - 1) * CHUNK_SIZE
    const end = Math.min(seq * CHUNK_SIZE - 1, contentLength - 1)

    const chunkRes = await fetch(videoUrl, {
      headers: { Range: `bytes=${start}-${end}` },
    })
    if (!chunkRes.ok) throw new Error(`下载视频分片 ${seq} 失败: HTTP ${chunkRes.status}`)
    const chunk = await chunkRes.arrayBuffer()

    await uploadVideoPart(chunk, uploadToken, seq, accessToken, clientId, clientSecret)
  }

  // 合片
  await videoComplete(uploadToken, accessToken, clientId, clientSecret)

  return uploadToken
}

// =====================================================================
// ⑦ 主发布入口 — 参照 aitoearn BilibiliPubService.immediatePublish()
// =====================================================================

export async function bilibiliPublish(
  accessToken: string,
  params: BilibiliPublishParams,
  config: { clientId: string; clientSecret: string },
): Promise<BilibiliPublishResult> {
  if (!accessToken) {
    return { success: false, error: 'B站 access token 未配置' }
  }
  if (!config.clientId || !config.clientSecret) {
    return { success: false, error: 'B站 clientId/clientSecret 未配置' }
  }

  const tid = params.tid ?? 17
  const copyright = params.copyright ?? 2
  const source = params.source ?? params.description ?? params.title

  try {
    // 如果有视频 URL，走完整上传管线
    if (params.videoUrl) {
      // 上传封面
      const cover = params.coverUrl
        ? await uploadCover(params.coverUrl, accessToken, config.clientId, config.clientSecret)
        : ''

      // 上传视频
      const videoUploadToken = await uploadVideo(
        params.videoUrl,
        accessToken,
        config.clientId,
        config.clientSecret,
      )

      // 提交稿件
      const { resourceId, shareId } = await archiveAdd(
        videoUploadToken,
        {
          title: params.title,
          cover,
          desc: params.description || '',
          tid,
          copyright,
          source,
          no_reprint: 1,
          open_elec: 0,
          tag: params.tags?.join(',') || '',
        },
        accessToken,
        config.clientId,
        config.clientSecret,
      )

      return {
        success: true,
        workUrl: `https://www.bilibili.com/video/${resourceId}`,
        platformWorkId: resourceId,
        shareId,
      }
    }

    // 无视频 — 纯文本/图文投稿（使用旧版 client/add 作为 fallback）
    const body = new URLSearchParams({
      access_key: accessToken,
      title: params.title,
      desc: params.description || '',
      copyright: String(copyright),
      source,
      tid: String(tid),
      no_reprint: '1',
      open_elec: '0',
    })

    const response = await fetch('https://member.bilibili.com/x/vu/client/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const data = (await response.json()) as BilibiliApiResponse<{ aid?: number }>

    if (data.code === 0) {
      return {
        success: true,
        workUrl: `https://www.bilibili.com/video/av${data.data?.aid || ''}`,
        platformWorkId: data.data?.aid ? String(data.data.aid) : '',
      }
    }

    return { success: false, error: `B站发布失败: ${data.message || JSON.stringify(data)}` }
  } catch (err: any) {
    return { success: false, error: `B站 API 调用异常: ${err.message}` }
  }
}
