export interface Project { id: number; workspaceId: number; parentProjectId?: number | null; name: string; key: string; nextIssueNumber?: number; description?: string; archivedAt?: string | null; managerIds?: number[] }
export interface Version { id: number; name: string; startDate?: string | null; dueDate: string; status: string }
