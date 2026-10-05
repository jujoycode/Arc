import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Issue, Member, Project, Version } from './api'
import { priorityLabels, statusLabels, typeLabels } from './issueLabels'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface ProjectFilters { search: string; status: string; type: string; priority: string; assigneeId: string; versionId: string; sprintState: string }
const empty: ProjectFilters = { search: '', status: '', type: '', priority: '', assigneeId: '', versionId: '', sprintState: '' }
const Context = createContext<{ filters: ProjectFilters; update: (patch: Partial<ProjectFilters>) => void; reset: () => void } | null>(null)

export function ProjectFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<ProjectFilters>(empty)
  return <Context.Provider value={{ filters, update: patch => setFilters(current => ({ ...current, ...patch })), reset: () => setFilters(empty) }}>{children}</Context.Provider>
}
export function useProjectFilters() {
  const context = useContext(Context)
  if (!context) throw new Error('Project filters require a project context')
  return context
}
export function matchesIssue(issue: Issue, filters: ProjectFilters): boolean {
  const query = filters.search.trim().toLocaleLowerCase()
  return (!query || `${issue.key} ${issue.title}`.toLocaleLowerCase().includes(query)) &&
    (!filters.status || issue.status === filters.status) && (!filters.type || issue.type === filters.type) &&
    (!filters.priority || issue.priority === filters.priority) && (!filters.assigneeId || issue.assigneeId === Number(filters.assigneeId)) &&
    (!filters.versionId || issue.versionId === Number(filters.versionId)) &&
    (!filters.sprintState || (filters.sprintState === 'BACKLOG' ? !issue.sprintId : !!issue.sprintId))
}

export function ProjectIssueFilters({ projectId, prefix = '', onChange }: { projectId: number; prefix?: string; onChange?: () => void }) {
  const { filters, update, reset } = useProjectFilters()
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const members = useQuery({ queryKey: ['members', project.data?.workspaceId], queryFn: () => api<Member[]>(`/auth/workspaces/${project.data!.workspaceId}/members`), enabled: !!project.data })
  const versions = useQuery({ queryKey: ['versions', projectId], queryFn: () => api<Version[]>(`/projects/${projectId}/versions`) })
  function change(key: keyof ProjectFilters, value: string) { update({ [key]: value }); onChange?.() }
  const label = (name: string) => `${prefix}${prefix ? ' ' : ''}${name}`
  const choices: [keyof ProjectFilters, string, string, [string, string][]][] = [
    ['status', '상태', '모든 상태', Object.entries(statusLabels)], ['type', '유형', '모든 유형', Object.entries(typeLabels)],
    ['priority', '우선순위', '모든 우선순위', Object.entries(priorityLabels)],
    ['assigneeId', '담당자', '모든 담당자', (members.data ?? []).map(member => [String(member.id), member.displayName])],
    ['versionId', '버전', '모든 버전', (versions.data ?? []).map(version => [String(version.id), version.name])],
    ['sprintState', '스프린트', '스프린트 전체', [['BACKLOG', '백로그'], ['ASSIGNED', '스프린트 편성']]],
  ]
  return <div className="directory-filters" aria-label={label('이슈 필터')}>
    <Input type="search" aria-label={label('이슈 검색')} placeholder="키 또는 제목 검색" value={filters.search} onChange={event => change('search', event.target.value)} />
    {choices.map(([key, name, all, options]) => <select key={key} aria-label={label(`${name} 필터`)} value={filters[key]} onChange={event => change(key, event.target.value)}><option value="">{all}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>)}
    <Button variant="outline" disabled={!Object.values(filters).some(Boolean)} onClick={() => { reset(); onChange?.() }}>필터 초기화</Button>
    {Object.values(filters).some(Boolean) && <span className="muted">필터 적용</span>}
  </div>
}
