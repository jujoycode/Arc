import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { Issue } from '../../api/types'

export interface ProjectFilters { search: string; status: string; type: string; priority: string; assigneeId: string; versionId: string; sprintState: string }
const empty: ProjectFilters = { search: '', status: '', type: '', priority: '', assigneeId: '', versionId: '', sprintState: '' }
const Context = createContext<{ filters: ProjectFilters; update: (patch: Partial<ProjectFilters>) => void; reset: () => void } | null>(null)

export function ProjectFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<ProjectFilters>(empty)
  return <Context.Provider value={{ filters, update: patch => setFilters(current => ({ ...current, ...patch })), reset: () => setFilters(empty) }}>{children}</Context.Provider>
}
export function useProjectFilters() {
  const context = useContext(Context)
  if (!context) throw new Error('Project filters require a project context')
  return context
}
export function matchesIssue(issue: Issue, filters: ProjectFilters): boolean {
  const query = filters.search.trim().toLocaleLowerCase()
  return (!query || `${issue.key} ${issue.title}`.toLocaleLowerCase().includes(query)) &&
    (!filters.status || issue.status === filters.status) && (!filters.type || issue.type === filters.type) &&
    (!filters.priority || issue.priority === filters.priority) && (!filters.assigneeId || issue.assigneeId === Number(filters.assigneeId)) &&
    (!filters.versionId || issue.versionId === Number(filters.versionId)) &&
    (!filters.sprintState || (filters.sprintState === 'BACKLOG' ? !issue.sprintId : !!issue.sprintId))
}

