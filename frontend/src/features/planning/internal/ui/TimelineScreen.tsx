import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/shared/api/client'
import { buildWorkBreakdown, useIssues, useProjectFilters, matchesIssue, ProjectIssueFilters, typeLabels, statusLabels } from '@/features/issue'
import type { WorkNode } from '@/features/issue'
import type { Version } from '@/features/project'
import { Button } from '@/shared/ui/button'
import { addDays, addMonths, currentMonth, daysBetween, parseDate, toDateKey } from '@/shared/lib/calendarDate'
import { timelineGroups, timelinePlacement, timelineRange } from '../model/timeline'

function DateLabel({ node }: { node: WorkNode }) {
  const { startDate, dueDate, aggregated, inherited } = node.summary
  return <small className="work-label">{startDate && dueDate ? `${startDate} → ${dueDate}` : dueDate ? `${dueDate} · 완료일만` : startDate ? `${startDate} · 시작일만` : '일정 없음'}{aggregated ? ' · 하위 집계' : inherited ? ' · 버전 상속' : ''}</small>
}

export function TimelineScreen({ projectId }: { projectId: number }) {
  const tickets = useIssues(projectId)
  const versions = useQuery({ queryKey: ['versions', projectId], queryFn: ({ signal }) => api<Version[]>(`/projects/${projectId}/versions`, { signal }) })
  const { filters } = useProjectFilters()
  const [month, setMonth] = useState(currentMonth), [months, setMonths] = useState(1)
  const [groupBy, setGroupBy] = useState<'epic' | 'version'>('epic')
  const [todayKey] = useState(() => { const now = new Date(); return `${currentMonth()}-${String(now.getDate()).padStart(2, '0')}` })
  const nodes = useMemo(() => buildWorkBreakdown(tickets.data?.items ?? [], versions.data ?? []), [tickets.data, versions.data])
  const matching = nodes.filter(node => matchesIssue(node.ticket, filters))
  const range = timelineRange(month, months)
  const scheduled = matching.filter(node => timelinePlacement(node, range).kind === 'scheduled')
  const unplanned = matching.filter(node => timelinePlacement(node, range).kind === 'unplanned')
  const outside = matching.filter(node => timelinePlacement(node, range).kind === 'outside')
  const invalid = matching.filter(node => timelinePlacement(node, range).kind === 'invalid')
  const groups = timelineGroups(scheduled, nodes, groupBy, versions.data ?? [])
  const ticks = Array.from({ length: Math.ceil(range.days / 7) }, (_, index) => ({ offset: index * 7, date: toDateKey(addDays(range.start, index * 7)) }))
  const dayWidth = months === 1 ? 24 : 14
  const grid = { gridTemplateColumns: `300px ${range.days * dayWidth}px` }
  const todayOffset = daysBetween(range.start, parseDate(todayKey))
  const pending = tickets.isPending || versions.isPending
  const error = tickets.error ?? versions.error
  function move(count: number) { setMonth(toDateKey(addMonths(range.start, count)).slice(0, 7)) }
  function list(title: string, items: WorkNode[]) { return <section className="overview-list" aria-label={title}><h2>{title} <span>{items.length}개</span></h2>{!items.length ? <p className="view-note">해당 티켓이 없습니다.</p> : <ul>{items.map(node => <li key={node.ticket.id} data-ticket-id={node.ticket.id}><Link className="table-link" to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(node.ticket.id) }}>{node.ticket.key} {node.ticket.title}</Link><span>{statusLabels[node.ticket.status]}</span><DateLabel node={node} /></li>)}</ul>}</section> }
  return <section className="view-page">
    <div className="view-heading"><div><p className="eyebrow">TICKET TIMELINE</p><h1>타임라인</h1><p>Epic·버전별 일정 개요를 확인하고 티켓을 열어 일정을 편집하세요.</p></div></div>
    <ProjectIssueFilters projectId={projectId} prefix="타임라인" />
    <div className="overview-controls"><label>시작 월<input type="month" aria-label="타임라인 시작 월" min="1900-01" max="9998-09" value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && event.target.validity.valid) setMonth(event.target.value) }} /></label><label>기간<select aria-label="타임라인 기간" value={months} onChange={event => setMonths(Number(event.target.value))}><option value={1}>월 · 1개월</option><option value={3}>분기 · 3개월</option></select></label><label>그룹<select aria-label="타임라인 그룹" value={groupBy} onChange={event => setGroupBy(event.target.value as 'epic' | 'version')}><option value="epic">Epic별</option><option value="version">버전별</option></select></label><div className="heading-actions"><Button variant="outline" size="icon-sm" aria-label="이전 기간" disabled={month <= '1900-03'} onClick={() => move(-months)}><ChevronLeft aria-hidden="true" /></Button><Button variant="outline" onClick={() => setMonth(currentMonth())}>이번 달</Button><Button variant="outline" size="icon-sm" aria-label="다음 기간" disabled={month >= '9998-06'} onClick={() => move(months)}><ChevronRight aria-hidden="true" /></Button></div></div>
    <div className="work-summary" aria-label="타임라인 요약"><span>{month} ~ {toDateKey(addDays(range.end, -1))}</span><span>기간 내 <strong>{scheduled.length}개</strong></span><span>미계획 <strong>{unplanned.length}개</strong></span><span>기간 밖 <strong>{outside.length}개</strong></span>{invalid.length > 0 && <span>일정 확인 필요 <strong>{invalid.length}개</strong></span>}</div>
    <p className="view-note">기간 막대는 하위 집계·버전 상속을 포함하며 세로선은 오늘입니다. 날짜가 한쪽만 있으면 해당 날짜를 표시합니다.</p>
    {error && <p className="form-message" role="alert">{error.message}</p>}
    {pending ? <p className="loading-state" role="status">티켓 일정을 불러오는 중입니다…</p> : !error && <>
      <div className="overview-scroll" tabIndex={0} role="region" aria-label="타임라인 차트">
        <div className="overview-axis" style={grid} aria-hidden="true"><span>티켓 / 일정</span><div>{ticks.map(tick => <span key={tick.date} style={{ left: `${tick.offset / range.days * 100}%` }}>{tick.date.slice(5).replace('-', '/')}</span>)}</div></div>
        {!scheduled.length && <p className="empty-message">선택한 기간에 표시할 티켓이 없습니다.</p>}
        {groups.map(group => <section key={group.key} className="overview-group" aria-label={group.title}><h2>{group.title} <span>{group.nodes.length}개</span></h2><ul>{group.nodes.map(node => {
          const placement = timelinePlacement(node, range)
          if (placement.kind !== 'scheduled') return null
          return <li key={node.ticket.id} className="overview-row" style={grid} data-ticket-id={node.ticket.id}><div className="overview-ticket"><Link className="table-link" to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(node.ticket.id) }}><small>{node.ticket.key} · {typeLabels[node.ticket.type]}</small><strong>{node.ticket.title}</strong></Link><DateLabel node={node} /></div><div className="overview-track" style={{ backgroundSize: `${dayWidth * 7}px 100%` }}>{todayOffset >= 0 && todayOffset < range.days && <span className="overview-today" style={{ left: `${todayOffset / range.days * 100}%` }} aria-hidden="true" />}<Link className={`overview-bar${placement.single ? ' single-date' : ''}${node.summary.aggregated ? ' summary-bar' : ''}`} style={{ left: `${placement.left}%`, width: `${placement.width}%` }} to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(node.ticket.id) }} aria-label={`${node.ticket.key} ${node.ticket.title}, ${node.summary.startDate ?? '시작일 없음'} ~ ${node.summary.dueDate ?? '완료일 없음'}, ${statusLabels[node.ticket.status]}, ${node.summary.progress}%`}><span aria-hidden="true">{node.summary.progress}%</span></Link></div></li>
        })}</ul></section>)}
      </div>
      <div className="overview-unscheduled">{list('미계획 티켓', unplanned)}{list('기간 밖 티켓', outside)}</div>
      {invalid.length > 0 && <><p className="form-message" role="status">버전 상속을 포함한 시작일이 완료일보다 늦습니다. 티켓 또는 버전의 일정을 확인하세요.</p>{list('일정 확인 필요', invalid)}</>}
      {!matching.length && <p className="empty-message">조건에 맞는 티켓이 없습니다.</p>}
    </>}
  </section>
}
