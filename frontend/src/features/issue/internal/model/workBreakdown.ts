import type { Ticket } from '../../api/types'

interface ScheduleVersion { id: number; startDate?: string | null; dueDate: string }
export interface TicketSummary {
  startDate?: string
  dueDate?: string
  progress: number
  leafCount: number
  doneLeafCount: number
  points: number
  unestimatedCount: number
  aggregated: boolean
  inherited: boolean
}
export interface WorkNode { ticket: Ticket; code: string; depth: number; childCount: number; summary: TicketSummary }

export function ticketSummaries(tickets: Ticket[], versions: ScheduleVersion[] = []): Map<number, TicketSummary> {
  const children = new Map<number, Ticket[]>()
  for (const ticket of tickets) if (ticket.parentId) {
    const siblings = children.get(ticket.parentId) ?? []
    siblings.push(ticket); children.set(ticket.parentId, siblings)
  }
  const byVersion = new Map(versions.map(version => [version.id, version]))
  const summaries = new Map<number, TicketSummary>(), active = new Set<number>()
  function calculate(ticket: Ticket): TicketSummary {
    const cached = summaries.get(ticket.id)
    if (cached) return cached
    active.add(ticket.id)
    const descendants = (children.get(ticket.id) ?? []).filter(child => !active.has(child.id)).map(calculate)
    const version = ticket.versionId ? byVersion.get(ticket.versionId) : undefined
    const startDate = ticket.startDate?.slice(0, 10) ?? version?.startDate?.slice(0, 10)
    const dueDate = ticket.dueDate?.slice(0, 10) ?? version?.dueDate.slice(0, 10)
    const summary: TicketSummary = descendants.length ? {
      startDate: descendants.map(child => child.startDate).filter((date): date is string => !!date).sort()[0],
      dueDate: descendants.map(child => child.dueDate).filter((date): date is string => !!date).sort().at(-1),
      progress: Math.round(descendants.reduce((sum, child) => sum + child.progress, 0) / descendants.length),
      leafCount: descendants.reduce((sum, child) => sum + child.leafCount, 0),
      doneLeafCount: descendants.reduce((sum, child) => sum + child.doneLeafCount, 0),
      points: descendants.reduce((sum, child) => sum + child.points, 0),
      unestimatedCount: descendants.reduce((sum, child) => sum + child.unestimatedCount, 0),
      aggregated: true, inherited: false,
    } : {
      startDate, dueDate, progress: ticket.progress, leafCount: 1, doneLeafCount: ticket.status === 'DONE' ? 1 : 0,
      points: ticket.storyPoints ?? 0, unestimatedCount: ticket.storyPoints == null ? 1 : 0,
      aggregated: false, inherited: (!ticket.startDate && !!version?.startDate) || (!ticket.dueDate && !!version?.dueDate),
    }
    active.delete(ticket.id); summaries.set(ticket.id, summary)
    return summary
  }
  for (const ticket of tickets) calculate(ticket)
  return summaries
}

export function buildWorkBreakdown(tickets: Ticket[], versions: ScheduleVersion[] = []): WorkNode[] {
  const byId = new Map(tickets.map(ticket => [ticket.id, ticket]))
  const children = new Map<number | null, Ticket[]>()
  for (const ticket of [...tickets].sort((a, b) => a.sortOrder - b.sortOrder || a.number - b.number)) {
    const parent = ticket.parentId && byId.has(ticket.parentId) ? ticket.parentId : null
    const siblings = children.get(parent) ?? []
    siblings.push(ticket); children.set(parent, siblings)
  }
  const summaries = ticketSummaries(tickets, versions), nodes: WorkNode[] = [], visited = new Set<number>()
  function append(ticket: Ticket, code: string, depth: number) {
    if (visited.has(ticket.id)) return
    visited.add(ticket.id)
    const descendants = children.get(ticket.id) ?? []
    nodes.push({ ticket, code, depth, childCount: descendants.length, summary: summaries.get(ticket.id)! })
    descendants.forEach((child, index) => append(child, `${code}.${index + 1}`, depth + 1))
  }
  let rootIndex = 0
  for (const ticket of children.get(null) ?? []) append(ticket, String(++rootIndex), 0)
  // Keep every ticket visible even if a parent disappears during paged reads.
  for (const ticket of tickets) if (!visited.has(ticket.id)) append(ticket, String(++rootIndex), 0)
  return nodes
}

export function visibleWorkNodes(nodes: WorkNode[], matches: Set<number>, collapsed: Set<number>): WorkNode[] {
  const byId = new Map(nodes.map(node => [node.ticket.id, node])), included = new Set(matches)
  for (const id of matches) {
    let parentId = byId.get(id)?.ticket.parentId
    const visited = new Set<number>([id])
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId); included.add(parentId); parentId = byId.get(parentId)?.ticket.parentId
    }
  }
  return nodes.filter(node => {
    if (!included.has(node.ticket.id)) return false
    let parentId = node.ticket.parentId
    const visited = new Set<number>([node.ticket.id])
    while (parentId && !visited.has(parentId)) {
      if (collapsed.has(parentId)) return false
      visited.add(parentId); parentId = byId.get(parentId)?.ticket.parentId
    }
    return true
  })
}
