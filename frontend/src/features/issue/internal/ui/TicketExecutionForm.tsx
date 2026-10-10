import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as v from 'valibot'
import { Link } from '@tanstack/react-router'
import { api, APIError } from '@/shared/api/client'
import { useProjectAccess, type Project } from '@/features/project'
import { useTicketFields } from '@/features/ticketfield'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { FormField, FormErrorSummary, focusFirstFormError } from '@/shared/ui/form'
import { issuePath, refreshProjectIssues } from '../../api/issueActions'
import { issueUpdatedSchema } from '../../api/schemas'
import type { Ticket } from '../../api/types'
import { executionFormSchema, validationErrors } from '../model/issueFormSchema'
import { statusLabels } from '../model/issueLabels'

export function TicketExecutionForm({ projectId, initial, onSaved, onCancel }: { projectId: number; initial: Ticket; onSaved: () => void; onCancel: () => void }) {
  const client = useQueryClient(), access = useProjectAccess(projectId)
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const policy = useTicketFields(project.data?.workspaceId ?? 0)
  const [values, setValues] = useState({ status: initial.status, progress: String(initial.progress) })
  const [baseVersion] = useState(initial.version)
  const [busy, setBusy] = useState(false), [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({}), [error, setError] = useState(''), [conflict, setConflict] = useState(false)
  function change(next: typeof values) {
    setValues(next)
    if (submitted) { const result = v.safeParse(executionFormSchema, next); setErrors(result.success ? {} : validationErrors(result.issues)) }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!access.canExecute(initial) || busy || conflict) return
    setSubmitted(true); setError('')
    const result = v.safeParse(executionFormSchema, values)
    if (!result.success) { const nextErrors = validationErrors(result.issues); setErrors(nextErrors); focusFirstFormError(nextErrors); return }
    setErrors({}); setBusy(true)
    try {
      await api<{ version: number }>(issuePath(projectId, initial.id) + '/execution', { method: 'PATCH', body: { ...result.output, version: baseVersion }, schema: issueUpdatedSchema })
      await refreshProjectIssues(client, projectId)
      onSaved()
    } catch (cause) {
      if (cause instanceof APIError) { setErrors(cause.fieldErrors); focusFirstFormError(cause.fieldErrors); if (cause.status === 409) setConflict(true) }
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }
  if (project.isError || policy.isError) return <div className="form-message" role="alert"><p>{project.error?.message ?? policy.error?.message}</p><Button type="button" variant="outline" onClick={() => { void project.refetch(); void policy.refetch() }}>다시 불러오기</Button></div>
  if (!policy.data) return <p className="loading-state" role="status">티켓 필드 설정을 불러오는 중입니다…</p>
  const status = policy.data.standardFields.find(field => field.key === 'status'), progress = policy.data.standardFields.find(field => field.key === 'progress')
  return <form className="arc-form ticket-execution-form" onSubmit={submit} noValidate aria-label="담당 티켓 진행 상황 수정" aria-busy={busy}>
    <p className="view-note">담당 업무의 상태와 완료율을 기록하세요. 계획·계층·배정 변경은 관리자에게 요청하세요. 하위 작업이 있는 경우 WBS 완료율은 하위 작업에서 집계됩니다.</p>
    <FormErrorSummary errors={errors} message={error} />
    {conflict && <div className="arc-form-conflict"><p>입력한 내용은 유지됩니다. 최신 티켓을 확인한 뒤 편집을 다시 시작해 주세요.</p><Link to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(initial.id) }} target="_blank" rel="noopener noreferrer">최신 티켓 확인 (새 창)</Link></div>}
    <fieldset className="arc-form-group"><legend>진행 상황</legend><div className="arc-form-grid">
      <FormField name="status" label={status?.label ?? '상태'} required description={status?.description} error={errors.status}>{props => <select {...props} value={values.status} disabled={busy} onChange={event => change({ ...values, status: event.target.value as Ticket['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</FormField>
      <FormField name="progress" label={progress?.label ?? '완료율'} required description={[progress?.description, '0~100%의 정수로 기록하세요.'].filter(Boolean).join(' ')} error={errors.progress}>{props => <Input {...props} type="number" min={0} max={100} step={1} value={values.progress} disabled={busy} onChange={event => change({ ...values, progress: event.target.value })} />}</FormField>
    </div></fieldset>
    <div className="form-actions arc-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>취소</Button><Button type="submit" disabled={busy || !access.canExecute(initial) || conflict}>{busy ? '저장 중…' : '진행 상황 저장'}</Button></div>
  </form>
}
