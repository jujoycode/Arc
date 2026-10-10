import { useState } from 'react'
import { Link, Navigate, useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, APIError, tokenStore } from '@/shared/api/client'
import type { Workspace } from '@/features/workspace'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { FormField, FormErrorSummary, focusFirstFormError } from '@/shared/ui/form'
import { ticketFieldPolicySchema, validateFieldPolicy, type TicketFieldPolicy, type CustomFieldDefinition } from '../../api/schema'
import { useTicketFields, ticketFieldsKey } from '../../api/useTicketFields'
import './ticket-fields.css'

const core = new Set(['title', 'type', 'status', 'progress'])
const groups = [
  {title: '기본 정보', fields: ['title', 'type', 'description']},
  {title: '계획·배정', fields: ['priority', 'assigneeId', 'parentId', 'versionId']},
  {title: '일정·추정', fields: ['startDate', 'dueDate', 'storyPoints']},
  {title: '진행 상황', fields: ['status', 'progress']},
]
const groupOf = (key: string) => groups.findIndex(group => group.fields.includes(key))
const types = {TEXT: '텍스트', NUMBER: '숫자', DATE: '날짜', SELECT: '단일 선택'} as const
const newKey = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
const clone = (policy: TicketFieldPolicy) => structuredClone(policy)

export function TicketFieldsPage() {
  const { workspaceId } = useParams({strict: false})
  const id = Number(workspaceId)
  const spaces = useQuery({queryKey: ['workspaces'], queryFn: () => api<Workspace[]>('/auth/workspaces'), enabled: !!tokenStore.get()})
  const fields = useTicketFields(id)
  if (!tokenStore.get()) return <Navigate to="/login" />
  const workspace = spaces.data?.find(space => space.id === id)
  return <main id="main-content" className="ticket-fields-page">
    <Link to="/" className="table-link">← 워크스페이스</Link>
    <header className="page-heading"><div><p className="eyebrow">WORKSPACE SETTINGS</p><h1>티켓 필드 설정</h1><p>{workspace?.name ?? '워크스페이스'}의 프로젝트가 함께 사용하는 입력 양식을 구성합니다.</p></div></header>
    {(fields.isPending || spaces.isPending) && <p className="loading-state">필드 설정을 불러오는 중입니다…</p>}
    {(fields.isError || spaces.isError) && <div className="form-message" role="alert"><p>{fields.error?.message ?? spaces.error?.message}</p><Button variant="outline" onClick={() => {void fields.refetch(); void spaces.refetch()}}>다시 불러오기</Button></div>}
    {fields.data && workspace && <PolicyEditor initial={fields.data} editable={['OWNER', 'ADMIN'].includes(workspace.role)} />}
  </main>
}

