import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { addDays, addMonths, daysBetween, issueDepth, parseDate, startOfMonth, toDateKey, visibleIssues } from './gantt'
import type { GanttIssue, GanttRelation, IssueKind, IssueStatus } from './gantt'

const KIND_LABEL: Record<IssueKind, string> = {
  PROJECT: '프로젝트', VERSION: '버전', EPIC: 'Epic', STORY: 'Story',
  TASK: 'Task', BUG: 'Bug', SUBTASK: '하위 작업',
}
const STATUS_LABEL: Record<IssueStatus, string> = {
  TODO: '할 일', IN_PROGRESS: '진행 중', REVIEW: '검토', DONE: '완료',
}
const ZOOM_WIDTHS = [18, 24, 34, 48]
const ROW_HEIGHT = 50
const dateLabel = (key?: string) => key ? parseDate(key).toLocaleDateString('ko-KR', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) : '날짜 없음'

interface Props {
  issues: GanttIssue[]
  relations: GanttRelation[]
}

export function GanttChart({ issues, relations }: Props) {
  const [today] = useState(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  })
  const [rangeStart, setRangeStart] = useState(() => addMonths(startOfMonth(today), -1))
  const [monthCount, setMonthCount] = useState(3)
  const [zoom, setZoom] = useState(1)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showRelations, setShowRelations] = useState(true)
  const [showProgress, setShowProgress] = useState(true)

  const byId = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues])
  const children = useMemo(() => new Set(issues.map((issue) => issue.parentId).filter(Boolean)), [issues])
  const rows = useMemo(() => visibleIssues(issues, collapsed, query, kind, status), [issues, collapsed, query, kind, status])
  const rangeEnd = addMonths(rangeStart, monthCount)
  const dayCount = daysBetween(rangeStart, rangeEnd)
  const dayWidth = ZOOM_WIDTHS[zoom]
  const chartWidth = dayCount * dayWidth
  const days = Array.from({ length: dayCount }, (_, index) => addDays(rangeStart, index))
  const selected = selectedId ? byId.get(selectedId) : undefined
  const visibleIndex = new Map(rows.map((issue, index) => [issue.id, index]))
  const relationDescriptions = selected ? relations
    .filter((relation) => relation.fromId === selected.id || relation.toId === selected.id)
    .map((relation) => {
      const other = byId.get(relation.fromId === selected.id ? relation.toId : relation.fromId)
      return `${relation.kind === 'BLOCKS' ? '차단' : '선행'} · ${relation.fromId === selected.id ? '후속' : '이전'} ${other?.key ?? '알 수 없음'}`
    }) : []

  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function barPosition(issue: GanttIssue) {
    if (!issue.dueDate) return null
    const end = daysBetween(rangeStart, parseDate(issue.dueDate))
    const start = issue.startDate ? daysBetween(rangeStart, parseDate(issue.startDate)) : end
    if (end < 0 || start >= dayCount || end < start) return null
    return { left: start * dayWidth, width: Math.max((end - start + 1) * dayWidth, dayWidth), milestone: !issue.startDate }
  }

  return (
    <section className="gantt-panel" aria-label="간트 차트">
      <div className="gantt-toolbar">
        <div className="toolbar-group" aria-label="기간 이동">
          <button type="button" onClick={() => setRangeStart(addMonths(rangeStart, -1))} aria-label="이전 달">‹</button>
          <button type="button" onClick={() => setRangeStart(addMonths(startOfMonth(today), -1))}>오늘로 이동</button>
          <button type="button" onClick={() => setRangeStart(addMonths(rangeStart, 1))} aria-label="다음 달">›</button>
          <strong className="range-label">{rangeStart.getUTCFullYear()}년 {rangeStart.getUTCMonth() + 1}월 – {addMonths(rangeEnd, -1).getUTCFullYear()}년 {addMonths(rangeEnd, -1).getUTCMonth() + 1}월</strong>
        </div>
        <div className="toolbar-group">
          <label htmlFor="start-month">시작 월</label>
          <input id="start-month" type="month" value={toDateKey(rangeStart).slice(0, 7)} onChange={(event) => { if (event.target.value) setRangeStart(parseDate(`${event.target.value}-01`)) }} />
          <label htmlFor="month-count">표시 기간</label>
          <select id="month-count" value={monthCount} onChange={(event) => setMonthCount(Number(event.target.value))}>
            {[1, 2, 3, 6, 12].map((count) => <option key={count} value={count}>{count}개월</option>)}
          </select>
          <label htmlFor="zoom-level">확대</label>
          <select id="zoom-level" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            {ZOOM_WIDTHS.map((_, index) => <option key={index} value={index}>{index + 1}단계</option>)}
          </select>
        </div>
      </div>

      <div className="gantt-filters">
        <label className="search-field" htmlFor="issue-search">이슈 검색
          <input id="issue-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="키, 제목, 담당자" />
        </label>
        <label htmlFor="kind-filter">유형
          <select id="kind-filter" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="ALL">전체</option>
            {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label htmlFor="status-filter">상태
          <select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ALL">전체</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="check-field"><input type="checkbox" checked={showRelations} onChange={(event) => setShowRelations(event.target.checked)} /> 관계선</label>
        <label className="check-field"><input type="checkbox" checked={showProgress} onChange={(event) => setShowProgress(event.target.checked)} /> 완료율</label>
      </div>

      <div className="gantt-hint" role="status">{rows.length}개 항목 표시 · 막대를 선택하면 날짜와 관계를 읽을 수 있습니다.</div>
      <div className="gantt-grid">
        <div className="issue-pane">
          <div className="issue-header"><span>이슈 / 버전</span><span>완료율</span></div>
          {rows.length === 0 ? <div className="empty-state">조건에 맞는 항목이 없습니다.</div> : rows.map((issue) => {
            const depth = issueDepth(issue, byId)
            return <div className={`issue-row ${selectedId === issue.id ? 'is-selected' : ''}`} key={issue.id}>
              <div className="issue-name" style={{ paddingLeft: Math.min(depth, 5) * 15 + 12 }}>
                {children.has(issue.id) ? <button className="fold-button" type="button" onClick={() => toggleCollapsed(issue.id)} aria-label={`${issue.title} ${collapsed.has(issue.id) ? '펼치기' : '접기'}`} aria-expanded={!collapsed.has(issue.id)}>{collapsed.has(issue.id) ? '▸' : '▾'}</button> : <span className="fold-spacer" />}
                <button className="issue-select" type="button" onClick={() => setSelectedId(issue.id)} aria-label={`${issue.key} ${issue.title}, ${KIND_LABEL[issue.kind]}, ${STATUS_LABEL[issue.status]}, ${issue.startDate ? `${dateLabel(issue.startDate)}부터 ` : ''}${dateLabel(issue.dueDate)}까지, 완료율 ${issue.progress ?? 0}%`}>
                  <span className={`kind-dot kind-${issue.kind.toLowerCase()}`} aria-hidden="true" />
                  <span className="issue-text"><span className="issue-key">{issue.key} · {KIND_LABEL[issue.kind]}</span><span className="issue-title">{issue.title}</span></span>
                </button>
              </div>
              <span className="row-progress">{issue.progress ?? 0}%</span>
            </div>
          })}
        </div>

        <div className="timeline-scroll" role="region" aria-label="일정 시간축" tabIndex={0}>
          <div className="timeline" style={{ width: chartWidth }}>
            <div className="month-header">
              {Array.from({ length: monthCount }, (_, index) => {
                const month = addMonths(rangeStart, index)
                return <div key={index} className="month-cell" style={{ width: daysBetween(month, addMonths(month, 1)) * dayWidth }}>{month.getUTCFullYear()}년 {month.getUTCMonth() + 1}월</div>
              })}
            </div>
            <div className="day-header">
              {days.map((day, index) => <div key={index} className={`day-cell ${day.getUTCDay() === 0 || day.getUTCDay() === 6 ? 'weekend' : ''}`} style={{ width: dayWidth }} title={dateLabel(toDateKey(day))}>{dayWidth >= 24 || day.getUTCDate() % 5 === 0 ? day.getUTCDate() : ''}</div>)}
            </div>
            <div className="timeline-body" style={{ height: Math.max(rows.length * ROW_HEIGHT, ROW_HEIGHT) }}>
              {days.map((day, index) => <div key={index} className={`day-band ${day.getUTCDay() === 0 || day.getUTCDay() === 6 ? 'weekend' : ''}`} style={{ left: index * dayWidth, width: dayWidth }} />)}
              {rows.map((issue, index) => {
                const position = barPosition(issue)
                return <div className="timeline-row" key={issue.id} style={{ top: index * ROW_HEIGHT }}>
                  {position && <button type="button" className={`schedule-bar kind-${issue.kind.toLowerCase()} ${position.milestone ? 'milestone' : ''} ${selectedId === issue.id ? 'selected-bar' : ''}`} style={{ left: position.left, width: position.width } as CSSProperties} onClick={() => setSelectedId(issue.id)} aria-label={`${issue.key} ${issue.title}: ${issue.startDate ? `${dateLabel(issue.startDate)}부터 ` : ''}${dateLabel(issue.dueDate)}까지, 완료율 ${issue.progress ?? 0}%`} title={`${issue.key} · ${dateLabel(issue.startDate)} – ${dateLabel(issue.dueDate)} · ${issue.progress ?? 0}%`}>
                    {showProgress && !position.milestone && <span className="bar-progress" style={{ width: `${Math.min(100, Math.max(0, issue.progress ?? 0))}%` }} />}
                    {position.milestone && <span aria-hidden="true">◆</span>}
                  </button>}
                </div>
              })}
              {showRelations && <svg className="relation-overlay" width={chartWidth} height={rows.length * ROW_HEIGHT} aria-hidden="true">
                <defs><marker id="relation-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#596579" /></marker></defs>
                {relations.map((relation, index) => {
                  const from = byId.get(relation.fromId)
                  const to = byId.get(relation.toId)
                  const fromRow = visibleIndex.get(relation.fromId)
                  const toRow = visibleIndex.get(relation.toId)
                  if (!from || !to || fromRow === undefined || toRow === undefined) return null
                  const fromBar = barPosition(from)
                  const toBar = barPosition(to)
                  if (!fromBar || !toBar) return null
                  const x1 = Math.max(0, Math.min(chartWidth, fromBar.left + fromBar.width))
                  const x2 = Math.max(0, Math.min(chartWidth, toBar.left))
                  const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2
                  const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2
                  const bend = Math.min(chartWidth - 5, Math.max(x1 + 10, x2 - 10))
                  return <path key={index} d={`M ${x1} ${y1} H ${bend} V ${y2} H ${x2}`} className={relation.kind === 'BLOCKS' ? 'relation-blocks' : 'relation-precedes'} markerEnd="url(#relation-arrow)" />
                })}
              </svg>}
              {daysBetween(rangeStart, today) >= 0 && daysBetween(rangeStart, today) < dayCount && <div className="today-line" style={{ left: (daysBetween(rangeStart, today) + .5) * dayWidth }} title={`오늘 · ${dateLabel(toDateKey(today))}`} />}
            </div>
          </div>
        </div>
      </div>

      <div className="gantt-bottom">
        <div className="gantt-legend"><span><i className="legend-swatch epic" /> Epic / 프로젝트</span><span><i className="legend-swatch task" /> Story / Task</span><span><i className="legend-line" /> 차단 관계</span><span><i className="legend-line dashed" /> 선행 관계</span><span><i className="legend-today" /> 오늘</span></div>
        {selected && <aside className="issue-detail" aria-label="선택한 항목 상세"><button type="button" className="detail-close" onClick={() => setSelectedId(null)} aria-label="상세 닫기">×</button><div className="issue-key">{selected.key} · {KIND_LABEL[selected.kind]}</div><h2>{selected.title}</h2><dl><div><dt>상태</dt><dd>{STATUS_LABEL[selected.status]}</dd></div><div><dt>담당자</dt><dd>{selected.assignee ?? '미지정'}</dd></div><div><dt>시작일</dt><dd>{dateLabel(selected.startDate)}</dd></div><div><dt>완료일</dt><dd>{dateLabel(selected.dueDate)}</dd></div><div><dt>완료율</dt><dd>{selected.progress ?? 0}%</dd></div><div><dt>관계</dt><dd>{relationDescriptions.length ? relationDescriptions.join(', ') : '없음'}</dd></div></dl></aside>}
      </div>
    </section>
  )
}
