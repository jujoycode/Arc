import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Project, Workspace } from './api'

export function useProjectAccess(projectId: number) {
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const spaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api<Workspace[]>('/auth/workspaces') })
  const role = spaces.data?.find(space => space.id === project.data?.workspaceId)?.role
  return { archived: !!project.data?.archivedAt, manager: role === 'OWNER' || role === 'ADMIN' }
}
