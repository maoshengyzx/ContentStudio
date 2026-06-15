export interface Env {
  DB: D1Database
  JWT_SECRET: string
  INTERNAL_TOKEN: string
}

export interface PublishJobData {
  recordId: string
  platform: string
  accountId: string
  retryCount: number
  maxRetries: number
  params: Record<string, unknown>
}

export interface PublishJobMessage {
  id: string
  body: PublishJobData
  timestamp: number
}
