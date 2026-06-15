import { z } from 'zod'

export const idSchema = z.object({
  id: z.string().min(1),
})

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(128),
  name: z.string().min(1).max(100).optional(),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const createAccountSchema = z.object({
  platform: z.enum([
    'bilibili', 'douyin', 'kuaishou', 'xiaohongshu',
    'youtube', 'tiktok', 'twitter', 'facebook', 'instagram',
  ]),
  platformUid: z.string().min(1),
  nickname: z.string().min(1).max(100),
  avatar: z.string().url().optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
})

export const updateAccountSchema = z.object({
  nickname: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional(),
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().optional(),
})

export const createPublishSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(['video', 'imgText', 'article']),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  topics: z.array(z.string().max(50)).max(20).optional(),
  videoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).max(20).optional(),
  publishTime: z.number().int().positive().optional(),
  flowId: z.string().optional(),
})

export const creditDeductSchema = z.object({
  amount: z.number().int().positive(),
  type: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const creditAddSchema = z.object({
  amount: z.number().int().positive(),
  type: z.string().min(1),
  description: z.string().optional(),
})

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
})

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
})
