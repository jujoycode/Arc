import type { QueryClient } from '@tanstack/react-query'

export const issuePath = (projectId: number, issueId: number) => `/projects/${projectId}/issues/${issueId}`

export async function refreshProjectIssues(client: QueryClient, projectId: number) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['project', String(projectId)] }),
    client.invalidateQueries({ queryKey: ['issues', projectId] }),
    client.invalidateQueries({ queryKey: ['issue-directory', projectId] }),
    client.invalidateQueries({ queryKey: ['issue', projectId] }),
    client.invalidateQueries({ queryKey: ['activities', projectId] }),
    client.invalidateQueries({ queryKey: ['relations', projectId] }),
    client.invalidateQueries({ queryKey: ['gantt'] }),
  ])
}
