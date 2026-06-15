import type { Env as SharedEnv } from './shared'

export type { PublishJobData, PublishJobMessage } from './shared'

export interface Env extends SharedEnv {
  BUCKET: R2Bucket
  PUBLISH_QUEUE: Queue<any>
  JWT_SECRET: string
  INTERNAL_TOKEN: string
  BILIBILI_CLIENT_ID?: string
  BILIBILI_CLIENT_SECRET?: string
  BILIBILI_REDIRECT_URI?: string
}
