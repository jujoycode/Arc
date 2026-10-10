import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as v from 'valibot'
import { Link } from '@tanstack/react-router'
import { api, APIError } from '@/shared/api/client'
import { issuePath, refreshProjectIssues } from '../../api/issueActions'
import type { Issue } from '../../api/types'
import { issueCreatedSchema, issueUpdatedSchema } from '../../api/schemas'
import type { Member } from '@/features/workspace'
import { useProjectAccess, type Project, type Version } from '@/features/project'
import { useTicketFields, parseTicketValues, type TicketFieldPolicy, type StandardFieldDefinition } from '@/features/ticketfield'
import { useIssues } from '../../api/useIssues'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { FormField, FormErrorSummary, focusFirstFormError } from '@/shared/ui/form'
import { Mascot } from '@/shared/ui/Mascot'
import { issueFormSchema, validationErrors, type IssueFormValues } from '../model/issueFormSchema'
import { priorityLabels, statusLabels, typeLabels } from '../model/issueLabels'
export { priorityLabels, statusLabels, typeLabels } from '../model/issueLabels'

type FieldKey = keyof IssueFormValues
const groups: { title: string; fields: FieldKey[] }[] = [
  { title: '기본 정보', fields: ['title', 'type', 'description'] },
  { title: '계획·배정', fields: ['priority', 'assigneeId', 'parentId', 'versionId'] },
  { title: '일정·추정', fields: ['startDate', 'dueDate', 'storyPoints'] },
  { title: '진행 상황', fields: ['status', 'progress'] },
]

