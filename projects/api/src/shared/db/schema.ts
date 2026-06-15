import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  name: text('name'),
  avatar: text('avatar'),
  status: text('status').notNull().default('active'),
  credits: integer('credits').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  keyHash: text('key_hash').unique().notNull(),
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  platform: text('platform').notNull(),
  platformUid: text('platform_uid').notNull(),
  nickname: text('nickname').notNull(),
  avatar: text('avatar'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: integer('token_expires_at'),
  status: text('status').notNull().default('active'),
  groupId: text('group_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  userPlatformUidIdx: uniqueIndex('idx_account_user_platform_uid')
    .on(table.userId, table.platform, table.platformUid),
  userPlatformIdx: index('idx_account_user_platform')
    .on(table.userId, table.platform),
}))

export const publishRecords = sqliteTable('publish_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  accountId: text('account_id').notNull().references(() => accounts.id),
  platform: text('platform').notNull(),
  flowId: text('flow_id'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  topics: text('topics'),
  videoUrl: text('video_url'),
  coverUrl: text('cover_url'),
  imageUrls: text('image_urls'),
  publishTime: integer('publish_time'),
  status: text('status').notNull().default('waiting'),
  queueMessageId: text('queue_message_id'),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  errorMessage: text('error_message'),
  workUrl: text('work_url'),
  platformWorkId: text('platform_work_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  statusTimeIdx: index('idx_pr_status_time').on(table.status, table.publishTime),
  userCreatedIdx: index('idx_pr_user_created').on(table.userId, table.createdAt),
  flowIdIdx: index('idx_pr_flow_id').on(table.flowId),
}))

export const creditLogs = sqliteTable('credit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  description: text('description'),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  userCreatedIdx: index('idx_cl_user_created').on(table.userId, table.createdAt),
}))
