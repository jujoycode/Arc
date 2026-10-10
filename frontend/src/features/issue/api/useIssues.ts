import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { Issue } from './types'
import { issuePageSchema } from './schemas'

export function useIssues(projectId: number) {
  return useQuery({ queryKey: ['issues', projectId], queryFn: async ({ signal }) => {
    const fetchPage = (page: number) => api<{ items: Issue[]; total: number }>(`/projects/${projectId}/issues?size=1000&page=${page}`, { signal, schema: issuePageSchema })
    const first = await fetchPage(0)
    const items = [...first.items]
    const pages = Math.ceil(first.total / 1000)
    // Bound concurrent requests; Promise.all keeps the server's page ordering.
    for (let page = 1; page < pages; page += 4) {
      const batch = await Promise.all(Array.from({ length: Math.min(4, pages - page) }, (_, index) => fetchPage(page + index)))
      for (const result of batch) items.push(...result.items)
    }
    return { items, total: first.total }
  } })
}
