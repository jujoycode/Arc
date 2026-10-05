import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { addDays, addMonths, daysBetween, issueDepth, parseDate, startOfMonth, toDateKey, visibleIssues } from './gantt'
import type { GanttIssue, GanttRelation, IssueKind, IssueStatus } from './gantt'
import { useProjectFilters } from './ProjectFilters'

const KIND_LABEL: Record<IssueKind, string> = {
  PROJECT: '프로젝트', VERSION: '버전', EPIC: 'Epic', STORY: 'Story',
  TASK: 'Task', BUG: 'Bug', SUBTASK: '하위 작업',
}
const STATUS_LABEL: Record<IssueStatus, string> = {
  TODO: '할 일', IN_PROGRESS: '진행 중', REVIEW: '검토', DONE: '완료',
}
const ZOOM_WIDTHS = [18, 24, 34, 48]
const PRIORITY_LABEL: Record<string, string> = { LOW: '낮음', NORMAL: '보통', HIGH: '높음', URGENT: '긴급' }
const ROW_HEIGHT = 50
const dateLabel = (key?: string) => key ? parseDate(key).toLocaleDateString('ko-KR', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) : '날짜 없음'

interface Props {
  issues: GanttIssue[]
  relations: GanttRelation[]
  onOpenIssue?: (id: string) => void
  onOpenProject?: (id: string) => void
  onOpenVersion?: (projectId: string) => void
  savedViews?: { id: number; name: string; filters: string; options: string }[]
  onSaveView?: (name: string, filters: string, options: string) => Promise<void>
  onDeleteView?: (id: number) => Promise<void>
}

