import type { WorkNode } from '@/features/issue'
import { addMonths, daysBetween, parseDate, toDateKey } from '@/shared/lib/calendarDate'

export function timelineRange(month: string, months: number) {
  const start = parseDate(`${month}-01`), end = addMonths(start, months)
  return { start, end, days: daysBetween(start, end), startKey: toDateKey(start), endKey: toDateKey(end) }
}
export function timelinePlacement(node: WorkNode, range: ReturnType<typeof timelineRange>) {
  const { startDate, dueDate } = node.summary
  if (!startDate && !dueDate) return { kind: 'unplanned' as const }
  const start = parseDate(startDate ?? dueDate!), end = parseDate(dueDate ?? startDate!)
  if (start > end) return { kind: 'invalid' as const }
  if (end < range.start || start >= range.end) return { kind: 'outside' as const }
  const from = Math.max(0, daysBetween(range.start, start)), to = Math.min(range.days, daysBetween(range.start, end) + 1)
  return { kind: 'scheduled' as const, left: from / range.days * 100, width: Math.max(1, to - from) / range.days * 100, single: !startDate || !dueDate }
}
export function timelineGroups(nodes: WorkNode[], all: WorkNode[], by: 'epic' | 'version', versions: { id: number; name: string }[]) {
  const byId = new Map(all.map(node => [node.ticket.id, node]))
  const byVersion = new Map(versions.map(version => [version.id, version.name]))
  const groups = new Map<string, { key: string; title: string; nodes: WorkNode[] }>()
  for (const node of nodes) {
    let key = 'none', title = by === 'epic' ? 'Epic 미연결' : '버전 미연결'
    if (by === 'version' && node.ticket.versionId) {
      key = `version-${node.ticket.versionId}`; title = byVersion.get(node.ticket.versionId) ?? '버전 확인 중'
    } else if (by === 'epic') {
      let current: WorkNode | undefined = node
      const visited = new Set<number>()
      while (current && !visited.has(current.ticket.id)) {
        visited.add(current.ticket.id)
        if (current.ticket.type === 'EPIC') { key = `epic-${current.ticket.id}`; title = `${current.ticket.key} ${current.ticket.title}`; break }
        current = current.ticket.parentId ? byId.get(current.ticket.parentId) : undefined
      }
    }
    const group = groups.get(key) ?? { key, title, nodes: [] }
    group.nodes.push(node); groups.set(key, group)
  }
  return [...groups.values()]
}
