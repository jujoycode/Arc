export const tokenStore = {
  get: () => localStorage.getItem('arc-token'),
  set: (token: string) => localStorage.setItem('arc-token', token),
  clear: () => localStorage.removeItem('arc-token'),
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', ...(tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (!response.ok) {
    let message = `요청에 실패했습니다 (${response.status}).`
    try { message = (await response.json()).error ?? message } catch { /* empty response */ }
    if (response.status === 401 && !path.startsWith('/auth/login')) tokenStore.clear()
    throw new Error(message)
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

