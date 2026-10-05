import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, issuePath, refreshProjectIssues } from './api'
import type { Issue, Sprint } from './api'
import { useIssues } from './GanttScreen'
import { statusLabels } from './IssueForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function useSprints(projectId: number) { return useQuery({ queryKey: ['sprints', projectId], queryFn: () => api<Sprint[]>(`/projects/${projectId}/sprints`) }) }

export function BacklogScreen({ projectId }: { projectId: number }) {
  const issues = useIssues(projectId)
  const sprints = useSprints(projectId)
  const client = useQueryClient()
  const [error, setError] = useState('')
  const backlog = (issues.data?.items ?? []).filter(issue => !issue.sprintId).sort((a, b) => a.sortOrder - b.sortOrder)
  async function assign(issueId: number, sprintId: string) {
    setError('')
    try { await api(`/projects/${projectId}/issues/${issueId}/sprint`, { method: 'PUT', body: { sprintId: sprintId ? Number(sprintId) : null } }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function reorder(index: number, change: number) {
    const ids = backlog.map(issue => issue.id)
    const target = index + change
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try { await api(`/projects/${projectId}/backlog/order`, { method: 'PUT', body: { issueIds: ids } }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message) }
  }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">SPRINT PLANNING</p><h1>백로그</h1><p>할 일을 정렬하고 계획 중 스프린트에 편성하세요.</p></div><span className="data-badge">{backlog.length}개 미편성</span></div>{error && <p className="form-message" role="alert">{error}</p>}<div className="backlog-list">{backlog.map((issue, index) => <article className="backlog-row" key={issue.id}><div className="backlog-order"><Button size="icon-xs" variant="ghost" disabled={index === 0} onClick={() => reorder(index, -1)} aria-label={`${issue.key} 위로`}>↑</Button><Button size="icon-xs" variant="ghost" disabled={index === backlog.length - 1} onClick={() => reorder(index, 1)} aria-label={`${issue.key} 아래로`}>↓</Button></div><Link to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(issue.id) }}><small>{issue.key} · {issue.storyPoints ?? '—'}점</small><strong>{issue.title}</strong></Link><select aria-label={`${issue.key} 스프린트 편성`} value="" onChange={e => assign(issue.id, e.target.value)}><option value="">스프린트에 넣기</option>{sprints.data?.filter(sprint => sprint.status === 'PLANNED').map(sprint => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></article>)}{backlog.length === 0 && <p className="empty-message">백로그에 이슈가 없습니다.</p>}</div><h2 className="subheading">계획 중 스프린트</h2>{sprints.data?.filter(sprint => sprint.status === 'PLANNED').map(sprint => <div className="sprint-plan" key={sprint.id}><strong>{sprint.name}</strong><span>{sprint.startOn.slice(0, 10)} – {sprint.endOn.slice(0, 10)}</span>{issues.data?.items.filter(issue => issue.sprintId === sprint.id).map(issue => <div key={issue.id} className="sprint-assigned"><Link to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(issue.id) }}>{issue.key} {issue.title}</Link><Button size="xs" variant="ghost" onClick={() => assign(issue.id, '')}>백로그로</Button></div>)}</div>)}</section>
}

export function SprintsScreen({ projectId }: { projectId: number }) {
  const sprints = useSprints(projectId)
  const issues = useIssues(projectId)
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [startOn, setStartOn] = useState('')
  const [endOn, setEndOn] = useState('')
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')
  const [historyId, setHistoryId] = useState<number | null>(null)
  const [closingId, setClosingId] = useState<number | null>(null)
  const [nextSprintId, setNextSprintId] = useState('')
  const history = useQuery({ queryKey: ['sprint-history', projectId, historyId], queryFn: () => api<{ key: string; title: string; finalStatus: string }[]>(`/projects/${projectId}/sprints/${historyId}/history`), enabled: historyId !== null })
  const active = sprints.data?.find(sprint => sprint.status === 'ACTIVE')
  async function create(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try { await api(`/projects/${projectId}/sprints`, { body: { name, goal, startOn, endOn } }); setOpen(false); setName(''); await client.invalidateQueries({ queryKey: ['sprints', projectId] }) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function start(id: number) {
    try { const result = await api<{ issueCount: number; storyPoints: number }>(`/projects/${projectId}/sprints/${id}/start`, { method: 'POST' }); setSummary(`${result.issueCount}개 이슈 · ${result.storyPoints}점으로 시작했습니다.`); await client.invalidateQueries({ queryKey: ['sprints', projectId] }) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function close(id: number) {
    try { const result = await api<{ issueCount: number; doneCount: number; storyPoints: number }>(`/projects/${projectId}/sprints/${id}/close`, { body: { nextSprintId: nextSprintId ? Number(nextSprintId) : null } }); setSummary(`${result.issueCount}개 중 ${result.doneCount}개 완료 · ${result.storyPoints}점 기록`); setClosingId(null); setNextSprintId(''); await client.invalidateQueries({ queryKey: ['sprints', projectId] }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function move(issue: Issue, status: Issue['status']) {
    try { await api(issuePath(projectId, issue.id) + '/status', { method: 'PATCH', body: { status, version: issue.version } }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message) }
  }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">SPRINT CYCLE</p><h1>스프린트</h1><p>목표를 정하고, 이슈를 진행한 뒤 결과를 보존합니다.</p></div><Button onClick={() => setOpen(true)}>스프린트 계획</Button></div>{error && <p className="form-message" role="alert">{error}</p>}{summary && <p className="success-message" role="status">{summary}</p>}{active ? <section className="active-sprint"><div className="section-heading"><div><p className="eyebrow">진행 중</p><h2>{active.name}</h2><p>{active.goal}</p></div><Button variant="outline" onClick={() => setClosingId(active.id)}>스프린트 종료</Button></div><div className="board-grid sprint-board">{Object.entries(statusLabels).map(([status, label]) => { const cards = issues.data?.items.filter(issue => issue.sprintId === active.id && issue.status === status) ?? []; return <section key={status} className="board-column" aria-label={`${label} 열`}><header><h2>{label}</h2><span>{cards.length}</span></header><div className="board-cards">{cards.map(issue => <article className="board-card" key={issue.id}><Link to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(issue.id) }} className="card-main"><span className="card-key">{issue.key} · {issue.storyPoints ?? '—'}점</span><strong>{issue.title}</strong></Link><label className="card-status-label">상태 변경<select value={issue.status} onChange={e => move(issue, e.target.value as Issue['status'])}>{Object.entries(statusLabels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label></article>)}</div></section> })}</div></section> : <p className="empty-message">진행 중인 스프린트가 없습니다. 계획 중 스프린트에 이슈를 넣고 시작하세요.</p>}<h2 className="subheading">모든 스프린트</h2><div className="sprint-list">{sprints.data?.map(sprint => <article key={sprint.id} className="sprint-tile"><div><strong>{sprint.name}</strong><p>{sprint.startOn.slice(0, 10)} – {sprint.endOn.slice(0, 10)} · {sprint.status === 'PLANNED' ? '계획' : sprint.status === 'ACTIVE' ? '진행 중' : '종료'}</p></div>{sprint.status === 'PLANNED' && <Button variant="outline" disabled={!!active} onClick={() => start(sprint.id)}>시작</Button>}{sprint.status === 'CLOSED' && <Button variant="outline" onClick={() => setHistoryId(sprint.id)}>결과 보기</Button>}</article>)}</div><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>스프린트 계획</DialogTitle></DialogHeader><form className="form-stack" onSubmit={create}><Input placeholder="스프린트 이름" value={name} onChange={e => setName(e.target.value)} required /><Textarea placeholder="목표" value={goal} onChange={e => setGoal(e.target.value)} /><label>시작일<Input type="date" value={startOn} onChange={e => setStartOn(e.target.value)} required /></label><label>종료일<Input type="date" value={endOn} onChange={e => setEndOn(e.target.value)} required /></label><Button type="submit">계획 저장</Button></form></DialogContent></Dialog><Dialog open={closingId !== null} onOpenChange={value => { if (!value) setClosingId(null) }}><DialogContent><DialogHeader><DialogTitle>스프린트 종료</DialogTitle></DialogHeader><p>완료되지 않은 이슈를 어디로 옮길지 선택하세요. 종료 당시 결과는 보존됩니다.</p><label>이동할 곳<select value={nextSprintId} onChange={e => setNextSprintId(e.target.value)}><option value="">백로그</option>{sprints.data?.filter(sprint => sprint.status === 'PLANNED').map(sprint => <option value={sprint.id} key={sprint.id}>{sprint.name}</option>)}</select></label><div className="setting-actions"><Button variant="outline" onClick={() => setClosingId(null)}>취소</Button><Button onClick={() => closingId !== null && close(closingId)}>종료 확정</Button></div></DialogContent></Dialog><Dialog open={historyId !== null} onOpenChange={value => { if (!value) setHistoryId(null) }}><DialogContent><DialogHeader><DialogTitle>종료 당시 결과</DialogTitle></DialogHeader>{history.data?.map(item => <p key={item.key}>{item.key} · {item.title} · {statusLabels[item.finalStatus as Issue['status']]}</p>)}</DialogContent></Dialog></section>
}
