import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { Member } from '@/features/workspace'
import type { Project, Version } from '@/features/project'
import { priorityLabels, statusLabels, typeLabels } from '../model/issueLabels'
import { useProjectFilters } from '../model/ProjectFilters'
import type { ProjectFilters } from '../model/ProjectFilters'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'

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
    {Object.values(filters).some(Boolean) && <div className="filter-chips" aria-label="적용된 필터">{filters.search && <button type="button" className="filter-chip" onClick={() => change('search', '')} aria-label="검색 필터 해제">검색: {filters.search} ×</button>}{choices.filter(([key]) => filters[key]).map(([key, name, , options]) => <button type="button" key={key} className="filter-chip" onClick={() => change(key, '')} aria-label={`${name} 필터 해제`}>{name}: {options.find(([value]) => value === filters[key])?.[1] ?? filters[key]} ×</button>)}</div>}
  </div>
}
