import { useState } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useIssues, refreshProjectIssues, matchesIssue, ProjectIssueFilters, useProjectFilters } from '@/features/issue'
import { useProjectAccess } from '@/features/project'
import { useSprints } from '../../api/useSprints'
import { Button } from '@/shared/ui/button'
import { IssueCard, issuePath, statusLabels } from '@/features/issue'
import type { Issue } from '@/features/issue'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'

export function SprintsScreen({ projectId }: { projectId: number }) {
  const sprints = useSprints(projectId)
  const issues = useIssues(projectId)
  const { filters } = useProjectFilters()
  const { archived, manager, canExecute } = useProjectAccess(projectId)
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [startOn, setStartOn] = useState('')
  const [endOn, setEndOn] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [summary, setSummary] = useState('')
  const [historyId, setHistoryId] = useState<number | null>(null)
  const [closingId, setClosingId] = useState<number | null>(null)
  const [nextSprintId, setNextSprintId] = useState('')
  const history = useQuery({ queryKey: ['sprint-history', projectId, historyId], queryFn: () => api<{ key: string; title: string; finalStatus: string; finalStoryPoints: number | null }[]>(`/projects/${projectId}/sprints/${historyId}/history`), enabled: historyId !== null })
  const historySummary = history.data?.reduce((result, item) => ({ count: result.count + 1, done: result.done + Number(item.finalStatus === 'DONE'), donePoints: result.donePoints + (item.finalStatus === 'DONE' ? item.finalStoryPoints ?? 0 : 0), remainingPoints: result.remainingPoints + (item.finalStatus !== 'DONE' ? item.finalStoryPoints ?? 0 : 0) }), { count: 0, done: 0, donePoints: 0, remainingPoints: 0 })
  const active = sprints.data?.find(sprint => sprint.status === 'ACTIVE')
  const activeIssues = (issues.data?.items ?? []).filter(issue => issue.sprintId === active?.id)
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
    try { const result = await api<{ issueCount: number; doneCount: number; donePoints: number; remainingPoints: number }>(`/projects/${projectId}/sprints/${id}/close`, { body: { nextSprintId: nextSprintId ? Number(nextSprintId) : null } }); setSummary(`${result.issueCount}개 중 ${result.doneCount}개 완료 · 완료 ${result.donePoints}점 / 미완료 ${result.remainingPoints}점`); setClosingId(null); setNextSprintId(''); await client.invalidateQueries({ queryKey: ['sprints', projectId] }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function move(issue: Issue, status: Issue['status']) {
    if (!canExecute(issue) || busyId !== null || issue.status === status) return
    setBusyId(issue.id); setError('')
    try { await api(issuePath(projectId, issue.id) + '/status', { method: 'PATCH', body: { status, version: issue.version } }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message); await client.invalidateQueries({ queryKey: ['issues', projectId] }) }
    finally { setBusyId(null) }
  }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">SPRINT CYCLE</p><h1>스프린트</h1><p>목표를 정하고, 이슈를 진행한 뒤 결과를 보존합니다.</p></div>{manager && <Button disabled={archived} onClick={() => setOpen(true)}>스프린트 계획</Button>}</div>{error && <p className="form-message" role="alert">{error}</p>}{summary && <p className="success-message" role="status">{summary}</p>}{sprints.isPending && <p className="loading-state">스프린트를 불러오는 중입니다…</p>}{sprints.isError && <p className="form-message" role="alert">{sprints.error.message}</p>}{issues.isError && <p className="form-message" role="alert">{issues.error.message}</p>}<ProjectIssueFilters projectId={projectId} prefix="스프린트" />{active ? <section className="active-sprint"><div className="section-heading"><div><p className="eyebrow">진행 중</p><h2>{active.name}</h2><p>{active.goal}</p><p className="muted">{active.startOn.slice(0, 10)} – {active.endOn.slice(0, 10)} · {activeIssues.filter(issue => issue.status === 'DONE').length}/{activeIssues.length}개 완료 · {activeIssues.reduce((sum, issue) => sum + (issue.storyPoints ?? 0), 0)}점</p></div>{manager && <Button disabled={archived} variant="outline" onClick={() => setClosingId(active.id)}>스프린트 종료</Button>}</div><div className="board-grid sprint-board" role="region" aria-label="스프린트 이슈 보드" tabIndex={0}>{Object.entries(statusLabels).map(([status, label]) => { const cards = issues.data?.items.filter(issue => issue.sprintId === active.id && issue.status === status && matchesIssue(issue, filters)) ?? []; return <section key={status} className="board-column" aria-label={`${label} 열`}><header><h2>{label}</h2><span>{cards.length}</span></header><div className="board-cards">{cards.map(issue => <IssueCard key={issue.id} issue={issue} disabled={!canExecute(issue)} busy={busyId === issue.id} onStatusChange={move} />)}</div></section> })}</div></section> : <p className="empty-message">진행 중인 스프린트가 없습니다. 계획 중 스프린트에 이슈를 넣고 시작하세요.</p>}<h2 className="subheading">모든 스프린트</h2><div className="sprint-list">{sprints.data?.map(sprint => <article key={sprint.id} className="sprint-tile"><div><strong>{sprint.name}</strong><p>{sprint.startOn.slice(0, 10)} – {sprint.endOn.slice(0, 10)} · {sprint.status === 'PLANNED' ? '계획' : sprint.status === 'ACTIVE' ? '진행 중' : '종료'}</p></div>{manager && sprint.status === 'PLANNED' && <Button variant="outline" disabled={archived || !!active} onClick={() => start(sprint.id)}>시작</Button>}{sprint.status === 'CLOSED' && <Button variant="outline" onClick={() => setHistoryId(sprint.id)}>결과 보기</Button>}</article>)}</div><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>스프린트 계획</DialogTitle></DialogHeader><form className="form-stack" onSubmit={create}><label>스프린트 이름<Input placeholder="스프린트 이름" value={name} onChange={e => setName(e.target.value)} required /></label><label>목표<Textarea placeholder="목표" value={goal} onChange={e => setGoal(e.target.value)} /></label><label>시작일<Input type="date" value={startOn} onChange={e => setStartOn(e.target.value)} required /></label><label>종료일<Input type="date" value={endOn} onChange={e => setEndOn(e.target.value)} required /></label><Button type="submit">계획 저장</Button></form></DialogContent></Dialog><Dialog open={closingId !== null} onOpenChange={value => { if (!value) setClosingId(null) }}><DialogContent><DialogHeader><DialogTitle>스프린트 종료</DialogTitle></DialogHeader><p>완료되지 않은 이슈를 어디로 옮길지 선택하세요. 종료 당시 결과는 보존됩니다.</p><label>이동할 곳<select value={nextSprintId} onChange={e => setNextSprintId(e.target.value)}><option value="">백로그</option>{sprints.data?.filter(sprint => sprint.status === 'PLANNED').map(sprint => <option value={sprint.id} key={sprint.id}>{sprint.name}</option>)}</select></label><div className="setting-actions"><Button variant="outline" onClick={() => setClosingId(null)}>취소</Button><Button onClick={() => closingId !== null && close(closingId)}>종료 확정</Button></div></DialogContent></Dialog><Dialog open={historyId !== null} onOpenChange={value => { if (!value) setHistoryId(null) }}><DialogContent><DialogHeader><DialogTitle>종료 당시 결과</DialogTitle></DialogHeader>{history.isPending && <p>결과를 불러오는 중입니다…</p>}{history.isError && <p role="alert">{history.error.message}</p>}{historySummary && <p className="muted">{historySummary.count}개 중 {historySummary.done}개 완료 · 완료 {historySummary.donePoints}점 / 미완료 {historySummary.remainingPoints}점</p>}{history.data?.map(item => <p key={item.key}>{item.key} · {item.title} · {statusLabels[item.finalStatus as Issue['status']]} · {item.finalStoryPoints ?? 0}점</p>)}</DialogContent></Dialog></section>
}
