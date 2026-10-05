import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api } from './api'
import type { Issue, Project, Relation, SavedView, Version } from './api'
import { GanttChart } from './GanttChart'
import type { GanttIssue, GanttRelation } from './gantt'

export function useIssues(projectId: number) {
  return useQuery({ queryKey: ['issues', projectId], queryFn: async () => {
    const items: Issue[] = []
    let page = 0, total = 0
    do {
      const result = await api<{ items: Issue[]; total: number }>(`/projects/${projectId}/issues?size=1000&page=${page}`)
      total = result.total
      items.push(...result.items)
      if (!result.items.length) break
      page += 1
    } while (items.length < total)
    return { items, total }
  } })
}

interface GanttBundle { projects: Project[]; issues: Issue[]; versions: (Version & { projectId: number })[]; relations: Relation[] }

function ganttRows(rootId: number, projects: Project[], issues: Issue[], versions: GanttBundle['versions']): GanttIssue[] {
  const rows: GanttIssue[] = []
  const projectChildren = new Map<number, Project[]>()
  for (const project of projects) if (project.parentProjectId) projectChildren.set(project.parentProjectId, [...(projectChildren.get(project.parentProjectId) ?? []), project])
  const byParent = new Map<string, Issue[]>()
  for (const issue of [...issues].sort((a, b) => a.number - b.number)) {
    const parent = issue.parentId ? `issue-${issue.parentId}` : issue.versionId ? `version-${issue.versionId}` : `project-${issue.projectId}`
    byParent.set(parent, [...(byParent.get(parent) ?? []), issue])
  }
  const childrenByIssue = new Map<number, Issue[]>()
  for (const issue of issues) if (issue.parentId) childrenByIssue.set(issue.parentId, [...(childrenByIssue.get(issue.parentId) ?? []), issue])
  const aggregateCache = new Map<number, { start?: string; end?: string; progress: number }>()
  const byVersion = new Map(versions.map(version => [version.id, version]))
  function aggregate(issue: Issue): { start?: string; end?: string; progress: number } {
    const cached = aggregateCache.get(issue.id)
    if (cached) return cached
    const children = childrenByIssue.get(issue.id) ?? []
    const assignedVersion = issue.versionId ? byVersion.get(issue.versionId) : undefined
    const childData = children.map(aggregate)
    const starts = children.length ? childData.map(child => child.start) : [issue.startDate?.slice(0, 10) ?? assignedVersion?.startDate?.slice(0, 10)]
    const ends = children.length ? childData.map(child => child.end) : [issue.dueDate?.slice(0, 10) ?? assignedVersion?.dueDate.slice(0, 10)]
    const result = { start: starts.filter((value): value is string => !!value).sort()[0], end: ends.filter((value): value is string => !!value).sort().at(-1), progress: children.length ? Math.round(childData.reduce((sum, child) => sum + child.progress, 0) / children.length) : issue.progress }
    aggregateCache.set(issue.id, result)
    return result
  }
  const seen = new Set<number>()
  function addChildren(parent: string) {
    for (const issue of byParent.get(parent) ?? []) {
      if (seen.has(issue.id)) continue
      seen.add(issue.id)
      const group = aggregate(issue)
      rows.push({ id: String(issue.id), parentId: parent, key: issue.key, title: issue.title, kind: issue.type, status: issue.status, assignee: issue.assigneeName ?? undefined, assigneeId: issue.assigneeId?.toString(), priority: issue.priority, versionId: issue.versionId?.toString(), startDate: group.start, dueDate: group.end, progress: group.progress, sprintId: issue.sprintId?.toString(), aggregated: childrenByIssue.has(issue.id) })
      addChildren(`issue-${issue.id}`)
    }
  }
  function addProject(project: Project, parent?: string) {
    const childProjects = projectChildren.get(project.id) ?? []
    const subtree = new Set<number>([project.id])
    function collect(id: number) { for (const child of projectChildren.get(id) ?? []) { subtree.add(child.id); collect(child.id) } }
    collect(project.id)
    const projectIssues = issues.filter(issue => subtree.has(issue.projectId))
    const projectVersions = versions.filter(version => subtree.has(version.projectId))
    const starts = [...projectIssues.map(issue => aggregate(issue).start), ...projectVersions.map(version => version.startDate?.slice(0, 10))].filter((value): value is string => !!value)
    const ends = [...projectIssues.map(issue => aggregate(issue).end), ...projectVersions.map(version => version.dueDate.slice(0, 10))].filter((value): value is string => !!value)
    rows.push({ id: `project-${project.id}`, projectId: String(project.id), parentId: parent, key: project.key, title: project.name, kind: 'PROJECT', status: 'IN_PROGRESS', startDate: starts.sort()[0], dueDate: ends.sort().at(-1), aggregated: true, progress: projectIssues.length ? Math.round(projectIssues.reduce((sum, issue) => sum + issue.progress, 0) / projectIssues.length) : 0 })
    for (const child of childProjects) addProject(child, `project-${project.id}`)
    for (const version of versions.filter(item => item.projectId === project.id)) {
      const id = `version-${version.id}`
      const versionIssues = issues.filter(issue => issue.versionId === version.id)
      rows.push({ id, projectId: String(project.id), parentId: `project-${project.id}`, key: version.name, title: version.name, kind: 'VERSION', status: 'TODO', startDate: version.startDate?.slice(0, 10), dueDate: version.dueDate.slice(0, 10), aggregated: true, progress: versionIssues.length ? Math.round(versionIssues.reduce((sum, issue) => sum + aggregate(issue).progress, 0) / versionIssues.length) : 0 })
      addChildren(id)
    }
    addChildren(`project-${project.id}`)
  }
  const root = projects.find(project => project.id === rootId)
  if (root) addProject(root)
  // Parent IDs of issues use the row IDs, rather than the grouping lookup keys.
  for (const row of rows) if (row.parentId?.startsWith('issue-')) row.parentId = row.parentId.slice(6)
  return rows
}

