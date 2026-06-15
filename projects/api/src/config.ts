import { z } from 'zod'
import type { Env } from './env'

// =====================================================================
// 各平台 OAuth 配置 Schema（参照 aitoearn channelConfigSchema）
// =====================================================================

const oauthBaseSchema = z.object({
  clientId: z.string().default(''),
  clientSecret: z.string().default(''),
  redirectUri: z.string().default(''),
})

const oauthWithScopesSchema = oauthBaseSchema.extend({
  scopes: z.array(z.string()).default([]),
})

export const bilibiliConfigSchema = oauthBaseSchema

export const douyinConfigSchema = oauthBaseSchema

export const kuaishouConfigSchema = oauthBaseSchema

export const xiaohongshuConfigSchema = oauthBaseSchema

export const youtubeConfigSchema = oauthBaseSchema

export const tiktokConfigSchema = oauthWithScopesSchema

export const twitterConfigSchema = oauthBaseSchema

export const facebookConfigSchema = oauthWithScopesSchema

export const instagramConfigSchema = oauthWithScopesSchema

// =====================================================================
// 平台聚合（参照 aitoearn channelConfigSchema 将所有平台归入 channel）
// =====================================================================

export const platformsConfigSchema = z.object({
  bilibili: bilibiliConfigSchema,
  douyin: douyinConfigSchema,
  kuaishou: kuaishouConfigSchema,
  xiaohongshu: xiaohongshuConfigSchema,
  youtube: youtubeConfigSchema,
  tiktok: tiktokConfigSchema,
  twitter: twitterConfigSchema,
  facebook: facebookConfigSchema,
  instagram: instagramConfigSchema,
})

// =====================================================================
// 其他子模块配置
// =====================================================================

export const authConfigSchema = z.object({
  jwtSecret: z.string().min(1),
  internalToken: z.string().min(1),
})

export const publishConfigSchema = z.object({
  immediateToleranceMs: z.number().default(30_000),
  defaultMaxRetries: z.number().int().positive().default(3),
})

// =====================================================================
// 主配置 Schema（聚合所有子模块，参照 aitoearn appConfigSchema）
// =====================================================================

export const appConfigSchema = z.object({
  auth: authConfigSchema,
  platforms: platformsConfigSchema,
  publish: publishConfigSchema,
})

// =====================================================================
// 类型导出
// =====================================================================

export type AuthConfig = z.infer<typeof authConfigSchema>
export type BilibiliConfig = z.infer<typeof bilibiliConfigSchema>
export type DouyinConfig = z.infer<typeof douyinConfigSchema>
export type KuaishouConfig = z.infer<typeof kuaishouConfigSchema>
export type XiaohongshuConfig = z.infer<typeof xiaohongshuConfigSchema>
export type YoutubeConfig = z.infer<typeof youtubeConfigSchema>
export type TiktokConfig = z.infer<typeof tiktokConfigSchema>
export type TwitterConfig = z.infer<typeof twitterConfigSchema>
export type FacebookConfig = z.infer<typeof facebookConfigSchema>
export type InstagramConfig = z.infer<typeof instagramConfigSchema>
export type PlatformsConfig = z.infer<typeof platformsConfigSchema>
export type PublishConfig = z.infer<typeof publishConfigSchema>
export type AppConfig = z.infer<typeof appConfigSchema>

// =====================================================================
// 配置工厂：从 Cloudflare Env 构建类型化配置
// =====================================================================

function readPlatformConfig(env: Env, prefix: string) {
  return {
    clientId: env[`${prefix}_CLIENT_ID` as keyof Env] as string | undefined ?? '',
    clientSecret: env[`${prefix}_CLIENT_SECRET` as keyof Env] as string | undefined ?? '',
    redirectUri: env[`${prefix}_REDIRECT_URI` as keyof Env] as string | undefined ?? '',
  }
}

export function createAppConfig(env: Env): AppConfig {
  return {
    auth: {
      jwtSecret: env.JWT_SECRET,
      internalToken: env.INTERNAL_TOKEN,
    },
    platforms: {
      bilibili: readPlatformConfig(env, 'BILIBILI'),
      douyin: readPlatformConfig(env, 'DOUYIN'),
      kuaishou: readPlatformConfig(env, 'KUAISHOU'),
      xiaohongshu: readPlatformConfig(env, 'XIAOHONGSHU'),
      youtube: readPlatformConfig(env, 'YOUTUBE'),
      tiktok: {
        ...readPlatformConfig(env, 'TIKTOK'),
        scopes: [],
      },
      twitter: readPlatformConfig(env, 'TWITTER'),
      facebook: {
        ...readPlatformConfig(env, 'FACEBOOK'),
        scopes: [],
      },
      instagram: {
        ...readPlatformConfig(env, 'INSTAGRAM'),
        scopes: [],
      },
    },
    publish: {
      immediateToleranceMs: 30_000,
      defaultMaxRetries: 3,
    },
  }
}
