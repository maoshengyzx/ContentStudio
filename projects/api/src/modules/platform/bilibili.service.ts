export async function bilibiliPublish(
  accountId: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; workUrl?: string; platformWorkId?: string; error?: string }> {
  const accessToken = params._accessToken as string
  if (!accessToken) {
    return { success: false, error: 'B站 access token 未配置' }
  }

  const title = params.title as string
  const desc = params.description as string

  try {
    const body: Record<string, unknown> = {
      access_key: accessToken,
      title,
      desc: desc || '',
      copyright: 2,
      source: desc || title,
      tid: 17,
      no_reprint: 1,
      open_elec: 0,
    }

    if (params.videoUrl) {
      body.videos = [{ title, filename: `aitoearn_${Date.now()}.mp4`, desc: desc || '' }]
    }

    const response = await fetch('https://member.bilibili.com/x/vu/client/add', {
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
      return {
        success: true,
        workUrl: `https://www.bilibili.com/video/av${data.data?.aid || ''}`,
        platformWorkId: String(data.data?.aid || ''),
      }
    }

    return { success: false, error: `B站发布失败: ${data.message || JSON.stringify(data)}` }
  } catch (err: any) {
    return { success: false, error: `B站 API 调用异常: ${err.message}` }
  }
}
