import { addDays, toDateKey } from './gantt'
import type { GanttIssue, GanttRelation } from './gantt'

const today = new Date()
const anchor = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
const date = (offset: number) => toDateKey(addDays(anchor, offset))

export const sampleIssues: GanttIssue[] = [
  { id: 'project', key: 'ARC', title: 'Arc 프로젝트', kind: 'PROJECT', status: 'IN_PROGRESS', startDate: date(-15), dueDate: date(44), progress: 36 },
  { id: 'version', parentId: 'project', key: 'v1.0', title: '팀 MVP 출시', kind: 'VERSION', status: 'IN_PROGRESS', startDate: date(-15), dueDate: date(44), progress: 36 },
  { id: 'epic-design', parentId: 'version', key: 'ARC-1', title: '디자인 시스템', kind: 'EPIC', status: 'IN_PROGRESS', startDate: date(-15), dueDate: date(12), progress: 72 },
  { id: 'story-tokens', parentId: 'epic-design', key: 'ARC-2', title: 'KRDS 기반 토큰 정의', kind: 'STORY', status: 'DONE', assignee: '민지', startDate: date(-15), dueDate: date(-5), progress: 100 },
  { id: 'task-components', parentId: 'epic-design', key: 'ARC-3', title: '공통 컴포넌트 설계', kind: 'TASK', status: 'IN_PROGRESS', assignee: '현우', startDate: date(-3), dueDate: date(12), progress: 45 },
  { id: 'epic-gantt', parentId: 'version', key: 'ARC-4', title: '간트 차트', kind: 'EPIC', status: 'IN_PROGRESS', startDate: date(-8), dueDate: date(32), progress: 28 },
  { id: 'story-hierarchy', parentId: 'epic-gantt', key: 'ARC-5', title: '계층과 일정 시각화', kind: 'STORY', status: 'IN_PROGRESS', assignee: '지수', startDate: date(-8), dueDate: date(8), progress: 60 },
  { id: 'subtask-relations', parentId: 'story-hierarchy', key: 'ARC-6', title: '관계선 표시', kind: 'SUBTASK', status: 'TODO', assignee: '지수', startDate: date(3), dueDate: date(8), progress: 0 },
  { id: 'story-export', parentId: 'epic-gantt', key: 'ARC-7', title: '필터와 출력', kind: 'STORY', status: 'TODO', assignee: '도윤', startDate: date(10), dueDate: date(32), progress: 0 },
  { id: 'epic-board', parentId: 'version', key: 'ARC-8', title: '칸반과 스프린트', kind: 'EPIC', status: 'TODO', startDate: date(18), dueDate: date(42), progress: 0 },
  { id: 'task-board', parentId: 'epic-board', key: 'ARC-9', title: '상태별 보드', kind: 'TASK', status: 'TODO', assignee: '현우', startDate: date(18), dueDate: date(33), progress: 0 },
  { id: 'task-sprint', parentId: 'epic-board', key: 'ARC-10', title: '스프린트 계획', kind: 'TASK', status: 'TODO', assignee: '민지', startDate: date(34), dueDate: date(42), progress: 0 },
  { id: 'milestone', parentId: 'project', key: 'M1', title: '첫 릴리스', kind: 'VERSION', status: 'TODO', dueDate: date(44), progress: 0 },
]

export const sampleRelations: GanttRelation[] = [
  { fromId: 'story-tokens', toId: 'task-components', kind: 'PRECEDES' },
  { fromId: 'story-hierarchy', toId: 'story-export', kind: 'BLOCKS' },
  { fromId: 'task-board', toId: 'task-sprint', kind: 'PRECEDES' },
]
