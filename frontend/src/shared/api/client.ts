import * as v from 'valibot'

export const tokenStore = {
  get: () => localStorage.getItem('arc-token'),
  set: (token: string) => localStorage.setItem('arc-token', token),
  clear: () => localStorage.removeItem('arc-token'),
}

export class APIError extends Error {
  readonly status: number
  readonly code?: string
  readonly fieldErrors: Record<string, string>
  constructor(message: string, status: number, code?: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

const errorSchema = v.object({ error: v.optional(v.string()), code: v.optional(v.string()), fieldErrors: v.optional(v.record(v.string(), v.string())) })

export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal; schema?: v.GenericSchema<unknown, T> } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', ...(tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })
  if (!response.ok) {
    let message = `요청에 실패했습니다 (${response.status}).`
    let code: string | undefined
    let fieldErrors: Record<string, string> = {}
    try {
      const result = v.safeParse(errorSchema, await response.json())
      if (result.success) { message = result.output.error ?? message; code = result.output.code; fieldErrors = result.output.fieldErrors ?? {} }
    } catch { /* empty or invalid error response */ }
    if (response.status === 401 && !path.startsWith('/auth/login')) tokenStore.clear()
    throw new APIError(message, response.status, code, fieldErrors)
  }
  const text = await response.text()
  let payload: unknown
  try { payload = text ? JSON.parse(text) : undefined }
  catch { throw new APIError('서버 응답을 읽을 수 없습니다. 다시 시도해 주세요.', response.status, 'INVALID_RESPONSE') }
  if (options.schema) {
    const result = v.safeParse(options.schema, payload)
    if (!result.success) throw new APIError('서버 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.', response.status, 'INVALID_RESPONSE')
    return result.output
  }
  return payload as T
}