export function IssueForm({ projectId, initial, defaults, onSaved, onCancel, onBusyChange }: { projectId: number; initial?: Issue; defaults?: Pick<Issue, 'type' | 'parentId' | 'versionId'>; onSaved?: (id: number) => void; onCancel?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const queryClient = useQueryClient(), access = useProjectAccess(projectId)
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const policy = useTicketFields(project.data?.workspaceId ?? 0)
  const [snapshot, setSnapshot] = useState<TicketFieldPolicy>()
  if (policy.data && !snapshot) setSnapshot(structuredClone(policy.data))
  const members = useQuery({ queryKey: ['members', project.data?.workspaceId], queryFn: () => api<Member[]>(`/auth/workspaces/${project.data!.workspaceId}/members`), enabled: !!project.data })
  const versions = useQuery({ queryKey: ['versions', projectId], queryFn: () => api<Version[]>(`/projects/${projectId}/versions`) })
  const issues = useIssues(projectId)
  const [values, setValues] = useState<IssueFormValues>({
    title: initial?.title ?? '', description: initial?.description ?? '', type: initial?.type ?? defaults?.type ?? 'STORY',
    status: initial?.status ?? 'TODO', priority: initial?.priority ?? 'NORMAL', assigneeId: initial?.assigneeId?.toString() ?? '',
    startDate: initial?.startDate?.slice(0, 10) ?? '', dueDate: initial?.dueDate?.slice(0, 10) ?? '', progress: String(initial?.progress ?? 0),
    storyPoints: initial?.storyPoints?.toString() ?? '', parentId: (initial?.parentId ?? defaults?.parentId)?.toString() ?? '', versionId: (initial?.versionId ?? defaults?.versionId)?.toString() ?? '',
  })
  const [baseVersion] = useState(initial?.version)
  const [customInputs, setCustomInputs] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial?.customFields ?? {}).map(([key, value]) => [key, value == null ? '' : String(value)])))
  const [busy, setBusy] = useState(false), [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({}), [error, setError] = useState('')
  const [conflict, setConflict] = useState<'fields' | 'ticket' | null>(null)
  const definitions = snapshot?.standardFields ?? []
  const definition = (key: FieldKey) => definitions.find(field => field.key === key)
  const shown = (field: StandardFieldDefinition) => field.visible || (field.key === 'parentId' && values.type === 'SUBTASK')
  const parentNeeded = !!definition('parentId') && (definition('parentId')!.visible || values.type === 'SUBTASK') && values.type !== 'EPIC'
  const candidates = [
    ...(definition('assigneeId')?.visible ? [{ name: '담당자', query: members }] : []),
    ...(definition('versionId')?.visible ? [{ name: '버전', query: versions }] : []),
    ...(parentNeeded ? [{ name: '부모 이슈', query: issues }] : []),
  ]
  const candidatesUnavailable = candidates.some(item => item.query.isPending || item.query.isError)

  function validate(next = values, custom = customInputs) {
    const parsed = v.safeParse(issueFormSchema, next)
    const nextErrors = parsed.success ? {} : validationErrors(parsed.issues)
    for (const field of definitions) if (shown(field) && field.required && !String(next[field.key]).trim()) nextErrors[field.key] = `${field.label}을(를) 입력해 주세요.`
    const customResult = parseTicketValues(custom, snapshot?.customFields ?? [], initial?.customFields)
    Object.assign(nextErrors, customResult.errors)
    return { parsed, errors: nextErrors, customFields: customResult.values }
  }
  function change(key: FieldKey, value: string) {
    const next = { ...values, [key]: value, ...(key === 'type' ? { parentId: '' } : {}) } as IssueFormValues
    setValues(next)
    if (submitted) setErrors(validate(next).errors)
  }
  function changeCustom(key: string, value: string) {
    const next = { ...customInputs, [key]: value }
    setCustomInputs(next)
    if (submitted) setErrors(validate(values, next).errors)
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!access.manager || access.archived || busy || !snapshot || candidatesUnavailable) return
    setSubmitted(true); setError(''); setConflict(null)
    const result = validate()
    setErrors(result.errors)
    if (!result.parsed.success || Object.keys(result.errors).length) { focusFirstFormError(result.errors); return }
    // Hidden fields retain their original values on edit and server defaults on create.
    const body: Record<string, unknown> = { customFields: result.customFields, fieldRevision: snapshot.revision }
    for (const field of definitions) if (initial || shown(field)) body[field.key] = initial && !shown(field) && !(field.key === 'parentId' && values.type !== initial.type) ? initial[field.key] : result.parsed.output[field.key]
    setBusy(true); onBusyChange?.(true)
    try {
      const saved = initial
        ? await api<{ version: number }>(issuePath(projectId, initial.id), { method: 'PUT', body: { ...body, version: baseVersion }, schema: issueUpdatedSchema })
        : await api<{ id: number }>(`/projects/${projectId}/issues`, { body, schema: issueCreatedSchema })
      await refreshProjectIssues(queryClient, projectId)
      onSaved?.(initial ? initial.id : (saved as { id: number }).id)
    } catch (cause) {
      if (cause instanceof APIError) {
        setErrors(cause.fieldErrors); focusFirstFormError(cause.fieldErrors)
        if (cause.status === 409) setConflict(cause.code === 'TICKET_FIELDS_CHANGED' ? 'fields' : 'ticket')
      }
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다. 다시 시도해 주세요.')
    } finally { setBusy(false); onBusyChange?.(false) }
  }
  async function checkPolicy() {
    const result = await policy.refetch()
    if (result.data && !result.isError) { setSnapshot(structuredClone(result.data)); setConflict(null); setError(''); setErrors({}); setSubmitted(false) }
  }
  const possibleParents = (issues.data?.items ?? []).filter(issue => issue.id !== initial?.id && (values.type === 'SUBTASK' ? ['STORY', 'TASK', 'BUG'].includes(issue.type) : issue.type === 'EPIC'))
  if (project.isError) return <div className="form-message" role="alert"><p>{project.error.message}</p><Button type="button" variant="outline" onClick={() => void project.refetch()}>다시 불러오기</Button></div>
  if (!access.ready || project.isPending) return <p className="loading-state" role="status">편집 권한을 확인하는 중입니다…</p>
  if (!access.manager || access.archived) return <p className="view-note">계획 편집은 보관되지 않은 프로젝트의 관리자만 할 수 있습니다.</p>
  if (policy.isError && !snapshot) return <div className="form-message" role="alert"><p>{policy.error.message}</p><Button type="button" variant="outline" onClick={() => void policy.refetch()}>다시 불러오기</Button></div>
  if (!snapshot) return <p className="loading-state" role="status">티켓 필드 설정을 불러오는 중입니다…</p>

  function renderStandard(field: StandardFieldDefinition): ReactNode {
    const key = field.key, required = field.required || (key === 'parentId' && values.type === 'SUBTASK')
    const extraHelp = key === 'progress' ? '0~100%의 정수입니다. 하위 작업의 집계 완료율과 별도로 기록합니다.' : key === 'storyPoints' ? '0은 추정치 0포인트, 빈 값은 미추정입니다.' : key === 'parentId' ? '하위 작업은 부모가 필요합니다. 유형을 바꾸면 부모 선택을 다시 확인하세요.' : ''
    return <FormField key={key} name={key} label={field.label} required={required} description={[field.description, extraHelp].filter(Boolean).join(' ')} error={errors[key]} fullWidth={key === 'title' || key === 'description'}>{props => {
      if (key === 'description') return <Textarea {...props} value={values[key]} rows={4} onChange={event => change(key, event.target.value)} disabled={busy} />
      if (key === 'title') return <Input {...props} maxLength={200} value={values[key]} onChange={event => change(key, event.target.value)} disabled={busy} />
      if (key === 'startDate' || key === 'dueDate') return <Input {...props} type="date" value={values[key]} onChange={event => change(key, event.target.value)} disabled={busy} />
      if (key === 'progress' || key === 'storyPoints') return <Input {...props} type="number" min={0} max={key === 'progress' ? 100 : 2_147_483_647} step={1} value={values[key]} onChange={event => change(key, event.target.value)} disabled={busy} />
      const query = key === 'assigneeId' ? members : key === 'versionId' ? versions : key === 'parentId' ? issues : undefined
      return <select {...props} value={values[key]} onChange={event => change(key, event.target.value)} disabled={busy || !!query && (query.isPending || query.isError) || key === 'parentId' && values.type === 'EPIC'}>
        {key === 'type' || key === 'status' || key === 'priority' ? Object.entries(key === 'type' ? typeLabels : key === 'status' ? statusLabels : priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>) : <>
          <option value="">{query?.isPending ? '불러오는 중…' : key === 'assigneeId' ? '미지정' : key === 'parentId' && values.type === 'SUBTASK' ? '부모 선택' : '없음'}</option>
          {key === 'assigneeId' && members.data?.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}
          {key === 'versionId' && versions.data?.map(version => <option key={version.id} value={version.id}>{version.name}</option>)}
          {key === 'parentId' && possibleParents.map(issue => <option key={issue.id} value={issue.id}>{issue.key} {issue.title}</option>)}
        </>}
      </select>
    }}</FormField>
  }
  return <form className="issue-form arc-form ticket-plan-form" onSubmit={submit} noValidate aria-busy={busy}>
    <FormErrorSummary errors={errors} message={error} />
    {policy.isError && <div className="form-message" role="alert"><p>{policy.error.message}</p><Button type="button" variant="outline" onClick={() => void checkPolicy()}>필드 설정 다시 확인</Button></div>}
    {conflict === 'fields' && <div className="arc-form-conflict"><p>입력한 내용은 유지됩니다. 최신 필드 설정을 확인한 뒤 다시 저장해 주세요.</p><Button type="button" variant="outline" disabled={policy.isFetching} onClick={() => void checkPolicy()}>필드 설정 다시 확인</Button></div>}
    {conflict === 'ticket' && initial && <div className="arc-form-conflict"><p>입력한 내용은 유지됩니다. 최신 티켓을 확인한 뒤 편집을 다시 시작해 주세요.</p><Link to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(initial.id) }} target="_blank" rel="noopener noreferrer">최신 티켓 확인 (새 창)</Link></div>}
    {candidates.filter(item => item.query.isError).map(item => <div key={item.name} className="form-message" role="alert"><p>{item.name} 후보를 불러오지 못했습니다. 입력한 내용은 유지됩니다.</p><Button type="button" variant="outline" onClick={() => void item.query.refetch()}>다시 불러오기</Button></div>)}
    {candidates.some(item => item.query.isPending) && <p role="status" className="view-note">후보 목록을 불러오는 중입니다…</p>}
    {groups.map(group => { const fields = definitions.filter(field => group.fields.includes(field.key) && shown(field)).sort((a, b) => a.order - b.order); return fields.length ? <fieldset key={group.title} className="arc-form-group"><legend>{group.title}</legend><div className="arc-form-grid">{fields.map(renderStandard)}</div></fieldset> : null })}
    {snapshot.customFields.some(field => field.active) && <fieldset className="arc-form-group"><legend>추가 정보</legend><div className="arc-form-grid">{snapshot.customFields.filter(field => field.active).sort((a, b) => a.order - b.order).map(field => <FormField key={field.key} name={`customFields.${field.key}`} label={field.label} required={field.required} description={field.description} error={errors[`customFields.${field.key}`]}>{props => field.type === 'SELECT' ? <select {...props} value={customInputs[field.key] ?? ''} disabled={busy} onChange={event => changeCustom(field.key, event.target.value)}><option value="">선택하지 않음</option>{field.options.filter(option => option.active || initial?.customFields?.[field.key] === option.value).map(option => <option key={option.value} value={option.value}>{option.label}{!option.active ? ' (사용 중단)' : ''}</option>)}</select> : <Input {...props} type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'} step={field.type === 'NUMBER' ? 'any' : undefined} maxLength={field.type === 'TEXT' ? 2000 : undefined} value={customInputs[field.key] ?? ''} disabled={busy} onChange={event => changeCustom(field.key, event.target.value)} />}</FormField>)}</div></fieldset>}
    {definition('assigneeId')?.visible && values.assigneeId && values.assigneeId !== String(initial?.assigneeId ?? '') && <div className="ticket-assignment-notice" role="status"><Mascot key={values.assigneeId} variant="deliver" size={40} /><p>{members.data?.find(member => member.id === Number(values.assigneeId))?.displayName ?? '선택한 담당자'}님에게 업무를 배정합니다.</p></div>}
    <div className="form-actions arc-form-actions">{onCancel && <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>취소</Button>}<Button type="submit" disabled={busy || candidatesUnavailable || conflict === 'ticket'}>{busy ? '저장 중…' : initial ? '변경 저장' : '이슈 만들기'}</Button></div>
  </form>
}
