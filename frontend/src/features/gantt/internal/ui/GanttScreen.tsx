import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api } from '@/shared/api/client'
import type { GanttBundle, SavedView } from '../../api/types'
import { ganttRows } from '../model/ganttRows'
import { GanttChart } from './GanttChart'
import type { GanttRelation } from '../model/gantt'
import { IssueForm } from '@/features/issue'
import { useProjectAccess } from '@/features/project'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Plus } from 'lucide-react'

export function GanttScreen({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const { archived } = useProjectAccess(projectId)
  const gantt = useQuery({ queryKey: ['gantt', projectId], queryFn: () => api<GanttBundle>(`/projects/${projectId}/gantt`) })
  const views = useQuery({ queryKey: ['saved-views', projectId], queryFn: () => api<SavedView[]>(`/projects/${projectId}/saved-views`) })
  const rows = useMemo(() => gantt.data ? ganttRows(projectId, gantt.data.projects, gantt.data.issues, gantt.data.versions) : [], [projectId, gantt.data])
  const lines: GanttRelation[] = (gantt.data?.relations ?? []).map(relation => ({ fromId: String(relation.fromId), toId: String(relation.toId), kind: relation.type }))
  async function saveView(name: string, filters: string, options: string) {
    await api(`/projects/${projectId}/saved-views`, { body: { name, filters, options } })
    await queryClient.invalidateQueries({ queryKey: ['saved-views', projectId] })
  }
  async function deleteView(id: number) {
    await api(`/projects/${projectId}/saved-views/${id}`, { method: 'DELETE' })
    await queryClient.invalidateQueries({ queryKey: ['saved-views', projectId] })
  }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">PROJECT TIMELINE</p><h1>간트 차트</h1><p>현재 프로젝트와 하위 프로젝트의 일정, 완료율, 선행 관계를 확인하세요.</p></div><div className="heading-actions"><span className="data-badge">{gantt.data?.issues.length ?? 0}개 이슈</span><Button disabled={archived} onClick={() => setCreateOpen(true)}><Plus size={16} /> 이슈 만들기</Button></div></div>{gantt.isError && <p className="form-message" role="alert">{(gantt.error as Error).message}</p>}{views.isError && <p className="form-message" role="alert">개인 보기를 불러오지 못했습니다. {views.error.message}</p>}{gantt.isPending ? <p className="loading-state" role="status">일정을 불러오는 중입니다…</p> : !gantt.isError && <GanttChart issues={rows} relations={lines} savedViews={views.data} onSaveView={saveView} onDeleteView={deleteView} onOpenIssue={id => { const issue = gantt.data?.issues.find(item => item.id === Number(id)); if (issue) navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(issue.projectId), issueId: id } }) }} onOpenProject={id => navigate({ to: '/projects/$projectId/gantt', params: { projectId: id } })} onOpenVersion={id => navigate({ to: '/projects/$projectId/settings', params: { projectId: id } })} />}<Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>이슈 만들기</DialogTitle></DialogHeader><IssueForm projectId={projectId} onSaved={id => { setCreateOpen(false); navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(projectId), issueId: String(id) } }) }} onCancel={() => setCreateOpen(false)} /></DialogContent></Dialog></section>
}
