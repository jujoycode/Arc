import { useQuery } from '@tanstack/react-query'
import { ExternalLink, GitBranch } from 'lucide-react'
import { api } from '@/shared/api/client'
import { Badge } from '@/shared/ui/badge'
import { localDateTime } from '@/shared/lib/dateTime'
import type { DevelopmentLink } from '../../api/types'

const stateLabels: Record<string, string> = { COMMITTED: '커밋', OPEN: '열림', CLOSED: '닫힘', MERGED: '병합됨' }

export function DevelopmentLinks({ projectId, issueId }: { projectId: number; issueId: number }) {
  const links = useQuery({ queryKey: ['development-links', projectId, issueId], queryFn: () => api<DevelopmentLink[]>(`/projects/${projectId}/issues/${issueId}/development-links`), refetchInterval: 15000 })
  return <section className="development-section" aria-label="개발 활동"><h2><GitBranch size={18} aria-hidden="true" /> 개발 활동</h2>
    {links.isPending && <p className="muted" role="status">개발 활동을 불러오는 중입니다…</p>}
    {links.isError && <p className="form-message" role="alert">{links.error.message}</p>}
    {!links.isPending && !links.isError && !links.data?.length && <p className="muted">이 이슈 키를 포함한 커밋과 PR·MR이 연결되면 여기에 표시됩니다.</p>}
    <ul className="development-list">{links.data?.map(link => <li key={link.id}><div className="development-meta"><span>{link.provider === 'GITHUB' ? 'GitHub' : 'GitLab'} · {link.kind === 'COMMIT' ? '커밋' : link.provider === 'GITHUB' ? 'PR' : 'MR'}</span><Badge variant="secondary">{stateLabels[link.state] ?? link.state}</Badge></div><a href={link.url} target="_blank" rel="noopener noreferrer">{link.title || '개발 기록'} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only">새 창에서 열기</span></a><small>{link.repository} · {localDateTime(link.updatedAt)}{link.connectionStatus !== 'ACTIVE' ? ' · 비활성 연결의 기록' : ''}</small></li>)}</ul>
  </section>
}
