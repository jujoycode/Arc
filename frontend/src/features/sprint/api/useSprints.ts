import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { Sprint } from './types'

export function useSprints(projectId: number) { return useQuery({ queryKey: ['sprints', projectId], queryFn: () => api<Sprint[]>(`/projects/${projectId}/sprints`) }) }

