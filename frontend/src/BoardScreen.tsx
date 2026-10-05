import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { api, issuePath, refreshProjectIssues } from './api'
import type { Issue } from './api'
import { useIssues } from './GanttScreen'
import { IssueForm, priorityLabels, statusLabels, typeLabels } from './IssueForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function BoardScreen({ projectId }: { projectId: number }) {
  const issues = useIssues(projectId)
  const client = useQueryClient()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('')
  const [priority, setPriority] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const assignees = Array.from(new Map((issues.data?.items ?? []).filter(issue => issue.assigneeId).map(issue => [issue.assigneeId!, issue.assigneeName ?? '이름 없음'])).entries())
  const visible = (issues.data?.items ?? []).filter(issue => (!search || `${issue.key} ${issue.title}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && (!kind || issue.type === kind) && (!priority || issue.priority === priority) && (!assigneeId || issue.assigneeId === Number(assigneeId)))
  async function move(issue: Issue, status: Issue['status']) {
    if (issue.status === status) return
    setBusyId(issue.id); setError('')
    try { await api(issuePath(projectId, issue.id) + '/status', { method: 'PATCH', body: { status, version: issue.version } }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message); await client.invalidateQueries({ queryKey: ['issues', projectId] }) }
    finally { setBusyId(null) }
  }
  function open(issue: Issue) { navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(projectId), issueId: String(issue.id) } }) }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">KANBAN BOARD</p><h1>칸반 보드</h1><p>상태를 바꾸면 이슈 상세와 스프린트에도 같은 값이 반영됩니다.</p></div><Button onClick={() => setCreateOpen(true)}><Plus size={16} /> 이슈 만들기</Button></div>{error && <p className="form-message" role="alert">{error}</p>}
    <div className="directory-filters" aria-label="보드 필터"><Input type="search" aria-label="보드 이슈 검색" placeholder="키 또는 제목 검색" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="보드 유형 필터" value={kind} onChange={event => setKind(event.target.value)}><option value="">모든 유형</option>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select aria-label="보드 우선순위 필터" value={priority} onChange={event => setPriority(event.target.value)}><option value="">모든 우선순위</option>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select aria-label="보드 담당자 필터" value={assigneeId} onChange={event => setAssigneeId(event.target.value)}><option value="">모든 담당자</option>{assignees.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select><Button variant="outline" disabled={!search && !kind && !priority && !assigneeId} onClick={() => { setSearch(''); setKind(''); setPriority(''); setAssigneeId('') }}>필터 초기화</Button><span className="muted">{visible.length}개 결과</span></div>
    {issues.isPending ? <p className="loading-state">이슈를 불러오는 중입니다…</p> : <div className="board-grid">{Object.entries(statusLabels).map(([status, label]) => { const cards = visible.filter(issue => issue.status === status); return <section key={status} className="board-column" aria-label={`${label} 열`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const id = Number(event.dataTransfer.getData('text/plain')); const issue = issues.data?.items.find(item => item.id === id); if (issue) move(issue, status as Issue['status']) }}><header><h2>{label}</h2><span>{cards.length}</span></header><div className="board-cards">{cards.map(issue => <article key={issue.id} className="board-card" draggable onDragStart={event => event.dataTransfer.setData('text/plain', String(issue.id))}><button type="button" onClick={() => open(issue)} className="card-main"><span className="card-key">{issue.key} · {typeLabels[issue.type]}</span><strong>{issue.title}</strong></button><div className="card-meta"><Badge variant="secondary">{priorityLabels[issue.priority]}</Badge><span>{issue.assigneeName ?? '미지정'}</span></div><label className="card-status-label">상태 변경<select value={issue.status} disabled={busyId === issue.id} onChange={event => move(issue, event.target.value as Issue['status'])}>{Object.entries(statusLabels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label></article>)}</div></section> })}</div>}
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>이슈 만들기</DialogTitle></DialogHeader><IssueForm projectId={projectId} onSaved={id => { setCreateOpen(false); navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(projectId), issueId: String(id) } }) }} onCancel={() => setCreateOpen(false)} /></DialogContent></Dialog></section>
}
