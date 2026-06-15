/**
 * B站统一发布器 — 合并了原有 relay.service 和 platform/bilibili.service 中的重复逻辑。
 *
 * 直接调用 B站投稿 API，返回统一的结构化结果。
 */
const BILIBILI_PUBLISH_URL = 'https://member.bilibili.com/x/vu/client/add'

export interface BilibiliPublishParams {
  title: string
  description?: string
  videoUrl?: string
}

export interface BilibiliPublishResult {
  success: boolean
  workUrl?: string
  platformWorkId?: string
  error?: string
}

export async function bilibiliPublish(
  accessToken: string,
  params: BilibiliPublishParams,
): Promise<BilibiliPublishResult> {
  if (!accessToken) {
    return { success: false, error: 'B站 access token 未配置' }
  }

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
    body.videos = [
      {
        title: params.title,
        filename: `mvp_${Date.now()}.mp4`,
        desc: params.description || '',
      },
    ]
  }

  try {
    const response = await fetch(BILIBILI_PUBLISH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(
        Object.fromEntries(
          Object.entries(body).map(([k, v]) => [
            k,
            typeof v === 'object' ? JSON.stringify(v) : String(v),
          ]),
        ),
      ),
    })

    const data = (await response.json()) as any

    if (data.code === 0) {
      return {
        success: true,
        workUrl: `https://www.bilibili.com/video/av${data.data?.aid || ''}`,
        platformWorkId: String(data.data?.aid || ''),
      }
    }

    return {
      success: false,
      error: `B站发布失败: ${data.message || JSON.stringify(data)}`,
    }
  } catch (err: any) {
    return { success: false, error: `B站 API 调用异常: ${err.message}` }
  }
}
