import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api } from './api'
import type { Issue, Project, Relation, SavedView, Version } from './api'
import { GanttChart } from './GanttChart'
import type { GanttIssue, GanttRelation } from './gantt'

export function useIssues(projectId: number) {
  return useQuery({ queryKey: ['issues', projectId], queryFn: () => api<{ items: Issue[]; total: number }>(`/projects/${projectId}/issues?size=1000`) })
}

function ganttRows(project: Project, issues: Issue[], versions: Version[]): GanttIssue[] {
  const rows: GanttIssue[] = []
  const dates = issues.flatMap(issue => [issue.startDate, issue.dueDate].filter(Boolean) as string[]).map(date => date.slice(0, 10))
  const start = dates.length ? [...dates].sort()[0] : undefined
  const end = dates.length ? [...dates].sort().at(-1) : undefined
  rows.push({ id: `project-${project.id}`, key: project.key, title: project.name, kind: 'PROJECT', status: 'IN_PROGRESS', startDate: start, dueDate: end, progress: issues.length ? Math.round(issues.reduce((sum, issue) => sum + issue.progress, 0) / issues.length) : 0 })
  const byParent = new Map<string, Issue[]>()
  for (const issue of [...issues].sort((a, b) => a.number - b.number)) {
    const parent = issue.parentId ? `issue-${issue.parentId}` : issue.versionId ? `version-${issue.versionId}` : `project-${project.id}`
    byParent.set(parent, [...(byParent.get(parent) ?? []), issue])
  }
  const seen = new Set<number>()
  function addChildren(parent: string) {
    for (const issue of byParent.get(parent) ?? []) {
      if (seen.has(issue.id)) continue
      seen.add(issue.id)
      const descendants = issues.filter(child => child.parentId === issue.id)
      const childDates = descendants.flatMap(child => [child.startDate, child.dueDate].filter(Boolean) as string[]).map(date => date.slice(0, 10))
      rows.push({ id: String(issue.id), parentId: parent, key: issue.key, title: issue.title, kind: issue.type, status: issue.status, assignee: issue.assigneeName ?? undefined, assigneeId: issue.assigneeId?.toString(), priority: issue.priority, versionId: issue.versionId?.toString(), startDate: issue.startDate?.slice(0, 10) ?? childDates.sort()[0], dueDate: issue.dueDate?.slice(0, 10) ?? childDates.sort().at(-1), progress: descendants.length ? Math.round(descendants.reduce((sum, child) => sum + child.progress, 0) / descendants.length) : issue.progress })
      addChildren(`issue-${issue.id}`)
    }
  }
  for (const version of versions) {
    const id = `version-${version.id}`
    const versionIssues = issues.filter(issue => issue.versionId === version.id)
    rows.push({ id, parentId: `project-${project.id}`, key: version.name, title: version.name, kind: 'VERSION', status: 'TODO', startDate: version.startDate?.slice(0, 10), dueDate: version.dueDate.slice(0, 10), progress: versionIssues.length ? Math.round(versionIssues.reduce((sum, issue) => sum + issue.progress, 0) / versionIssues.length) : 0 })
    addChildren(id)
  }
  addChildren(`project-${project.id}`)
  // Parent IDs of issues use the row IDs, rather than the grouping lookup keys.
  for (const row of rows) if (row.parentId?.startsWith('issue-')) row.parentId = row.parentId.slice(6)
  return rows
}

export function GanttScreen({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const issues = useIssues(projectId)
  const versions = useQuery({ queryKey: ['versions', projectId], queryFn: () => api<Version[]>(`/projects/${projectId}/versions`) })
  const relations = useQuery({ queryKey: ['relations', projectId], queryFn: () => api<Relation[]>(`/projects/${projectId}/relations`) })
  const views = useQuery({ queryKey: ['saved-views', projectId], queryFn: () => api<SavedView[]>(`/projects/${projectId}/saved-views`) })
  const rows = useMemo(() => project.data ? ganttRows(project.data, issues.data?.items ?? [], versions.data ?? []) : [], [project.data, issues.data, versions.data])
  const lines: GanttRelation[] = (relations.data ?? []).map(relation => ({ fromId: String(relation.fromId), toId: String(relation.toId), kind: relation.type }))
  async function saveView(name: string, filters: string, options: string) {
    await api(`/projects/${projectId}/saved-views`, { body: { name, filters, options } })
    await queryClient.invalidateQueries({ queryKey: ['saved-views', projectId] })
  }
  async function deleteView(id: number) {
    await api(`/projects/${projectId}/saved-views/${id}`, { method: 'DELETE' })
    await queryClient.invalidateQueries({ queryKey: ['saved-views', projectId] })
  }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">PROJECT TIMELINE</p><h1>간트 차트</h1><p>실제 이슈와 버전의 일정, 완료율, 선행 관계를 확인하세요.</p></div><span className="data-badge">{issues.data?.total ?? 0}개 이슈</span></div>{issues.isError && <p className="form-message" role="alert">{(issues.error as Error).message}</p>}{!project.data || issues.isPending ? <p className="loading-state">일정을 불러오는 중입니다…</p> : <GanttChart issues={rows} relations={lines} savedViews={views.data} onSaveView={saveView} onDeleteView={deleteView} onOpenIssue={id => navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(projectId), issueId: id } })} />}</section>
}
