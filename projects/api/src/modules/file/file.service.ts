import type { R2Bucket } from '@cloudflare/workers-types'

export class FileService {
  constructor(private bucket: R2Bucket) {}

  async getUploadUrl(key: string, contentType: string): Promise<string> {
    const object = await this.bucket.get(key)
    if (object) {
      await this.bucket.delete(key)
    }
    return `/files/${key}`
  }

  async putObject(key: string, body: ArrayBuffer, contentType: string) {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType },
    })
    return { key, size: body.byteLength }
  }

  async getObject(key: string): Promise<{ body: ReadableStream; contentType: string; size: number } | null> {
    const object = await this.bucket.get(key)
    if (!object) return null
    return {
      body: object.body as unknown as ReadableStream,
      contentType: object.httpMetadata?.contentType || 'application/octet-stream',
      size: object.size,
    }
  }

  async deleteObject(key: string) {
    await this.bucket.delete(key)
  }
}
