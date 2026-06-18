declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(data: string | ArrayBuffer | ArrayBufferView): Hash
    digest(encoding?: 'hex' | 'base64' | 'latin1'): string
    digest(): Buffer
  }
  interface Hash {
    update(data: string | ArrayBuffer | ArrayBufferView): Hash
    digest(encoding?: 'hex' | 'base64' | 'latin1'): string
    digest(): Buffer
    copy(): Hash
  }
}

interface Buffer extends Uint8Array {}