export function GanttChart({ issues, relations, onOpenIssue, onOpenProject, onOpenVersion, savedViews = [], onSaveView, onDeleteView }: Props) {
  const [today] = useState(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  })
  const [rangeStart, setRangeStart] = useState(() => addMonths(startOfMonth(today), -1))
  const [monthCount, setMonthCount] = useState(3)
  const [zoom, setZoom] = useState(1)
  const { filters, update, reset } = useProjectFilters()
  const [structuralKind, setStructuralKind] = useState('')
  const query = filters.search, kind = structuralKind || filters.type || 'ALL'
  const status = filters.status || 'ALL', assignee = filters.assigneeId || 'ALL', priority = filters.priority || 'ALL', version = filters.versionId || 'ALL'
  const setQuery = (value: string) => update({ search: value })
  const setKind = (value: string) => { setStructuralKind(['PROJECT', 'VERSION'].includes(value) ? value : ''); update({ type: ['ALL', 'PROJECT', 'VERSION'].includes(value) ? '' : value }) }
  const setStatus = (value: string) => update({ status: value === 'ALL' ? '' : value })
  const setAssignee = (value: string) => update({ assigneeId: value === 'ALL' ? '' : value })
  const setPriority = (value: string) => update({ priority: value === 'ALL' ? '' : value })
  const setVersion = (value: string) => update({ versionId: value === 'ALL' ? '' : value })
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showRelations, setShowRelations] = useState(true)
  const [showProgress, setShowProgress] = useState(true)
  const [showProgressLine, setShowProgressLine] = useState(false)
  const [showAssigneeColumn, setShowAssigneeColumn] = useState(false)
  const [showPriorityColumn, setShowPriorityColumn] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewError, setViewError] = useState('')
  const [exporting, setExporting] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const byId = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues])
  const children = useMemo(() => new Set(issues.map((issue) => issue.parentId).filter(Boolean)), [issues])
  const rows = useMemo(() => visibleIssues(issues, collapsed, query, kind, status, { assignee, priority, version, sprintState: filters.sprintState }), [issues, collapsed, query, kind, status, assignee, priority, version, filters.sprintState])
  const assignees = useMemo(() => Array.from(new Map(issues.filter(issue => issue.assigneeId).map(issue => [issue.assigneeId!, issue.assignee ?? '이름 없음'])).entries()), [issues])
  const versions = useMemo(() => issues.filter(issue => issue.kind === 'VERSION' && issue.id.startsWith('version-')).map(issue => [issue.id.slice(8), issue.title] as const), [issues])
  const paneWidth = 370 + (showAssigneeColumn ? 100 : 0) + (showPriorityColumn ? 80 : 0)
  const rangeEnd = addMonths(rangeStart, monthCount)
  const dayCount = daysBetween(rangeStart, rangeEnd)
  const dayWidth = ZOOM_WIDTHS[zoom]
  const chartWidth = dayCount * dayWidth
  useEffect(() => {
    const index = daysBetween(rangeStart, today)
    if (timelineRef.current) timelineRef.current.scrollLeft = index >= 0 && index < dayCount ? Math.max(0, (index + .5) * dayWidth - timelineRef.current.clientWidth * .5) : 0
  }, [rangeStart, today, dayCount, dayWidth])
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

  async function saveView(event: React.FormEvent) {
    event.preventDefault()
    if (!onSaveView) return
    setViewError('')
    try {
      await onSaveView(viewName, JSON.stringify({ query, kind, status, assignee, priority, version, sprintState: filters.sprintState }), JSON.stringify({ startMonth: toDateKey(rangeStart).slice(0, 7), monthCount, zoom, showRelations, showProgress, showProgressLine, showAssigneeColumn, showPriorityColumn }))
      setViewName('')
    } catch (error) { setViewError((error as Error).message) }
  }

  function loadView(id: number) {
    const view = savedViews.find(item => item.id === id)
    if (!view) return
    try {
      const filters = JSON.parse(view.filters)
      const options = JSON.parse(view.options)
      setQuery(typeof filters.query === 'string' ? filters.query : '')
      setKind(Object.hasOwn(KIND_LABEL, filters.kind) ? filters.kind : 'ALL')
      setStatus(Object.hasOwn(STATUS_LABEL, filters.status) ? filters.status : 'ALL')
      const identifier = (value: unknown) => typeof value === 'string' && /^\d+$/.test(value) ? value : 'ALL'
      setAssignee(identifier(filters.assignee))
      setPriority(Object.hasOwn(PRIORITY_LABEL, filters.priority) ? filters.priority : 'ALL')
      setVersion(identifier(filters.version))
      update({ sprintState: ['BACKLOG', 'ASSIGNED'].includes(filters.sprintState) ? filters.sprintState : '' })
      if (typeof options.startMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(options.startMonth)) setRangeStart(parseDate(`${options.startMonth}-01`))
      setMonthCount([1, 2, 3, 6, 12].includes(options.monthCount) ? options.monthCount : 3)
      setZoom([0, 1, 2, 3].includes(options.zoom) ? options.zoom : 1)
      setShowRelations(typeof options.showRelations === 'boolean' ? options.showRelations : true)
      setShowProgress(typeof options.showProgress === 'boolean' ? options.showProgress : true)
      setShowProgressLine(options.showProgressLine === true)
      setShowAssigneeColumn(options.showAssigneeColumn === true)
      setShowPriorityColumn(options.showPriorityColumn === true)
      setViewError('')
    } catch { setViewError('저장된 보기를 읽을 수 없습니다.') }
  }

  async function deleteView(id: number) {
    setViewError('')
    try { await onDeleteView?.(id) } catch (error) { setViewError((error as Error).message) }
  }

  async function exportChart(format: 'png' | 'pdf') {
    if (!gridRef.current) return
    setExporting(true); setViewError('')
    try {
      const { toCanvas } = await import('html-to-image')
      const width = paneWidth + chartWidth
      const height = 72 + Math.max(rows.length * ROW_HEIGHT, ROW_HEIGHT)
      const grid = gridRef.current
      const timeline = timelineRef.current!
      const previous = { gridWidth: grid.style.width, gridColumns: grid.style.gridTemplateColumns, timelineWidth: timeline.style.width, timelineOverflow: timeline.style.overflow, scrollLeft: timeline.scrollLeft }
      grid.style.width = `${width}px`
      grid.style.gridTemplateColumns = `${paneWidth}px ${chartWidth}px`
      timeline.style.width = `${chartWidth}px`
      timeline.style.overflow = 'visible'
      timeline.scrollLeft = 0
      let canvas: HTMLCanvasElement
      try { canvas = await toCanvas(grid, { width, height, pixelRatio: 1, backgroundColor: '#ffffff' }) }
      finally {
        grid.style.width = previous.gridWidth
        grid.style.gridTemplateColumns = previous.gridColumns
        timeline.style.width = previous.timelineWidth
        timeline.style.overflow = previous.timelineOverflow
        timeline.scrollLeft = previous.scrollLeft
      }
      if (format === 'png') {
        const link = document.createElement('a')
        link.download = `arc-gantt-${toDateKey(rangeStart)}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      } else {
        const { jsPDF } = await import('jspdf')
        const pageWidth = 1440, pageHeight = 850, sidebar = paneWidth, header = 72
        const chartPageWidth = pageWidth - sidebar
        const bodyPageHeight = pageHeight - header
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [pageWidth, pageHeight], hotfixes: ['px_scaling'] })
        let first = true
        for (let y = 0; y < Math.max(rows.length * ROW_HEIGHT, ROW_HEIGHT); y += bodyPageHeight) {
          for (let x = 0; x < chartWidth; x += chartPageWidth) {
            if (!first) pdf.addPage([pageWidth, pageHeight], 'landscape')
            first = false
            const page = document.createElement('canvas')
            page.width = pageWidth; page.height = pageHeight
            const context = page.getContext('2d')!
            context.fillStyle = '#fff'; context.fillRect(0, 0, pageWidth, pageHeight)
            const sliceHeight = Math.min(bodyPageHeight, rows.length * ROW_HEIGHT - y)
            const sliceWidth = Math.min(chartPageWidth, chartWidth - x)
            context.drawImage(canvas, 0, 0, sidebar, header, 0, 0, sidebar, header)
            context.drawImage(canvas, sidebar + x, 0, sliceWidth, header, sidebar, 0, sliceWidth, header)
            if (sliceHeight > 0) {
              context.drawImage(canvas, 0, header + y, sidebar, sliceHeight, 0, header, sidebar, sliceHeight)
              context.drawImage(canvas, sidebar + x, header + y, sliceWidth, sliceHeight, sidebar, header, sliceWidth, sliceHeight)
            }
            pdf.addImage(page.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight)
          }
        }
        pdf.save(`arc-gantt-${toDateKey(rangeStart)}.pdf`)
      }
    } catch (error) { setViewError(`내보내지 못했습니다: ${(error as Error).message}`) }
    finally { setExporting(false) }
  }

  function barPosition(issue: GanttIssue) {
    if (!issue.dueDate) return null
    const end = daysBetween(rangeStart, parseDate(issue.dueDate))
    const start = issue.startDate ? daysBetween(rangeStart, parseDate(issue.startDate)) : end
    if (end < 0 || start >= dayCount || end < start) return null
    return { left: start * dayWidth, width: Math.max((end - start + 1) * dayWidth, dayWidth), milestone: !issue.startDate }
  }

  const todayX = (daysBetween(rangeStart, today) + .5) * dayWidth
  const progressPoints = rows.flatMap((issue, index) => {
    const bar = barPosition(issue)
    if (!bar || issue.kind === 'PROJECT' || issue.kind === 'VERSION') return []
    return [[Math.max(0, Math.min(chartWidth, bar.left + bar.width * (issue.progress ?? 0) / 100)), index * ROW_HEIGHT + ROW_HEIGHT / 2]]
  })
  const progressPath = progressPoints.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')

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
        <label htmlFor="assignee-filter">담당자
          <select id="assignee-filter" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="ALL">전체</option>{assignees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </label>
        <label htmlFor="priority-filter">우선순위
          <select id="priority-filter" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="ALL">전체</option>{Object.entries(PRIORITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <label htmlFor="version-filter">버전
          <select id="version-filter" value={version} onChange={(event) => setVersion(event.target.value)}><option value="ALL">전체</option>{versions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </label>
        <label htmlFor="gantt-sprint-filter">스프린트<select id="gantt-sprint-filter" value={filters.sprintState} onChange={event => update({ sprintState: event.target.value })}><option value="">전체</option><option value="BACKLOG">백로그</option><option value="ASSIGNED">스프린트 편성</option></select></label>
        <label className="check-field"><input type="checkbox" checked={showRelations} onChange={(event) => setShowRelations(event.target.checked)} /> 관계선</label>
        <label className="check-field"><input type="checkbox" checked={showProgress} onChange={(event) => setShowProgress(event.target.checked)} /> 완료율</label>
        <label className="check-field"><input type="checkbox" checked={showProgressLine} onChange={(event) => setShowProgressLine(event.target.checked)} /> 진행선</label>
        <label className="check-field"><input type="checkbox" checked={showAssigneeColumn} onChange={(event) => setShowAssigneeColumn(event.target.checked)} /> 담당자 열</label>
        <label className="check-field"><input type="checkbox" checked={showPriorityColumn} onChange={(event) => setShowPriorityColumn(event.target.checked)} /> 우선순위 열</label>
        <button type="button" className="filter-reset" onClick={() => { reset(); setStructuralKind('') }}>필터 초기화</button>
      </div>

      <div className="gantt-hint" role="status">{rows.length}개 항목 표시{Object.values(filters).some(Boolean) || structuralKind ? ' · 필터 적용' : ''} · 막대를 선택하면 날짜와 관계를 읽을 수 있습니다.</div>
      <div className="gantt-grid-scroller"><div className="gantt-grid" ref={gridRef} style={{ gridTemplateColumns: `${paneWidth}px minmax(0,1fr)` }}>
        <div className="issue-pane">
          <div className="issue-header"><span>이슈 / 버전</span><div className="issue-columns">{showAssigneeColumn && <span className="assignee-column">담당자</span>}{showPriorityColumn && <span className="priority-column">우선순위</span>}<span className="progress-column">완료율</span></div></div>
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
              <div className="issue-columns">{showAssigneeColumn && <span className="assignee-column">{issue.assignee ?? '—'}</span>}{showPriorityColumn && <span className="priority-column">{issue.priority ? PRIORITY_LABEL[issue.priority] : '—'}</span>}<span className="row-progress">{issue.progress ?? 0}%</span></div>
            </div>
          })}
        </div>

        <div className="timeline-scroll" role="region" aria-label="일정 시간축" tabIndex={0} ref={timelineRef}>
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
                  return <g key={index}><path d={`M ${x1} ${y1} H ${bend} V ${y2} H ${x2}`} fill="none" stroke="#596579" strokeWidth="1.5" strokeDasharray={relation.kind === 'PRECEDES' ? '5 3' : undefined} /><path d={`M ${x2 - 5} ${y2 - 4} L ${x2} ${y2} L ${x2 - 5} ${y2 + 4}`} fill="none" stroke="#596579" strokeWidth="1.5" /></g>
                })}
              </svg>}
              {showProgressLine && progressPoints.length > 0 && <svg className="relation-overlay progress-overlay" width={chartWidth} height={rows.length * ROW_HEIGHT} aria-hidden="true"><path d={`${todayX >= 0 && todayX < chartWidth ? `M ${todayX} 0 L ${progressPoints[0][0]} ${progressPoints[0][1]} ` : ''}${progressPath}`} fill="none" stroke="#b93a59" strokeWidth="2" strokeDasharray="2 3" />{progressPoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="3" fill="#b93a59" />)}</svg>}
              {daysBetween(rangeStart, today) >= 0 && daysBetween(rangeStart, today) < dayCount && <div className="today-line" style={{ left: todayX }} title={`오늘 · ${dateLabel(toDateKey(today))}`} />}
            </div>
          </div>
        </div>
      </div></div>

      <div className="gantt-bottom">
        <div className="gantt-legend"><span><i className="legend-swatch epic" /> Epic / 프로젝트</span><span><i className="legend-swatch task" /> Story / Task</span><span><i className="legend-line" /> 차단 관계</span><span><i className="legend-line dashed" /> 선행 관계</span><span><i className="legend-today" /> 오늘</span><span><i className="legend-line progress-legend" /> 진행선: 완료율 위치</span></div>
        {selected && <aside className="issue-detail" aria-label="선택한 항목 상세" aria-live="polite"><button type="button" className="detail-close" onClick={() => setSelectedId(null)} aria-label="상세 닫기">×</button><div className="issue-key">{selected.key} · {KIND_LABEL[selected.kind]}</div><h2>{selected.title}</h2>{!selected.dueDate && <p>완료일이 없어 일정 막대를 표시하지 않습니다. 이슈 상세에서 날짜를 지정하세요.</p>}<dl><div><dt>상태</dt><dd>{STATUS_LABEL[selected.status]}</dd></div><div><dt>담당자</dt><dd>{selected.assignee ?? '미지정'}</dd></div><div><dt>시작일</dt><dd>{dateLabel(selected.startDate)}</dd></div><div><dt>완료일</dt><dd>{dateLabel(selected.dueDate)}</dd></div><div><dt>완료율</dt><dd>{selected.progress ?? 0}%{selected.aggregated ? ' (하위 항목 집계)' : ' (입력값)'}</dd></div><div><dt>관계</dt><dd>{relationDescriptions.length ? relationDescriptions.join(', ') : '없음'}</dd></div></dl>{onOpenIssue && relations.filter(relation => relation.fromId === selected.id || relation.toId === selected.id).map((relation, index) => { const otherId = relation.fromId === selected.id ? relation.toId : relation.fromId; const other = byId.get(otherId); return other ? <button key={index} type="button" className="open-issue" onClick={() => onOpenIssue(otherId)}>연결 이슈 {other.key} 열기 →</button> : null })}{selected.kind === 'PROJECT' && selected.projectId && onOpenProject && <button type="button" className="open-issue" onClick={() => onOpenProject(selected.projectId!)}>프로젝트 열기 →</button>}{selected.kind === 'VERSION' && selected.projectId && onOpenVersion && <button type="button" className="open-issue" onClick={() => onOpenVersion(selected.projectId!)}>버전 설정 열기 →</button>}{onOpenIssue && !selected.id.startsWith('project-') && !selected.id.startsWith('version-') && <button type="button" className="open-issue" onClick={() => onOpenIssue(selected.id)}>이슈 상세 열기 →</button>}</aside>}
      </div>
      {onSaveView && <div className="saved-view-bar"><form onSubmit={saveView}><input aria-label="보기 이름" placeholder="개인 보기 이름" value={viewName} onChange={event => setViewName(event.target.value)} required maxLength={120} /><button type="submit">현재 보기 저장</button></form><label>저장된 보기<select aria-label="저장된 보기" defaultValue="" onChange={event => { loadView(Number(event.target.value)); event.target.value = '' }}><option value="">선택</option>{savedViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>{savedViews.map(view => <button type="button" key={view.id} className="delete-view" onClick={() => deleteView(view.id)} aria-label={`${view.name} 보기 삭제`}>× {view.name}</button>)}{viewError && <span role="alert">{viewError}</span>}</div>}
      <div className="export-bar"><span>현재 필터·기간으로 내보내기</span><button type="button" disabled={exporting} onClick={() => exportChart('png')}>PNG</button><button type="button" disabled={exporting} onClick={() => exportChart('pdf')}>PDF</button>{exporting && <span role="status">내보내는 중…</span>}</div>
    </section>
  )
}
