import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useProjectAccess } from '@/features/project'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Badge } from '@/shared/ui/badge'
import type { ConnectionList, Delivery, RepositoryConnection } from '../../api/types'

const statuses = { ACTIVE: '연결됨', DISABLED: '권한 확인 필요', DISCONNECTED: '해제됨' }
const deliveryStates = { PENDING: '대기', FAILED: '실패', COMPLETED: '처리됨' }

export function IntegrationSettings({ projectId }: { projectId: number }) {
  const client = useQueryClient()
  const { manager, archived } = useProjectAccess(projectId)
  const connections = useQuery({ queryKey: ['repository-connections', projectId], queryFn: () => api<ConnectionList>(`/projects/${projectId}/repository-connections`) })
  const [provider, setProvider] = useState<RepositoryConnection['provider']>('GITHUB')
  const [repository, setRepository] = useState('')
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [logId, setLogId] = useState<number | null>(null)
  const deliveries = useQuery({ queryKey: ['webhook-deliveries', projectId, logId], queryFn: () => api<Delivery[]>(`/projects/${projectId}/repository-connections/${logId}/deliveries`), enabled: manager && logId !== null, refetchInterval: 15000 })
  async function run(action: () => Promise<unknown>, success: string) {
    if (busy || archived) return
    setBusy(true); setError(''); setMessage('')
    try { await action(); setMessage(success) }
    catch (cause) { setError((cause as Error).message) }
    finally { await client.invalidateQueries({ queryKey: ['repository-connections', projectId] }); await client.invalidateQueries({ queryKey: ['webhook-deliveries', projectId] }); setBusy(false) }
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault()
    await run(async () => { await api(`/projects/${projectId}/repository-connections`, { body: { provider, repository, token, webhookSecret: secret } }); setToken('') }, '저장소를 연결했습니다. 아래 URL과 입력한 검증키로 제공자의 웹훅을 설정하세요.')
  }
  async function copySecret() {
    try { await navigator.clipboard.writeText(secret); setMessage('검증키를 복사했습니다. 제공자의 웹훅 설정에 사용하세요.') }
    catch { setError('검증키 보기를 켜고 직접 복사하세요.') }
  }
  return <section className="detail-panel integration-settings" aria-label="코드 저장소 연동"><h2>코드 저장소 연동</h2><p className="muted">GitHub·GitLab 커밋과 PR·MR의 이슈 키를 개발 활동으로 연결합니다.</p>
    {connections.isPending && <p role="status" className="muted">저장소 연결을 불러오는 중입니다…</p>}
    {connections.isError && <p role="alert" className="form-message">{connections.error.message}</p>}
    {error && <p role="alert" className="form-message">{error}</p>}{message && <p role="status" className="success-message">{message}</p>}
    {connections.data && !connections.data.enabled && <p className="muted">연동을 활성화하려면 서버 관리자의 설정이 필요합니다.</p>}
    {connections.data?.enabled && manager && !archived && <form className="integration-form form-stack" onSubmit={connect}>
      <label>제공자<select value={provider} onChange={event => setProvider(event.target.value as RepositoryConnection['provider'])} disabled={busy}><option value="GITHUB">GitHub</option><option value="GITLAB">GitLab</option></select></label>
      <label>저장소 경로<Input placeholder="owner/repository" value={repository} onChange={event => setRepository(event.target.value)} maxLength={240} required disabled={busy} /></label>
      <label>저장소 접근 토큰<Input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} minLength={8} maxLength={4096} required disabled={busy} /></label>
      <label>웹훅 검증키<Input type={showSecret ? 'text' : 'password'} autoComplete="off" value={secret} onChange={event => setSecret(event.target.value)} minLength={32} maxLength={256} required disabled={busy} /></label>
      <div className="setting-actions"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setSecret(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')); setMessage('검증키를 만들었습니다. 웹훅 설정에 같은 키를 사용하세요.') }}>검증키 만들기</Button><Button type="button" size="sm" variant="ghost" disabled={!secret} onClick={copySecret}>검증키 복사</Button><Button type="button" size="sm" variant="ghost" disabled={!secret} onClick={() => setSecret('')}>검증키 지우기</Button><label className="inline-checkbox"><input type="checkbox" checked={showSecret} onChange={event => setShowSecret(event.target.checked)} /> 검증키 보기</label></div>
      <p className="muted">토큰은 저장 후 비우며 검증키는 이 화면을 닫으면 사라집니다. 웹훅 설정을 마친 후 지우세요.</p><Button type="submit" disabled={busy}>저장소 연결 저장</Button>
    </form>}
    <ul className="repository-list">{connections.data?.items.map(connection => <li key={connection.id}><div className="repository-heading"><strong>{connection.provider === 'GITHUB' ? 'GitHub' : 'GitLab'} · {connection.repository}</strong><Badge variant="secondary">{statuses[connection.status]}</Badge></div>
      {manager && connection.status !== 'DISCONNECTED' && <><p className="muted">웹훅 URL · {connection.provider === 'GITHUB' ? 'Push / Pull request' : 'Push / Merge request'} 이벤트를 선택하세요.</p><code className="webhook-address">{connection.webhookUrl}</code></>}
      {manager && <div className="setting-actions"><Button size="sm" variant="outline" disabled={busy || archived || connection.status === 'DISCONNECTED'} onClick={() => run(async () => { const result = await api<{ status: string }>(`/projects/${projectId}/repository-connections/${connection.id}/check`, { method: 'POST' }); if (result.status === 'DISABLED') throw new Error('접근 권한을 확인하지 못해 연결을 비활성화했습니다. 토큰을 갱신하고 다시 연결하세요.') }, '저장소 접근 권한을 확인했습니다.')}>권한 확인</Button><Button size="sm" variant="ghost" disabled={busy || archived || connection.status === 'DISCONNECTED'} onClick={() => { if (window.confirm('저장소 연결을 해제할까요? 기존 개발 기록은 유지됩니다.')) run(() => api(`/projects/${projectId}/repository-connections/${connection.id}`, { method: 'DELETE' }), '연결을 해제했습니다.') }}>연결 해제</Button><Button size="sm" variant="ghost" onClick={() => setLogId(logId === connection.id ? null : connection.id)} aria-expanded={logId === connection.id}>전달 기록 {logId === connection.id ? '닫기' : '보기'}</Button></div>}
      {manager && logId === connection.id && <div className="delivery-records">{deliveries.isError && <p role="alert" className="form-message">{deliveries.error.message}</p>}{deliveries.isPending && <p role="status">전달 기록을 불러오는 중입니다…</p>}{deliveries.data?.map(delivery => <div key={delivery.id}><span>{delivery.event} · {deliveryStates[delivery.status]} · {delivery.attempts}회 시도<small>{delivery.deliveryId}</small></span>{delivery.status === 'FAILED' && <Button size="sm" variant="outline" disabled={busy || archived || connection.status !== 'ACTIVE'} onClick={() => run(() => api(`/projects/${projectId}/repository-connections/${connection.id}/deliveries/${delivery.id}/retry`, { method: 'POST' }), '전달을 다시 처리하도록 요청했습니다.')}>전달 다시 시도</Button>}</div>)}{!deliveries.isPending && !deliveries.isError && !deliveries.data?.length && <p className="muted">전달 기록이 없습니다.</p>}</div>}
    </li>)}</ul>
  </section>
}
