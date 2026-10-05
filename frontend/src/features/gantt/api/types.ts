export interface SavedView { id: number; name: string; filters: string; options: string }

import type { Issue, Relation } from '@/features/issue'
import type { Project, Version } from '@/features/project'
export interface GanttBundle { projects: Project[]; issues: Issue[]; versions: (Version & { projectId: number })[]; relations: Relation[] }
