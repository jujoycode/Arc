import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, issuePath, refreshProjectIssues } from './api'
import type { Issue, Member, Project, Version } from './api'
import { useIssues } from './GanttScreen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export const statusLabels = { TODO: '할 일', IN_PROGRESS: '진행 중', REVIEW: '검토', DONE: '완료' } as const
export const typeLabels = { EPIC: 'Epic', STORY: 'Story', TASK: 'Task', BUG: 'Bug', SUBTASK: '하위 작업' } as const
export const priorityLabels = { LOW: '낮음', NORMAL: '보통', HIGH: '높음', URGENT: '긴급' } as const

export function IssueForm({ projectId, initial, onSaved, onCancel }: { projectId: number; initial?: Issue; onSaved?: (id: number) => void; onCancel?: () => void }) {
  const queryClient = useQueryClient()
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const members = useQuery({ queryKey: ['members', project.data?.workspaceId], queryFn: () => api<Member[]>(`/auth/workspaces/${project.data!.workspaceId}/members`), enabled: !!project.data })
  const versions = useQuery({ queryKey: ['versions', projectId], queryFn: () => api<Version[]>(`/projects/${projectId}/versions`) })
  const issues = useIssues(projectId)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [type, setType] = useState<Issue['type']>(initial?.type ?? 'STORY')
  const [status, setStatus] = useState<Issue['status']>(initial?.status ?? 'TODO')
  const [priority, setPriority] = useState<Issue['priority']>(initial?.priority ?? 'NORMAL')
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId?.toString() ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate?.slice(0, 10) ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate?.slice(0, 10) ?? '')
  const [progress, setProgress] = useState(initial?.progress?.toString() ?? '0')
  const [storyPoints, setStoryPoints] = useState(initial?.storyPoints?.toString() ?? '')
  const [parentId, setParentId] = useState(initial?.parentId?.toString() ?? '')
  const [versionId, setVersionId] = useState(initial?.versionId?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const body = { title, description, type, status, priority, assigneeId: assigneeId ? Number(assigneeId) : null, startDate: startDate || null, dueDate: dueDate || null, progress: Number(progress), storyPoints: storyPoints ? Number(storyPoints) : null, parentId: parentId ? Number(parentId) : null, versionId: versionId ? Number(versionId) : null }
    try {
      const result = initial
        ? await api<{ version: number }>(issuePath(projectId, initial.id), { method: 'PUT', body: { ...body, version: initial.version } })
        : await api<{ id: number }>(`/projects/${projectId}/issues`, { body })
      await refreshProjectIssues(queryClient, projectId)
      onSaved?.(initial ? initial.id : (result as { id: number }).id)
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  const possibleParents = (issues.data?.items ?? []).filter(issue => issue.id !== initial?.id && (type === 'SUBTASK' ? ['STORY', 'TASK', 'BUG'].includes(issue.type) : issue.type === 'EPIC'))
  return <form className="issue-form" onSubmit={submit}><div className="full-field"><Label htmlFor="issue-title">제목</Label><Input id="issue-title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} /></div><div className="full-field"><Label htmlFor="issue-description">설명</Label><Textarea id="issue-description" value={description} onChange={e => setDescription(e.target.value)} rows={4} /></div><label>유형<select value={type} onChange={e => { setType(e.target.value as Issue['type']); setParentId('') }}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>상태<select value={status} onChange={e => setStatus(e.target.value as Issue['status'])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>우선순위<select value={priority} onChange={e => setPriority(e.target.value as Issue['priority'])}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>담당자<select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}><option value="">미지정</option>{members.data?.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><label>시작일<Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label><label>완료일<Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label><label>완료율<Input type="number" min={0} max={100} value={progress} onChange={e => setProgress(e.target.value)} /></label><label>스토리 포인트<Input type="number" min={0} value={storyPoints} onChange={e => setStoryPoints(e.target.value)} /></label><label>부모 이슈<select value={parentId} onChange={e => setParentId(e.target.value)} required={type === 'SUBTASK'} disabled={type === 'EPIC'}><option value="">{type === 'SUBTASK' ? '부모 선택' : '없음'}</option>{possibleParents.map(issue => <option key={issue.id} value={issue.id}>{issue.key} {issue.title}</option>)}</select></label><label>버전<select value={versionId} onChange={e => setVersionId(e.target.value)}><option value="">없음</option>{versions.data?.map(version => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label>{error && <p className="form-message full-field" role="alert">{error}</p>}<div className="form-actions full-field"><Button type="submit" disabled={busy}>{busy ? '저장 중…' : initial ? '변경 저장' : '이슈 만들기'}</Button>{onCancel && <Button type="button" variant="outline" onClick={onCancel}>취소</Button>}</div></form>
}
