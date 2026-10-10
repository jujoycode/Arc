import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ticketFieldPolicySchema, type TicketFieldPolicy } from './schema'

export const ticketFieldsKey = (workspaceId: number) => ['ticket-fields', workspaceId] as const
export function useTicketFields(workspaceId: number) {
  return useQuery({queryKey: ticketFieldsKey(workspaceId), enabled: workspaceId > 0, queryFn: () => api<TicketFieldPolicy>(`/auth/workspaces/${workspaceId}/ticket-fields`, {schema: ticketFieldPolicySchema})})
}
