import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { api } from '@/shared/api/client'
import { issuePath, refreshProjectIssues } from '@/features/issue'
import type { Issue } from '@/features/issue'
import { useIssues } from '@/features/issue'
import { IssueForm, priorityLabels, statusLabels, typeLabels } from '@/features/issue'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { matchesIssue, ProjectIssueFilters, useProjectFilters } from '@/features/issue'
import { useProjectAccess } from '@/features/project'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'

export function BoardScreen({ projectId }: { projectId: number }) {
  const issues = useIssues(projectId)
  const client = useQueryClient()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const { filters } = useProjectFilters()
  const { archived } = useProjectAccess(projectId)
  const visible = (issues.data?.items ?? []).filter(issue => matchesIssue(issue, filters))
  async function move(issue: Issue, status: Issue['status']) {
    if (archived || issue.status === status) return
    setBusyId(issue.id); setError('')
    try { await api(issuePath(projectId, issue.id) + '/status', { method: 'PATCH', body: { status, version: issue.version } }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message); await client.invalidateQueries({ queryKey: ['issues', projectId] }) }
    finally { setBusyId(null) }
  }
  function open(issue: Issue) { navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(projectId), issueId: String(issue.id) } }) }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">KANBAN BOARD</p><h1>칸반 보드</h1><p>상태를 바꾸면 이슈 상세와 스프린트에도 같은 값이 반영됩니다.</p></div><Button disabled={archived} onClick={() => setCreateOpen(true)}><Plus size={16} /> 이슈 만들기</Button></div>{error && <p className="form-message" role="alert">{error}</p>}
    <ProjectIssueFilters projectId={projectId} prefix="보드" /><p className="muted" role="status">{visible.length}개 결과</p>
    {issues.isError && <p role="alert" className="form-message">{issues.error.message}</p>}
    {issues.isPending ? <p className="loading-state">이슈를 불러오는 중입니다…</p> : <div className="board-grid">{Object.entries(statusLabels).map(([status, label]) => { const cards = visible.filter(issue => issue.status === status); return <section key={status} className="board-column" aria-label={`${label} 열`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const id = Number(event.dataTransfer.getData('text/plain')); const issue = issues.data?.items.find(item => item.id === id); if (issue) move(issue, status as Issue['status']) }}><header><h2>{label}</h2><span>{cards.length}</span></header><div className="board-cards">{cards.map(issue => <article key={issue.id} className="board-card" draggable={!archived} onDragStart={event => event.dataTransfer.setData('text/plain', String(issue.id))}><button type="button" onClick={() => open(issue)} className="card-main"><span className="card-key">{issue.key} · {typeLabels[issue.type]}</span><strong>{issue.title}</strong></button><div className="card-meta"><Badge variant="secondary">{priorityLabels[issue.priority]}</Badge><span>{issue.assigneeName ?? '미지정'}</span></div><label className="card-status-label">상태 변경<select aria-label="상태 변경" value={issue.status} disabled={archived || busyId === issue.id} onChange={event => move(issue, event.target.value as Issue['status'])}>{Object.entries(statusLabels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label></article>)}</div></section> })}</div>}
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>이슈 만들기</DialogTitle></DialogHeader><IssueForm projectId={projectId} onSaved={id => { setCreateOpen(false); navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(projectId), issueId: String(id) } }) }} onCancel={() => setCreateOpen(false)} /></DialogContent></Dialog></section>
}