function PolicyEditor({initial, editable}: {initial: TicketFieldPolicy; editable: boolean}) {
  const client = useQueryClient()
  const [original, setOriginal] = useState(() => clone(initial))
  const [draft, setDraft] = useState(() => clone(initial))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [latest, setLatest] = useState<TicketFieldPolicy | null>(null)
  const [previousDraft, setPreviousDraft] = useState<TicketFieldPolicy | null>(null)
  const [newestKey, setNewestKey] = useState('')

  function update(next: TicketFieldPolicy) {
    setDraft(next); setSuccess('')
    if (Object.keys(errors).length) setErrors(validateFieldPolicy(next, original))
  }
  function custom(index: number, patch: Partial<CustomFieldDefinition>) { update({...draft, customFields: draft.customFields.map((field, i) => i === index ? {...field, ...patch} : field)}) }
  function move(kind: 'standardFields' | 'customFields', index: number, direction: number) {
    if (kind === 'standardFields') {
      const field = draft.standardFields[index]
      const members = draft.standardFields.map((item, i) => ({item, i})).filter(({item}) => groupOf(item.key) === groupOf(field.key)).sort((a, b) => a.item.order - b.item.order)
      const position = members.findIndex(({i}) => i === index), target = position + direction
      if (target < 0 || target >= members.length) return
      ;[members[position], members[target]] = [members[target], members[position]]
      const orders = new Map(members.map(({item}, order) => [item.key, order]))
      update({...draft, standardFields: draft.standardFields.map(item => orders.has(item.key) ? {...item, order: orders.get(item.key)!} : item)})
      return
    }
    const list = [...draft[kind]], target = index + direction
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    update({...draft, [kind]: list.map((field, order) => ({...field, order}))})
  }
  function addCustom() {
    const key = newKey('cf')
    update({...draft, customFields: [...draft.customFields, {key, type: 'TEXT', label: '', description: '', active: true, required: false, order: draft.customFields.length, options: []}]})
    setNewestKey(key)
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!editable || busy || conflict) return
    setMessage(''); setSuccess('')
    const nextErrors = validateFieldPolicy(draft, original)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {focusFirstFormError(nextErrors); return}
    setBusy(true)
    try {
      const saved = await api<TicketFieldPolicy>(`/auth/workspaces/${draft.workspaceId}/ticket-fields`, {method: 'PUT', body: draft, schema: ticketFieldPolicySchema})
      setOriginal(clone(saved)); setDraft(clone(saved)); setSuccess('티켓 필드 설정을 저장했습니다.')
      client.setQueryData(ticketFieldsKey(draft.workspaceId), saved)
      await client.invalidateQueries({queryKey: ticketFieldsKey(draft.workspaceId)})
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '설정을 저장하지 못했습니다.')
      if (error instanceof APIError) {setErrors(error.fieldErrors ?? {}); focusFirstFormError(error.fieldErrors ?? {}); if (error.status === 409) setConflict(true)}
    } finally { setBusy(false) }
  }
  async function checkLatest() {
    setBusy(true)
    try { setLatest(await api<TicketFieldPolicy>(`/auth/workspaces/${draft.workspaceId}/ticket-fields`, {schema: ticketFieldPolicySchema})) }
    catch (error) {setMessage(error instanceof Error ? error.message : '최신 설정을 불러오지 못했습니다.')}
    finally {setBusy(false)}
  }
  const active = draft.customFields.filter(field => field.active)
  return <div className="field-settings-layout">
    <form noValidate onSubmit={save} className="field-settings-form" aria-label="워크스페이스 티켓 필드 설정">
      <p className="field-policy-note">{editable ? '설정은 이 워크스페이스의 모든 프로젝트에 적용됩니다. 기존 티켓의 값은 유지됩니다.' : '소유자·워크스페이스 관리자만 설정을 변경할 수 있습니다.'}</p>
      <FormErrorSummary errors={errors} message={message} />
      {conflict && <div className="field-conflict" role="status"><p>다른 관리자가 설정을 변경했습니다. 작성한 내용은 유지됩니다.</p><Button type="button" variant="outline" disabled={busy} onClick={() => void checkLatest()}>최신 설정 확인</Button>{latest && <><p>현재 서버 설정: revision {latest.revision}, 활성 추가 필드 {latest.customFields.filter(field => field.active).length}개</p><details><summary>최신 설정 내용</summary><PolicySnapshot policy={latest} /></details><Button type="button" variant="outline" onClick={() => {setPreviousDraft(clone(draft)); client.setQueryData(ticketFieldsKey(latest.workspaceId), clone(latest)); void client.invalidateQueries({queryKey: ticketFieldsKey(latest.workspaceId)}); setOriginal(clone(latest)); setDraft(clone(latest)); setConflict(false); setLatest(null); setMessage(''); setErrors({})}}>최신 설정에서 다시 편집</Button></>}</div>}
      {previousDraft && <details className="field-conflict"><summary>충돌 전 작성한 내용 확인</summary><PolicySnapshot policy={previousDraft} /></details>}
      {success && <p role="status" className="success-message">{success}</p>}
      <fieldset disabled={!editable || busy} className="field-settings-section">
        <legend>표준 필드</legend><p className="muted">이름과 입력 안내를 바꾸고 필요한 필드만 표시하세요. 제목·유형·상태·완료율은 유지합니다.</p>
        {draft.standardFields.map((field, index) => ({field, index})).sort((a, b) => groupOf(a.field.key) - groupOf(b.field.key) || a.field.order - b.field.order).map(({field, index}) => {
          const base = `standardFields.${index}`
          const peers = draft.standardFields.filter(item => groupOf(item.key) === groupOf(field.key)).sort((a, b) => a.order - b.order)
          const change = (patch: Partial<typeof field>) => update({...draft, standardFields: draft.standardFields.map((item, i) => i === index ? {...item, ...patch} : item)})
          return <details key={field.key} className="field-definition"><summary><span><strong>{field.label}</strong><small>{groups[groupOf(field.key)]?.title}</small></span><span className="field-badges">{core.has(field.key) ? '핵심' : !field.visible ? '숨김' : field.required ? '필수' : '선택'}</span></summary><div className="field-definition-body">
            <FormField name={`${base}.label`} label="표시 이름" required error={errors[`${base}.label`]}>{props => <Input {...props} value={field.label} maxLength={80} onChange={event => change({label: event.target.value})} />}</FormField>
            <FormField name={`${base}.description`} label="입력 안내" error={errors[`${base}.description`]}>{props => <Textarea {...props} value={field.description} maxLength={500} onChange={event => change({description: event.target.value})} />}</FormField>
            <div className="field-checkboxes"><label><input type="checkbox" checked={field.visible} disabled={core.has(field.key)} onChange={event => change({visible: event.target.checked, required: event.target.checked ? field.required : false})} />표시</label><label><input type="checkbox" checked={field.required} disabled={core.has(field.key) || field.key === 'parentId' || !field.visible} onChange={event => change({required: event.target.checked})} />필수</label></div>
            {field.key === 'parentId' && <p className="muted">하위 작업은 설정과 관계없이 부모 티켓을 입력해야 합니다.</p>}
            <OrderButtons label={field.label} index={peers.findIndex(item => item.key === field.key)} length={peers.length} move={direction => move('standardFields', index, direction)} />
          </div></details>
        })}
      </fieldset>
      <fieldset disabled={!editable || busy} className="field-settings-section"><legend>커스텀 필드</legend><p className="muted">팀이 필요한 정보를 추가하세요. 저장한 필드의 타입은 고정되며, 비활성화해도 기존 값은 보존됩니다.</p>
        {!draft.customFields.length && <p className="empty-message">추가 필드가 없습니다. 고객명, 예상 시간, 검토일 등을 추가할 수 있습니다.</p>}
        {draft.customFields.map((field, index) => {
          const base = `customFields.${index}`, saved = original.customFields.some(item => item.key === field.key)
          return <details key={field.key} open={field.key === newestKey || undefined} className="field-definition"><summary><span><strong>{field.label || '새 커스텀 필드'}</strong><small>{types[field.type]}</small></span><span className="field-badges">{!field.active ? '비활성' : field.required ? '필수' : '선택'}</span></summary><div className="field-definition-body">
            <FormField name={`${base}.label`} label="필드 이름" required error={errors[`${base}.label`]}>{props => <Input {...props} value={field.label} maxLength={80} onChange={event => custom(index, {label: event.target.value})} />}</FormField>
            <FormField name={`${base}.type`} label="필드 타입" description={saved ? '저장한 타입은 변경할 수 없습니다.' : '저장 후에는 타입을 변경할 수 없습니다.'} error={errors[`${base}.type`]}>{props => <select {...props} disabled={saved} value={field.type} onChange={event => custom(index, {type: event.target.value as CustomFieldDefinition['type'], options: event.target.value === 'SELECT' ? field.options : []})}>{Object.entries(types).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>}</FormField>
            <FormField name={`${base}.description`} label="입력 안내" error={errors[`${base}.description`]}>{props => <Textarea {...props} value={field.description} maxLength={500} onChange={event => custom(index, {description: event.target.value})} />}</FormField>
            <div className="field-checkboxes"><label><input type="checkbox" checked={field.active} onChange={event => custom(index, {active: event.target.checked})} />활성</label><label><input type="checkbox" checked={field.required} onChange={event => custom(index, {required: event.target.checked})} />필수</label></div>
            {field.type === 'SELECT' && <fieldset className="field-options"><legend>선택지</legend>{field.options.map((option, optionIndex) => <div key={option.value} className="field-option"><FormField name={`${base}.options.${optionIndex}.label`} label={`선택지 ${optionIndex + 1}`} required error={errors[`${base}.options.${optionIndex}.label`]}>{props => <Input {...props} value={option.label} maxLength={80} onChange={event => custom(index, {options: field.options.map((item, i) => i === optionIndex ? {...item, label: event.target.value} : item)})} />}</FormField><label><input type="checkbox" checked={option.active} onChange={event => custom(index, {options: field.options.map((item, i) => i === optionIndex ? {...item, active: event.target.checked} : item)})} />활성</label></div>)}{errors[`${base}.options`] && <p role="alert" className="form-message">{errors[`${base}.options`]}</p>}<Button type="button" variant="outline" disabled={field.options.length >= 100} onClick={() => custom(index, {options: [...field.options, {value: newKey('opt'), label: '', active: true}]})}>선택지 추가</Button></fieldset>}
            <OrderButtons label={field.label || '새 필드'} index={index} length={draft.customFields.length} move={direction => move('customFields', index, direction)} />
          </div></details>
        })}
        {errors.customFields && <p role="alert" className="form-message">{errors.customFields}</p>}
        <Button type="button" variant="outline" onClick={addCustom} disabled={active.length >= 30 || draft.customFields.length >= 100}>커스텀 필드 추가</Button><p className="muted">활성 {active.length}/30개</p>
      </fieldset>
      {editable && <div className="field-settings-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => {setDraft(clone(original)); setErrors({}); setMessage(''); setSuccess('')}}>변경 취소</Button><Button type="submit" disabled={busy || conflict}>{busy ? '저장 중…' : '설정 저장'}</Button></div>}
    </form>
    <aside tabIndex={0} className="field-preview" aria-label="티켓 입력 구성 미리보기"><h2>입력 구성 미리보기</h2><p className="muted">표준 필드는 업무 그룹 안에서 정렬됩니다. 하위 작업은 부모 티켓 입력이 추가됩니다.</p>{groups.map(group => <section key={group.title}><h3>{group.title}</h3>{draft.standardFields.filter(field => field.visible && group.fields.includes(field.key)).sort((a, b) => a.order - b.order).map(field => <div key={field.key} className="preview-field"><strong>{field.label}<small>{field.required ? '필수' : '선택'}</small></strong>{field.description && <p>{field.description}</p>}<span>입력할 내용</span></div>)}</section>)}{!!active.length && <h3>추가 정보</h3>}{active.map(field => <div key={field.key} className="preview-field"><strong>{field.label || '새 필드'}<small>{field.required ? '필수' : '선택'}</small></strong>{field.description && <p>{field.description}</p>}<span>{types[field.type]}</span></div>)}</aside>
  </div>
}

function OrderButtons({label, index, length, move}: {label: string; index: number; length: number; move: (direction: number) => void}) {
  return <div className="field-order"><span className="muted">표시 순서 {index + 1}</span><Button type="button" variant="outline" size="sm" aria-label={`${label} 위로 이동`} disabled={index === 0} onClick={() => move(-1)}>↑</Button><Button type="button" variant="outline" size="sm" aria-label={`${label} 아래로 이동`} disabled={index === length - 1} onClick={() => move(1)}>↓</Button></div>
}

function PolicySnapshot({policy}: {policy: TicketFieldPolicy}) {
  return <ul className="field-snapshot">{policy.standardFields.map(field => <li key={field.key}><strong>{field.label}</strong> · {!field.visible ? "숨김" : field.required ? "필수" : "선택"}{field.description && <p>{field.description}</p>}</li>)}{policy.customFields.map(field => <li key={field.key}><strong>{field.label || "이름 없는 필드"}</strong> · {types[field.type]} · {!field.active ? "비활성" : field.required ? "필수" : "선택"}{field.description && <p>{field.description}</p>}{field.type === "SELECT" && <p>{field.options.map(option => `${option.label}${option.active ? "" : " (비활성)"}`).join(", ")}</p>}</li>)}</ul>
}
