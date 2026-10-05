export type IssueKind = 'PROJECT' | 'VERSION' | 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'SUBTASK'
export type IssueStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE'
export type RelationKind = 'BLOCKS' | 'PRECEDES'

export interface GanttIssue {
  id: string
  projectId?: string
  parentId?: string
  key: string
  title: string
  kind: IssueKind
  status: IssueStatus
  assignee?: string
  assigneeId?: string
  priority?: string
  versionId?: string
  sprintId?: string
  aggregated?: boolean
  startDate?: string
  dueDate?: string
  progress?: number
}

export interface GanttRelation {
  fromId: string
  toId: string
  kind: RelationKind
}

const DAY_MS = 86_400_000

export function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: Date, count: number): Date {
  return new Date(date.getTime() + count * DAY_MS)
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function addMonths(date: Date, count: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1))
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

export function visibleIssues(issues: GanttIssue[], collapsed: Set<string>, query: string, kind: string, status: string, extra: { assignee?: string; priority?: string; version?: string; sprintState?: string } = {}): GanttIssue[] {
  const byId = new Map(issues.map((issue) => [issue.id, issue]))
  const matches = new Set<string>()
  const search = query.trim().toLocaleLowerCase()

  for (const issue of issues) {
    if (kind !== 'ALL' && issue.kind !== kind) continue
    if (status !== 'ALL' && issue.status !== status) continue
    if (extra.assignee && extra.assignee !== 'ALL' && issue.assigneeId !== extra.assignee) continue
    if (extra.priority && extra.priority !== 'ALL' && issue.priority !== extra.priority) continue
    if (extra.version && extra.version !== 'ALL' && issue.versionId !== extra.version) continue
    if (extra.sprintState === 'BACKLOG' && (issue.kind === 'PROJECT' || issue.kind === 'VERSION' || issue.sprintId)) continue
    if (extra.sprintState === 'ASSIGNED' && !issue.sprintId) continue
    if (search && !`${issue.key} ${issue.title} ${issue.assignee ?? ''}`.toLocaleLowerCase().includes(search)) continue
    matches.add(issue.id)
    let parent = issue.parentId ? byId.get(issue.parentId) : undefined
    const visited = new Set<string>()
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id)
      matches.add(parent.id)
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
  }

  return issues.filter((issue) => {
    if (!matches.has(issue.id)) return false
    let parent = issue.parentId ? byId.get(issue.parentId) : undefined
    const visited = new Set<string>()
    while (parent && !visited.has(parent.id)) {
      if (collapsed.has(parent.id)) return false
      visited.add(parent.id)
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    return true
  })
}

export function issueDepth(issue: GanttIssue, byId: Map<string, GanttIssue>): number {
  let depth = 0
  let parent = issue.parentId ? byId.get(issue.parentId) : undefined
  const visited = new Set<string>()
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id)
    depth += 1
    parent = parent.parentId ? byId.get(parent.parentId) : undefined
  }
  return depth
}
