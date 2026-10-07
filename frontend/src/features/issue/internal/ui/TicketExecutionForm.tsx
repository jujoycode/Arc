import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useProjectAccess } from '@/features/project'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { issuePath, refreshProjectIssues } from '../../api/issueActions'
import type { Ticket } from '../../api/types'
import { statusLabels } from '../model/issueLabels'

export function TicketExecutionForm({ projectId, initial, onSaved, onCancel }: { projectId: number; initial: Ticket; onSaved: () => void; onCancel: () => void }) {
  const client = useQueryClient(), access = useProjectAccess(projectId)
  const [status, setStatus] = useState(initial.status)
  const [progress, setProgress] = useState(String(initial.progress))
  const [baseVersion] = useState(initial.version)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!access.canExecute(initial) || busy) return
    setBusy(true); setError('')
    try {
      await api(issuePath(projectId, initial.id) + '/execution', { method: 'PATCH', body: { status, progress: Number(progress), version: baseVersion } })
      await refreshProjectIssues(client, projectId)
      onSaved()
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <form className="form-stack" onSubmit={submit} aria-label="담당 티켓 진행 상황 수정">
    <p className="view-note">담당 업무의 상태와 완료율을 기록하세요. 계획·계층·배정 변경은 관리자에게 요청하세요. 하위 작업이 있는 경우 WBS 완료율은 하위 작업에서 집계됩니다.</p>
    <label>상태<select aria-label="상태" value={status} onChange={event => setStatus(event.target.value as Ticket['status'])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>완료율<Input type="number" min={0} max={100} step={1} required value={progress} onChange={event => setProgress(event.target.value)} /></label>
    {error && <p className="form-message" role="alert">{error}</p>}
    <div className="form-actions"><Button type="submit" disabled={busy || !access.canExecute(initial)}>{busy ? '저장 중…' : '진행 상황 저장'}</Button><Button type="button" variant="outline" onClick={onCancel}>취소</Button></div>
  </form>
}
