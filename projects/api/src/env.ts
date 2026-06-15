import type { Env as SharedEnv } from './shared'

export type { PublishJobData, PublishJobMessage } from './shared'

export interface Env extends SharedEnv {
  // 基础设施
  BUCKET: R2Bucket
  PUBLISH_QUEUE: Queue<any>

  // Auth
  JWT_SECRET: string
  INTERNAL_TOKEN: string

  // B站
  BILIBILI_CLIENT_ID?: string
  BILIBILI_CLIENT_SECRET?: string
  BILIBILI_REDIRECT_URI?: string

  // 抖音
  DOUYIN_CLIENT_ID?: string
  DOUYIN_CLIENT_SECRET?: string
  DOUYIN_REDIRECT_URI?: string

  // 快手
  KUAISHOU_CLIENT_ID?: string
  KUAISHOU_CLIENT_SECRET?: string
  KUAISHOU_REDIRECT_URI?: string

  // 小红书
  XIAOHONGSHU_CLIENT_ID?: string
  XIAOHONGSHU_CLIENT_SECRET?: string
  XIAOHONGSHU_REDIRECT_URI?: string

  // YouTube
  YOUTUBE_CLIENT_ID?: string
  YOUTUBE_CLIENT_SECRET?: string
  YOUTUBE_REDIRECT_URI?: string

  // TikTok
  TIKTOK_CLIENT_ID?: string
  TIKTOK_CLIENT_SECRET?: string
  TIKTOK_REDIRECT_URI?: string

  // X (Twitter)
  TWITTER_CLIENT_ID?: string
  TWITTER_CLIENT_SECRET?: string
  TWITTER_REDIRECT_URI?: string

  // Facebook
  FACEBOOK_CLIENT_ID?: string
  FACEBOOK_CLIENT_SECRET?: string
  FACEBOOK_REDIRECT_URI?: string

  // Instagram
  INSTAGRAM_CLIENT_ID?: string
  INSTAGRAM_CLIENT_SECRET?: string
  INSTAGRAM_REDIRECT_URI?: string
}
