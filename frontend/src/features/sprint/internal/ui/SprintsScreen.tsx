import { useState } from 'react'
import * as v from 'valibot'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { api, APIError } from '@/shared/api/client'
import { useIssues, refreshProjectIssues, matchesIssue, ProjectIssueFilters, useProjectFilters } from '@/features/issue'
import { useProjectAccess } from '@/features/project'
import { useSprints } from '../../api/useSprints'
import { Button } from '@/shared/ui/button'
import { IssueCard, issuePath, statusLabels } from '@/features/issue'
import type { Issue } from '@/features/issue'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { FormErrorSummary, FormField, focusFirstFormError } from '@/shared/ui/form'
import { sprintFormSchema, sprintCloseSchema, sprintCreatedSchema, sprintStartedSchema, sprintClosedSchema, sprintValidationErrors, type SprintFormValues } from '../model/sprintFormSchema'

const initialForm: SprintFormValues = { name: '', goal: '', startOn: '', endOn: '' }
const fieldName = (name: string) => `sprint-${name}`
const prefixedErrors = (errors: Record<string, string>) => Object.fromEntries(Object.entries(errors).map(([name, message]) => [fieldName(name), message]))

export function SprintsScreen({ projectId }: { projectId: number }) {
  const sprints = useSprints(projectId)
  const issues = useIssues(projectId)
  const { filters } = useProjectFilters()
  const { archived, manager, canExecute } = useProjectAccess(projectId)
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<SprintFormValues>(initialForm)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [startingId, setStartingId] = useState<number | null>(null)
  const [summary, setSummary] = useState('')
  const [historyId, setHistoryId] = useState<number | null>(null)
  const [closingId, setClosingId] = useState<number | null>(null)
  const [nextSprintId, setNextSprintId] = useState('')
  const [closeErrors, setCloseErrors] = useState<Record<string, string>>({})
  const [closeError, setCloseError] = useState('')
  const [closing, setClosing] = useState(false)
  const history = useQuery({ queryKey: ['sprint-history', projectId, historyId], queryFn: () => api<{ key: string; title: string; finalStatus: string; finalStoryPoints: number | null }[]>(`/projects/${projectId}/sprints/${historyId}/history`), enabled: historyId !== null })
  const historySummary = history.data?.reduce((result, item) => ({ count: result.count + 1, done: result.done + Number(item.finalStatus === 'DONE'), donePoints: result.donePoints + (item.finalStatus === 'DONE' ? item.finalStoryPoints ?? 0 : 0), remainingPoints: result.remainingPoints + (item.finalStatus !== 'DONE' ? item.finalStoryPoints ?? 0 : 0) }), { count: 0, done: 0, donePoints: 0, remainingPoints: 0 })
  const active = sprints.data?.find(sprint => sprint.status === 'ACTIVE')
  const activeIssues = (issues.data?.items ?? []).filter(issue => issue.sprintId === active?.id)
  const planned = sprints.data?.filter(sprint => sprint.status === 'PLANNED') ?? []

  function updateForm<K extends keyof SprintFormValues>(name: K, value: SprintFormValues[K]) {
    const next = { ...form, [name]: value }
    setForm(next)
    if (Object.keys(formErrors).length) {
      const result = v.safeParse(sprintFormSchema, next)
      const nextErrors = result.success ? {} : sprintValidationErrors(result.issues)
      setFormErrors(Object.fromEntries(Object.keys(formErrors).filter(key => nextErrors[key]).map(key => [key, nextErrors[key]])))
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (creating || !manager || archived) return
    setCreateError('')
    const result = v.safeParse(sprintFormSchema, form)
    if (!result.success) {
      const errors = sprintValidationErrors(result.issues)
      setFormErrors(errors)
      focusFirstFormError(prefixedErrors(errors))
      return
    }
    setFormErrors({})
    setCreating(true)
    try {
      await api(`/projects/${projectId}/sprints`, { body: result.output, schema: sprintCreatedSchema })
      setOpen(false)
      setForm(initialForm)
      await client.invalidateQueries({ queryKey: ['sprints', projectId] })
    } catch (cause) {
      const fields = cause instanceof APIError ? Object.fromEntries(Object.entries(cause.fieldErrors).filter(([key]) => key in initialForm)) : {}
      setFormErrors(fields)
      setCreateError(cause instanceof Error ? cause.message : '스프린트를 저장하지 못했습니다. 다시 시도해 주세요.')
      focusFirstFormError(prefixedErrors(fields))
    } finally { setCreating(false) }
  }

  async function start(id: number) {
    if (startingId !== null || !manager || archived) return
    setStartingId(id)
    setError('')
    try {
      const result = await api(`/projects/${projectId}/sprints/${id}/start`, { method: 'POST', schema: sprintStartedSchema })
      setSummary(`${result.issueCount}개 이슈 · ${result.storyPoints}점으로 시작했습니다.`)
      await client.invalidateQueries({ queryKey: ['sprints', projectId] })
    } catch (cause) { setError(cause instanceof Error ? cause.message : '스프린트를 시작하지 못했습니다.') }
    finally { setStartingId(null) }
  }

  async function close(event: React.FormEvent) {
    event.preventDefault()
    if (closing || closingId === null || !manager || archived) return
    setCloseError('')
    const result = v.safeParse(sprintCloseSchema, { nextSprintId })
    const errors = result.success ? {} : sprintValidationErrors(result.issues)
    if (result.success && result.output.nextSprintId !== null && !planned.some(sprint => sprint.id === result.output.nextSprintId)) {
      errors.nextSprintId = '현재 계획 중인 스프린트를 선택하거나 백로그로 이동해 주세요.'
    }
    if (!result.success || Object.keys(errors).length) {
      setCloseErrors(errors)
      focusFirstFormError(prefixedErrors(errors))
      return
    }
    setCloseErrors({})
    setClosing(true)
    try {
      const summary = await api(`/projects/${projectId}/sprints/${closingId}/close`, { body: result.output, schema: sprintClosedSchema })
      setSummary(`${summary.issueCount}개 중 ${summary.doneCount}개 완료 · 완료 ${summary.donePoints}점 / 미완료 ${summary.remainingPoints}점`)
      setClosingId(null)
      setNextSprintId('')
      await client.invalidateQueries({ queryKey: ['sprints', projectId] })
      await refreshProjectIssues(client, projectId)
    } catch (cause) {
      const fields: Record<string, string> = cause instanceof APIError && cause.fieldErrors.nextSprintId ? { nextSprintId: cause.fieldErrors.nextSprintId } : {}
      setCloseErrors(fields)
      setCloseError(cause instanceof Error ? cause.message : '스프린트를 종료하지 못했습니다. 다시 시도해 주세요.')
      focusFirstFormError(prefixedErrors(fields))
    } finally { setClosing(false) }
  }

  async function move(issue: Issue, status: Issue['status']) {
    if (!canExecute(issue) || busyId !== null || issue.status === status) return
    setBusyId(issue.id); setError('')
    try { await api(issuePath(projectId, issue.id) + '/status', { method: 'PATCH', body: { status, version: issue.version } }); await refreshProjectIssues(client, projectId) }
    catch (cause) { setError((cause as Error).message); await client.invalidateQueries({ queryKey: ['issues', projectId] }) }
    finally { setBusyId(null) }
  }

  return <section className="view-page">
    <div className="view-heading">
      <div><p className="eyebrow">SPRINT CYCLE</p><h1>스프린트</h1><p>목표를 정하고, 이슈를 진행한 뒤 결과를 보존합니다.</p></div>
      {manager && <Button disabled={archived} onClick={() => { setCreateError(''); setOpen(true) }}>스프린트 계획</Button>}
    </div>
    {error && <p className="form-message" role="alert">{error}</p>}
    {summary && <p className="success-message" role="status">{summary}</p>}
    {sprints.isPending && <p className="loading-state">스프린트를 불러오는 중입니다…</p>}
    {sprints.isError && <p className="form-message" role="alert">{sprints.error.message}</p>}
    {issues.isError && <p className="form-message" role="alert">{issues.error.message}</p>}
    <ProjectIssueFilters projectId={projectId} prefix="스프린트" />
    {active ? <section className="active-sprint">
      <div className="section-heading">
        <div><p className="eyebrow">진행 중</p><h2>{active.name}</h2><p>{active.goal}</p><p className="muted">{active.startOn.slice(0, 10)} – {active.endOn.slice(0, 10)} · {activeIssues.filter(issue => issue.status === 'DONE').length}/{activeIssues.length}개 완료 · {activeIssues.reduce((sum, issue) => sum + (issue.storyPoints ?? 0), 0)}점</p></div>
        {manager && <Button disabled={archived} variant="outline" onClick={() => { setCloseError(''); setCloseErrors({}); setClosingId(active.id) }}>스프린트 종료</Button>}
      </div>
      <div className="board-grid sprint-board" role="region" aria-label="스프린트 이슈 보드" tabIndex={0}>{Object.entries(statusLabels).map(([status, label]) => {
        const cards = issues.data?.items.filter(issue => issue.sprintId === active.id && issue.status === status && matchesIssue(issue, filters)) ?? []
        return <section key={status} className="board-column" aria-label={`${label} 열`}><header><h2>{label}</h2><span>{cards.length}</span></header><div className="board-cards">{cards.map(issue => <IssueCard key={issue.id} issue={issue} disabled={!canExecute(issue)} busy={busyId === issue.id} onStatusChange={move} />)}</div></section>
      })}</div>
    </section> : <p className="empty-message">진행 중인 스프린트가 없습니다. 계획 중 스프린트에 이슈를 넣고 시작하세요.</p>}
    <h2 className="subheading">모든 스프린트</h2>
    <div className="sprint-list">{sprints.data?.map(sprint => <article key={sprint.id} className="sprint-tile">
      <div><strong>{sprint.name}</strong><p>{sprint.startOn.slice(0, 10)} – {sprint.endOn.slice(0, 10)} · {sprint.status === 'PLANNED' ? '계획' : sprint.status === 'ACTIVE' ? '진행 중' : '종료'}</p></div>
      {manager && sprint.status === 'PLANNED' && <Button variant="outline" disabled={archived || !!active || startingId !== null} onClick={() => start(sprint.id)}>시작</Button>}
      {sprint.status === 'CLOSED' && <Button variant="outline" onClick={() => setHistoryId(sprint.id)}>결과 보기</Button>}
    </article>)}</div>

    <Dialog open={open} onOpenChange={value => { if (!creating) setOpen(value) }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader><DialogTitle>스프린트 계획</DialogTitle><DialogDescription>목표와 기간을 정해 팀이 함께 진행할 업무를 준비합니다.</DialogDescription></DialogHeader>
        <form className="form-stack arc-form" onSubmit={create} noValidate aria-busy={creating}>
          <FormErrorSummary errors={prefixedErrors(formErrors)} message={createError} />
          <fieldset className="arc-form-group" disabled={creating}>
            <legend>목표와 기간</legend>
            <div className="arc-form-grid">
              <FormField name={fieldName('name')} label="스프린트 이름" required error={formErrors.name} description="팀이 알아볼 수 있는 이름을 120자 이내로 입력하세요." fullWidth>
                {props => <Input {...props} placeholder="스프린트 이름" value={form.name} onChange={event => updateForm('name', event.target.value)} />}
              </FormField>
              <FormField name={fieldName('goal')} label="목표" error={formErrors.goal} description="스프린트가 끝났을 때 달성할 결과를 적어 주세요." fullWidth>
                {props => <Textarea {...props} placeholder="목표" value={form.goal} onChange={event => updateForm('goal', event.target.value)} />}
              </FormField>
              <FormField name={fieldName('startOn')} label="시작일" required error={formErrors.startOn}>
                {props => <Input {...props} type="date" value={form.startOn} onChange={event => updateForm('startOn', event.target.value)} />}
              </FormField>
              <FormField name={fieldName('endOn')} label="종료일" required error={formErrors.endOn} description="시작일과 같거나 이후인 날짜를 선택하세요.">
                {props => <Input {...props} type="date" value={form.endOn} onChange={event => updateForm('endOn', event.target.value)} />}
              </FormField>
            </div>
          </fieldset>
          <div className="setting-actions"><Button type="button" variant="outline" disabled={creating} onClick={() => setOpen(false)}>취소</Button><Button type="submit" disabled={creating || archived || !manager}>계획 저장</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={closingId !== null} onOpenChange={value => { if (!value && !closing) setClosingId(null) }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader><DialogTitle>스프린트 종료</DialogTitle><DialogDescription>완료되지 않은 이슈를 어디로 옮길지 선택하세요. 종료 당시 결과는 보존됩니다.</DialogDescription></DialogHeader>
        <form className="form-stack arc-form" onSubmit={close} noValidate aria-busy={closing}>
          <FormErrorSummary errors={prefixedErrors(closeErrors)} message={closeError} />
          <FormField name={fieldName('nextSprintId')} label="이동할 곳" description="백로그로 돌려보내거나 다음 계획 스프린트에 편성합니다." error={closeErrors.nextSprintId}>
            {props => <select {...props} disabled={closing || sprints.isPending || sprints.isError} value={nextSprintId} onChange={event => { setNextSprintId(event.target.value); setCloseErrors({}) }}><option value="">백로그</option>{planned.map(sprint => <option value={sprint.id} key={sprint.id}>{sprint.name}</option>)}</select>}
          </FormField>
          {sprints.isPending && <p className="muted" role="status">이동할 스프린트를 불러오는 중입니다…</p>}
          {sprints.isError && <div><p className="form-message" role="alert">이동할 스프린트를 불러오지 못했습니다. {sprints.error.message}</p><Button type="button" variant="outline" disabled={sprints.isFetching} onClick={() => sprints.refetch()}>다시 불러오기</Button></div>}
          {!sprints.isPending && !sprints.isError && !planned.length && <p className="muted">계획 중인 스프린트가 없어 백로그로 이동합니다.</p>}
          <div className="setting-actions"><Button type="button" variant="outline" disabled={closing} onClick={() => setClosingId(null)}>취소</Button><Button type="submit" disabled={closing || archived || !manager || sprints.isPending || sprints.isError}>종료 확정</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={historyId !== null} onOpenChange={value => { if (!value) setHistoryId(null) }}>
      <DialogContent><DialogHeader><DialogTitle>종료 당시 결과</DialogTitle></DialogHeader>{history.isPending && <p>결과를 불러오는 중입니다…</p>}{history.isError && <p role="alert">{history.error.message}</p>}{historySummary && <p className="muted">{historySummary.count}개 중 {historySummary.done}개 완료 · 완료 {historySummary.donePoints}점 / 미완료 {historySummary.remainingPoints}점</p>}{history.data?.map(item => <p key={item.key}>{item.key} · {item.title} · {statusLabels[item.finalStatus as Issue['status']]} · {item.finalStoryPoints ?? 0}점</p>)}</DialogContent>
    </Dialog>
  </section>
}
