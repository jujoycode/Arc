import type { QueryClient } from '@tanstack/react-query'

export interface User { id: number; email: string; displayName: string }
export interface Workspace { id: number; name: string; role: string }
export interface Project { id: number; workspaceId: number; parentProjectId?: number | null; name: string; key: string; nextIssueNumber?: number; description?: string; archivedAt?: string | null }
export interface Member { id: number; email: string; displayName: string; role: string }
export interface Issue {
  id: number; projectId: number; key: string; number: number; title: string; description?: string | null;
  type: 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'SUBTASK'; status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'; reporterId: number; assigneeId?: number | null;
  assigneeName?: string | null; startDate?: string | null; dueDate?: string | null; progress: number;
  storyPoints?: number | null; parentId?: number | null; versionId?: number | null; sprintId?: number | null;
  sortOrder: number; version: number; updatedAt: string
}
export interface Sprint { id: number; name: string; goal?: string; startOn: string; endOn: string; status: 'PLANNED' | 'ACTIVE' | 'CLOSED' }
export interface Version { id: number; name: string; startDate?: string | null; dueDate: string; status: string }
export interface Relation { id: number; fromId: number; toId: number; type: 'BLOCKS' | 'PRECEDES' }
export interface SavedView { id: number; name: string; filters: string; options: string }
export interface Comment { id: number; body: string; authorId: number; authorName: string; createdAt: string }

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

export const issuePath = (projectId: number, issueId: number) => `/projects/${projectId}/issues/${issueId}`
export const projectPath = (projectId: number) => `/projects/${projectId}`

export async function refreshProjectIssues(client: QueryClient, projectId: number) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['project', String(projectId)] }),
    client.invalidateQueries({ queryKey: ['issues', projectId] }),
    client.invalidateQueries({ queryKey: ['issue-directory', projectId] }),
    client.invalidateQueries({ queryKey: ['issue', projectId] }),
    client.invalidateQueries({ queryKey: ['activities', projectId] }),
    client.invalidateQueries({ queryKey: ['relations', projectId] }),
    client.invalidateQueries({ queryKey: ['gantt'] }),
  ])
}
