import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useIssues, refreshProjectIssues, matchesIssue, ProjectIssueFilters, useProjectFilters } from '@/features/issue'
import { useProjectAccess } from '@/features/project'
import { useSprints } from '../../api/useSprints'
import { Button } from '@/shared/ui/button'
import { ListPagination } from '@/shared/ui/list-pagination'

export function BacklogScreen({ projectId }: { projectId: number }) {
  const issues = useIssues(projectId)
  const { filters } = useProjectFilters()
  const { archived, manager } = useProjectAccess(projectId)
  const sprints = useSprints(projectId)
  const client = useQueryClient()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const allBacklog = (issues.data?.items ?? []).filter(issue => !issue.sprintId).sort((a, b) => a.sortOrder - b.sortOrder)
  const backlog = allBacklog.filter(issue => matchesIssue(issue, filters))
  const filterKey = JSON.stringify(filters)
  const [pagination, setPagination] = useState({ filterKey, page: 0 })
  const pages = Math.max(1, Math.ceil(backlog.length / 100))
  const page = pagination.filterKey === filterKey ? Math.min(pagination.page, pages - 1) : 0
  const start = page * 100
  const pageBacklog = backlog.slice(start, start + 100)
  async function assign(issueId: number, sprintId: string) {
    if (!manager || archived || busy) return
    setBusy(true); setError('')
    try { await api(`/projects/${projectId}/issues/${issueId}/sprint`, { method: 'PUT', body: { sprintId: sprintId ? Number(sprintId) : null } }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message); await client.invalidateQueries({ queryKey: ['issues', projectId] }) }
    finally { setBusy(false) }
  }
  async function reorder(index: number, change: number) {
    if (!manager || archived || busy) return
    const ids = allBacklog.map(issue => issue.id)
    const target = index + change
    if (target < 0 || target >= ids.length) return
    const fromIndex = ids.indexOf(backlog[index].id), toIndex = ids.indexOf(backlog[target].id)
    ;[ids[fromIndex], ids[toIndex]] = [ids[toIndex], ids[fromIndex]]
    setBusy(true); setError('')
    try { await api(`/projects/${projectId}/backlog/order`, { method: 'PUT', body: { issueIds: ids } }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message); await client.invalidateQueries({ queryKey: ['issues', projectId] }) }
    finally { setBusy(false) }
  }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">SPRINT PLANNING</p><h1>백로그</h1><p>{manager ? '할 일을 정렬하고 계획 중 스프린트에 편성하세요.' : '팀의 업무 우선순위와 스프린트 계획을 확인하세요. 계획 변경은 관리자가 담당합니다.'}</p></div><span className="data-badge">{backlog.length}개 미편성</span></div>{error && <p className="form-message" role="alert">{error}</p>}<ProjectIssueFilters projectId={projectId} prefix="백로그" />{issues.isPending && <p className="loading-state">백로그를 불러오는 중입니다…</p>}{issues.isError && <p className="form-message" role="alert">{issues.error.message}</p>}{sprints.isError && <p className="form-message" role="alert">{sprints.error.message}</p>}<div className="backlog-list">{pageBacklog.map((issue, offset) => <article className="backlog-row" key={issue.id}><div className="backlog-order"><Button size="icon-xs" variant="ghost" disabled={!manager || archived || busy || start + offset === 0} onClick={() => reorder(start + offset, -1)} aria-label={`${issue.key} 위로`}>↑</Button><Button size="icon-xs" variant="ghost" disabled={!manager || archived || busy || start + offset === backlog.length - 1} onClick={() => reorder(start + offset, 1)} aria-label={`${issue.key} 아래로`}>↓</Button></div><Link to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(issue.id) }}><small>{issue.key} · {issue.storyPoints ?? '—'}점</small><strong>{issue.title}</strong></Link><select disabled={!manager || archived || busy} aria-label={`${issue.key} 스프린트 편성`} value="" onChange={e => assign(issue.id, e.target.value)}><option value="">스프린트에 넣기</option>{sprints.data?.filter(sprint => sprint.status === 'PLANNED').map(sprint => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></article>)}{!issues.isPending && !issues.isError && backlog.length === 0 && <p className="empty-message">백로그에 이슈가 없습니다.</p>}</div><ListPagination label="백로그" page={page} pages={pages} total={backlog.length} onPageChange={page => setPagination({ filterKey, page })} /><h2 className="subheading">계획 중 스프린트</h2>{sprints.data?.filter(sprint => sprint.status === 'PLANNED').map(sprint => <div className="sprint-plan" key={sprint.id}><strong>{sprint.name}</strong><span>{sprint.startOn.slice(0, 10)} – {sprint.endOn.slice(0, 10)}</span>{issues.data?.items.filter(issue => issue.sprintId === sprint.id && matchesIssue(issue, filters)).map(issue => <div key={issue.id} className="sprint-assigned"><Link to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(issue.id) }}>{issue.key} {issue.title}</Link><Button size="xs" variant="ghost" disabled={!manager || archived || busy} onClick={() => assign(issue.id, '')}>백로그로</Button></div>)}</div>)}</section>
}
