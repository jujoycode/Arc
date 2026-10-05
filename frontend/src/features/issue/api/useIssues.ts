import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { Issue } from './types'

export function useIssues(projectId: number) {
  return useQuery({ queryKey: ['issues', projectId], queryFn: async () => {
    const items: Issue[] = []
    let page = 0, total = 0
    do {
      const result = await api<{ items: Issue[]; total: number }>(`/projects/${projectId}/issues?size=1000&page=${page}`)
      total = result.total
      items.push(...result.items)
      if (!result.items.length) break
      page += 1
    } while (items.length < total)
    return { items, total }
  } })
}

