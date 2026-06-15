export const PLATFORMS = {
  bilibili: { name: 'B站', icon: 'bilibili' },
  douyin: { name: '抖音', icon: 'douyin' },
  kuaishou: { name: '快手', icon: 'kuaishou' },
  xiaohongshu: { name: '小红书', icon: 'xiaohongshu' },
  youtube: { name: 'YouTube', icon: 'youtube' },
  tiktok: { name: 'TikTok', icon: 'tiktok' },
  twitter: { name: 'X(Twitter)', icon: 'twitter' },
  facebook: { name: 'Facebook', icon: 'facebook' },
  instagram: { name: 'Instagram', icon: 'instagram' },
} as const

export type Platform = keyof typeof PLATFORMS

export const PUBLISH_STATUS = {
  WAITING: 'waiting',
  QUEUED: 'queued',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  FAILED: 'failed',
} as const

export type PublishStatus = (typeof PUBLISH_STATUS)[keyof typeof PUBLISH_STATUS]

export const CREDIT_TYPE = {
  RECHARGE: 'recharge',
  DEDUCT: 'deduct',
  REFUND: 'refund',
  REWARD: 'reward',
  PURCHASE: 'purchase',
} as const

export type CreditType = (typeof CREDIT_TYPE)[keyof typeof CREDIT_TYPE]

export const IMMEDIATE_PUBLISH_TOLERANCE_MS = 30_000
