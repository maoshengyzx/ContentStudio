export function uuid(): string {
  return crypto.randomUUID()
}

export function now(): number {
  return Date.now()
}

export async function sha1(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hash = await crypto.subtle.digest('SHA-1', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(message: string, status = 400, code?: number): Response {
  return jsonResponse({
    code: code ?? status,
    message,
    data: null,
  }, status)
}

export function paginatedResponse<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number,
): Response {
  return jsonResponse({
    code: 0,
    data: {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}
