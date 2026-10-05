export interface Issue {
  id: number; projectId: number; key: string; number: number; title: string; description?: string | null;
  type: 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'SUBTASK'; status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'; reporterId: number; assigneeId?: number | null;
  assigneeName?: string | null; startDate?: string | null; dueDate?: string | null; progress: number;
  storyPoints?: number | null; parentId?: number | null; versionId?: number | null; sprintId?: number | null;
  sortOrder: number; version: number; updatedAt: string
}
export interface Relation { id: number; fromId: number; toId: number; type: 'BLOCKS' | 'PRECEDES' }
export interface Comment { id: number; body: string; authorId: number; authorName: string; createdAt: string }
