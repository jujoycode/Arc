import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { Project } from './types'
import type { Workspace } from '@/features/workspace'
import type { User } from '@/features/auth'

export function useProjectAccess(projectId: number) {
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const spaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api<Workspace[]>('/auth/workspaces') })
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') })
  const role = spaces.data?.find(space => space.id === project.data?.workspaceId)?.role
  const ready = project.isSuccess && spaces.isSuccess && me.isSuccess
  const archived = !!project.data?.archivedAt
  const actorId = me.data?.id
  const workspaceManager = ready && (role === 'OWNER' || role === 'ADMIN')
  const manager = ready && (workspaceManager || (actorId !== undefined && !!project.data?.managerIds?.includes(actorId)))
  return { archived, manager, workspaceManager, actorId, ready, canExecute: (ticket: { assigneeId?: number | null }) => ready && !archived && (manager || ticket.assigneeId === actorId) }
}
