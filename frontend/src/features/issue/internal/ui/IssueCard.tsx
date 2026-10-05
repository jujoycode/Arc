import type { DragEventHandler } from 'react'
import { Link } from '@tanstack/react-router'
import type { Issue } from '../../api/types'
import { priorityLabels, statusLabels, typeLabels } from '../model/issueLabels'
import { Badge } from '@/shared/ui/badge'

/** Shared issue presentation for project and sprint boards. Native status selection supports keyboard use. */
export function IssueCard({ issue, disabled, busy = false, draggable = false, onDragStart, onStatusChange }: {
  issue: Issue
  disabled: boolean
  busy?: boolean
  draggable?: boolean
  onDragStart?: DragEventHandler<HTMLElement>
  onStatusChange: (issue: Issue, status: Issue['status']) => void
}) {
  return <article className="board-card" draggable={draggable && !disabled && !busy} onDragStart={onDragStart} aria-busy={busy}>
    <div className="card-top"><span className={`card-type type-${issue.type.toLowerCase()}`}>{typeLabels[issue.type]}</span><label className="card-status-label"><span className="sr-only">{issue.key} 상태 변경</span><select aria-label="상태 변경" value={issue.status} disabled={disabled || busy} onChange={event => onStatusChange(issue, event.target.value as Issue['status'])}>{Object.entries(statusLabels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label></div>
    <Link to="/projects/$projectId/issues/$issueId" params={{ projectId: String(issue.projectId), issueId: String(issue.id) }} className="card-main"><strong>{issue.title}</strong><span className="card-key">{issue.key}</span></Link>
    <div className="card-meta"><Badge variant={issue.priority === 'URGENT' ? 'destructive' : 'secondary'}>{priorityLabels[issue.priority]}</Badge><span>{issue.storyPoints != null ? `${issue.storyPoints}점 · ` : ''}{issue.assigneeName ?? '미지정'}</span></div>
    {issue.dueDate && <p className="card-date">완료 예정 {issue.dueDate.slice(0, 10)}</p>}
    {busy && <span className="sr-only" role="status">{issue.key} 상태를 변경하는 중입니다.</span>}
  </article>
}
