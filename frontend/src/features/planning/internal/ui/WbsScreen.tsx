import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { api } from '@/shared/api/client'
import { buildWorkBreakdown, visibleWorkNodes, matchesIssue, useIssues, useProjectFilters, ProjectIssueFilters, IssueForm, statusLabels, typeLabels } from '@/features/issue'
import type { Ticket } from '@/features/issue'
import { useProjectAccess } from '@/features/project'
import type { Version } from '@/features/project'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

export function WbsScreen({ projectId }: { projectId: number }) {
  const tickets = useIssues(projectId), navigate = useNavigate()
  const versions = useQuery({ queryKey: ['versions', projectId], queryFn: ({ signal }) => api<Version[]>(`/projects/${projectId}/versions`, { signal }) })
  const { filters, update } = useProjectFilters(), { archived, manager, actorId, ready } = useProjectAccess(projectId)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [draft, setDraft] = useState<Pick<Ticket, 'type' | 'parentId' | 'versionId'> | null>(null)
  const nodes = useMemo(() => buildWorkBreakdown(tickets.data?.items ?? [], versions.data ?? []), [tickets.data, versions.data])
  const pending = tickets.isPending || versions.isPending
  const matches = useMemo(() => new Set(nodes.filter(node => matchesIssue(node.ticket, filters)).map(node => node.ticket.id)), [nodes, filters])
  const visible = visibleWorkNodes(nodes, matches, collapsed)
  const parents = nodes.filter(node => node.childCount > 0)
  const roots = nodes.filter(node => node.depth === 0)
  const totals = roots.reduce((sum, node) => ({ done: sum.done + node.summary.doneLeafCount, leaves: sum.leaves + node.summary.leafCount, points: sum.points + node.summary.points, unknown: sum.unknown + node.summary.unestimatedCount }), { done: 0, leaves: 0, points: 0, unknown: 0 })
  const ownTickets = (tickets.data?.items ?? []).filter(ticket => ready && ticket.assigneeId === actorId)
  function toggle(id: number) { setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  return <section className="view-page">
    <div className="view-heading"><div><p className="eyebrow">WORK BREAKDOWN STRUCTURE</p><h1>WBS</h1><p>{manager ? '업무를 분해·배정하고 팀 전체 범위와 진척을 관리하세요.' : '팀 전체 진척과 내 배정 업무를 확인하세요. 범위·계층·배정은 관리자가 관리합니다.'}</p></div>{manager && <Button disabled={archived} onClick={() => setDraft({ type: 'STORY' })}><Plus size={16} aria-hidden="true" /> 새 티켓</Button>}</div>
    <ProjectIssueFilters projectId={projectId} prefix="WBS" />
    {pending ? <p className="loading-state" role="status">작업 분해와 버전 일정을 불러오는 중입니다…</p> : tickets.isError || versions.isError ? <div><p className="form-message" role="alert">{tickets.error?.message ?? versions.error?.message}</p><Button variant="outline" onClick={() => { void tickets.refetch(); void versions.refetch() }}>작업표 다시 불러오기</Button></div> : <>
    <div className="work-summary" role="region" aria-label="전체 작업 범위"><span>팀 티켓 <strong>{nodes.length}개</strong></span><span>말단 완료 <strong>{totals.done} / {totals.leaves}</strong></span><span>팀 완료 비율 <strong>{totals.leaves ? `${Math.round(totals.done / totals.leaves * 100)}%` : '업무 없음'}</strong></span><span>말단 포인트 <strong>{totals.points}</strong> · 미추정 {totals.unknown}개</span></div>
    {ready && <div className="work-summary" role="region" aria-label="내 배정 티켓"><span>내 티켓 <strong>{ownTickets.length}개</strong></span>{Object.entries(statusLabels).map(([status, label]) => <span key={status}>{label} <strong>{ownTickets.filter(ticket => ticket.status === status).length}개</strong></span>)}</div>}
    <div className="heading-actions wbs-scope-actions" role="group" aria-label="WBS 업무 범위"><Button size="sm" variant="outline" aria-pressed={!filters.assigneeId} onClick={() => update({ assigneeId: '' })}>팀 업무</Button><Button size="sm" variant="outline" disabled={!ready} aria-pressed={ready && filters.assigneeId === String(actorId)} onClick={() => update({ assigneeId: String(actorId) })}>내 업무</Button><span className="view-note">담당자 필터만 변경하며 팀 진척과 내 배정 요약은 전체 티켓 기준입니다.</span></div>
    <p className="view-note">WBS 코드는 계층 변경 시 바뀔 수 있습니다. 업무 참조에는 티켓 키를 사용하세요. 집계는 전체 하위 작업 기준입니다.</p>
    <div className="table-toolbar"><span>{matches.size}개 일치 · {visible.length}개 표시{tickets.isFetching ? ' · 갱신 중…' : ''}</span><div className="heading-actions wbs-collapse-actions"><Button variant="outline" size="sm" disabled={!parents.some(node => !collapsed.has(node.ticket.id))} onClick={() => setCollapsed(new Set(parents.map(node => node.ticket.id)))}>모두 접기</Button><Button variant="outline" size="sm" disabled={collapsed.size === 0} onClick={() => setCollapsed(new Set())}>모두 펼치기</Button></div></div>
    <div className="table-wrap" tabIndex={0} role="region" aria-label="WBS 작업표"><Table><caption className="sr-only">티켓 계층과 전체 하위 작업 집계</caption><TableHeader><TableRow>{['WBS 코드', '티켓', '유형', '상태', '담당자', '시작일', '완료일', '완료율', '말단 완료', '말단 포인트', ...(manager ? ['분해'] : [])].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
      {visible.map(node => { const { ticket, summary } = node; return <TableRow key={ticket.id} className="wbs-row" data-ticket-id={ticket.id}>
        <TableCell className="wbs-code">{node.code}</TableCell><TableCell><div className="wbs-ticket" style={{ paddingLeft: node.depth * 20 }}>
          {node.childCount > 0 ? <Button size="icon-sm" variant="ghost" aria-label={`${ticket.key} ${ticket.title} 하위 티켓 ${collapsed.has(ticket.id) ? '펼치기' : '접기'}`} aria-expanded={!collapsed.has(ticket.id)} onClick={() => toggle(ticket.id)}>{collapsed.has(ticket.id) ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</Button> : <span className="wbs-spacer" />}
          <Link className="table-link" to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(ticket.id) }}><small>{ticket.key}</small><strong>{ticket.title}</strong></Link>{!matches.has(ticket.id) && <span className="context-label">상위 맥락</span>}{ready && ticket.assigneeId === actorId && <span className="context-label">내 업무</span>}
        </div></TableCell><TableCell>{typeLabels[ticket.type]}</TableCell><TableCell>{statusLabels[ticket.status]}</TableCell><TableCell>{ticket.assigneeName ?? '미지정'}</TableCell><TableCell>{summary.startDate ?? '—'}</TableCell><TableCell>{summary.dueDate ?? '—'}{summary.inherited && <small className="work-label">버전 상속</small>}</TableCell><TableCell>{summary.progress}%{summary.aggregated && <small className="work-label">하위 집계</small>}</TableCell><TableCell>{summary.doneLeafCount} / {summary.leafCount}</TableCell><TableCell>{summary.points}<small className="work-label">미추정 {summary.unestimatedCount}개</small></TableCell>{manager && <TableCell>{ticket.type !== 'SUBTASK' && <Button variant="outline" size="sm" disabled={archived} aria-label={`${ticket.key} 하위 티켓 추가`} onClick={() => setDraft({ type: ticket.type === 'EPIC' ? 'STORY' : 'SUBTASK', parentId: ticket.id, versionId: ticket.versionId })}><Plus size={14} aria-hidden="true" /> 하위 추가</Button>}</TableCell>}
      </TableRow> })}
      {!visible.length && <TableRow><TableCell colSpan={manager ? 11 : 10}>{tickets.isPending || versions.isPending ? '티켓을 불러오는 중입니다…' : tickets.isError || versions.isError ? '작업표를 불러오지 못했습니다.' : '조건에 맞는 티켓이 없습니다.'}</TableCell></TableRow>}
    </TableBody></Table></div>
    </>}
    <Dialog open={!!draft} onOpenChange={open => { if (!open) setDraft(null) }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{draft?.parentId ? '하위 티켓 추가' : '새 티켓'}</DialogTitle><DialogDescription>동일한 티켓을 WBS·간트·테이블·칸반에서 확인할 수 있습니다.</DialogDescription></DialogHeader>{draft && <IssueForm key={`${draft.parentId ?? 'root'}-${draft.type}`} projectId={projectId} defaults={draft} onSaved={id => { setDraft(null); navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(projectId), issueId: String(id) } }) }} onCancel={() => setDraft(null)} />}</DialogContent></Dialog>
  </section>
}