export function GanttScreen({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gantt = useQuery({ queryKey: ['gantt', projectId], queryFn: () => api<GanttBundle>(`/projects/${projectId}/gantt`) })
  const views = useQuery({ queryKey: ['saved-views', projectId], queryFn: () => api<SavedView[]>(`/projects/${projectId}/saved-views`) })
  const rows = useMemo(() => gantt.data ? ganttRows(projectId, gantt.data.projects, gantt.data.issues, gantt.data.versions) : [], [projectId, gantt.data])
  const lines: GanttRelation[] = (gantt.data?.relations ?? []).map(relation => ({ fromId: String(relation.fromId), toId: String(relation.toId), kind: relation.type }))
  async function saveView(name: string, filters: string, options: string) {
    await api(`/projects/${projectId}/saved-views`, { body: { name, filters, options } })
    await queryClient.invalidateQueries({ queryKey: ['saved-views', projectId] })
  }
  async function deleteView(id: number) {
    await api(`/projects/${projectId}/saved-views/${id}`, { method: 'DELETE' })
    await queryClient.invalidateQueries({ queryKey: ['saved-views', projectId] })
  }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">PROJECT TIMELINE</p><h1>간트 차트</h1><p>현재 프로젝트와 하위 프로젝트의 일정, 완료율, 선행 관계를 확인하세요.</p></div><span className="data-badge">{gantt.data?.issues.length ?? 0}개 이슈</span></div>{gantt.isError && <p className="form-message" role="alert">{(gantt.error as Error).message}</p>}{gantt.isPending ? <p className="loading-state">일정을 불러오는 중입니다…</p> : <GanttChart issues={rows} relations={lines} savedViews={views.data} onSaveView={saveView} onDeleteView={deleteView} onOpenIssue={id => { const issue = gantt.data?.issues.find(item => item.id === Number(id)); if (issue) navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(issue.projectId), issueId: id } }) }} onOpenProject={id => navigate({ to: '/projects/$projectId/gantt', params: { projectId: id } })} onOpenVersion={id => navigate({ to: '/projects/$projectId/settings', params: { projectId: id } })} />}</section>
}
