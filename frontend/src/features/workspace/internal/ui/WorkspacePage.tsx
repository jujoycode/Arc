import { useState } from 'react'
import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, tokenStore } from '@/shared/api/client'
import type { Project } from '@/features/project'
import type { User } from '@/features/auth'
import type { Workspace } from '../../api/types'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'

export function WorkspacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [workspaceName, setWorkspaceName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [parentProjectId, setParentProjectId] = useState('')
  const [selectedWorkspace, setSelectedWorkspace] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me'), enabled: !!tokenStore.get() })
  const spaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api<Workspace[]>('/auth/workspaces'), enabled: !!tokenStore.get() })
  const activeWorkspace = selectedWorkspace ?? spaces.data?.[0]?.id
  const projects = useQuery({ queryKey: ['projects', activeWorkspace], queryFn: () => api<Project[]>(`/workspaces/${activeWorkspace}/projects`), enabled: !!activeWorkspace })
  if (!tokenStore.get()) return <Navigate to="/login" />
  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault(); setMessage('')
    try { const result = await api<Workspace>('/auth/workspaces', { body: { name: workspaceName } }); setWorkspaceName(''); setSelectedWorkspace(result.id); await queryClient.invalidateQueries({ queryKey: ['workspaces'] }) }
    catch (error) { setMessage((error as Error).message) }
  }
  async function createProject(event: React.FormEvent) {
    event.preventDefault(); setMessage('')
    try { const result = await api<Project>(`/workspaces/${activeWorkspace}/projects`, { body: { name: projectName, key: projectKey.toUpperCase(), parentProjectId: parentProjectId ? Number(parentProjectId) : null } }); await queryClient.invalidateQueries({ queryKey: ['projects', activeWorkspace] }); await queryClient.invalidateQueries({ queryKey: ['gantt'] }); await navigate({ to: '/projects/$projectId/gantt', params: { projectId: String(result.id) } }) }
    catch (error) { setMessage((error as Error).message) }
  }
  async function logout() { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); tokenStore.clear(); queryClient.clear(); await navigate({ to: '/login' }) }
  return <main id="main-content" className="workspace-page"><header className="workspace-header"><div className="brand"><span className="brand-mark">A</span> Arc</div><div className="header-actions"><span>{me.data?.displayName}</span><Button variant="outline" onClick={logout}>로그아웃</Button></div></header><div className="workspace-content"><p className="eyebrow">YOUR WORKSPACE</p><h1>함께 일할 공간</h1><p className="muted">프로젝트를 선택해 간트, 칸반, 스프린트를 관리하세요.</p>{message && <p className="form-message" role="alert">{message}</p>}<div className="workspace-layout"><section><div className="section-heading"><h2>워크스페이스</h2></div><div className="space-list">{spaces.data?.map(space => <button key={space.id} className={`space-item ${activeWorkspace === space.id ? 'active' : ''}`} onClick={() => { setSelectedWorkspace(space.id); setParentProjectId('') }}>{space.name}<small>{space.role}</small></button>)}</div><Card className="mt-5"><CardHeader><CardTitle>새 워크스페이스</CardTitle></CardHeader><CardContent><form onSubmit={createWorkspace} className="form-stack"><Input placeholder="워크스페이스 이름" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} required /><Button type="submit">만들기</Button></form></CardContent></Card></section><section><div className="section-heading"><h2>프로젝트</h2><span>{projects.data?.length ?? 0}개</span></div>{projects.isError && <p role="alert" className="form-message">{projects.error.message}</p>}{spaces.isError && <p role="alert" className="form-message">{spaces.error.message}</p>}{spaces.isPending && <p className="loading-state">워크스페이스를 불러오는 중입니다…</p>}{!spaces.isPending && spaces.data?.length === 0 && <p className="empty-message">첫 워크스페이스를 만들고 팀원을 초대하세요.</p>}<div className="project-cards">{projects.data?.map(project => <Link key={project.id} to="/projects/$projectId/gantt" params={{ projectId: String(project.id) }} className="project-card"><span className="project-key">{project.key}</span><strong>{project.name}</strong><span className="muted">{project.archivedAt ? '보관됨 · ' : ''}간트 · 칸반 · 스프린트 →</span></Link>)}</div>{activeWorkspace && spaces.data?.find(s => s.id === activeWorkspace)?.role !== 'MEMBER' && <Card className="mt-5"><CardHeader><CardTitle>새 프로젝트</CardTitle></CardHeader><CardContent><form onSubmit={createProject} className="form-stack"><Input placeholder="프로젝트 이름" value={projectName} onChange={e => setProjectName(e.target.value)} required /><Input placeholder="프로젝트 키 (예: ARC)" value={projectKey} onChange={e => setProjectKey(e.target.value.toUpperCase())} required minLength={2} maxLength={10} /><label>상위 프로젝트<select value={parentProjectId} onChange={e => setParentProjectId(e.target.value)}><option value="">없음</option>{projects.data?.filter(project => !project.archivedAt).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><Button type="submit">프로젝트 만들기</Button></form></CardContent></Card>}</section></div></div></main>
}
