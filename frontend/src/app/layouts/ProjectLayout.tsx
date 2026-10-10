import { ArcatBrand } from '@/shared/ui/Mascot'
import { Link, Navigate, Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Columns3, List, ListTodo, Settings2, Timer, ArrowLeft, Network, GanttChartSquare } from 'lucide-react'
import { api, tokenStore } from '@/shared/api/client'
import type { Project } from '@/features/project'
import type { Workspace } from '@/features/workspace'
import type { User } from '@/features/auth'
import { Button } from '@/shared/ui/button'
import { GanttScreen } from '@/features/gantt'
import { BoardScreen } from '@/features/kanban'
import { IssuesScreen } from '@/features/issue'
import { BacklogScreen, SprintsScreen } from '@/features/sprint'
import { SettingsScreen } from '@/features/settings'
import { IssueDetailScreen } from '@/features/issue'
import { ProjectFiltersProvider } from '@/features/issue'
import { WbsScreen, TimelineScreen } from '@/features/planning'

const nav = [
  { path: 'gantt', label: '간트', icon: CalendarRange },
  { path: 'wbs', label: 'WBS', icon: Network },
  { path: 'timeline', label: '타임라인', icon: GanttChartSquare },
  { path: 'board', label: '칸반', icon: Columns3 },
  { path: 'backlog', label: '백로그', icon: ListTodo },
  { path: 'sprints', label: '스프린트', icon: Timer },
  { path: 'issues', label: '이슈 목록', icon: List },
  { path: 'settings', label: '설정', icon: Settings2 },
] as const

export function ProjectLayout() {
  const { projectId } = useParams({ from: '/projects/$projectId' })
  const navigate = useNavigate()
  const client = useQueryClient()
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => api<Project>(`/projects/${projectId}`), enabled: !!tokenStore.get() })
  const spaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api<Workspace[]>('/auth/workspaces'), enabled: !!tokenStore.get() })
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me'), enabled: !!tokenStore.get() })
  const projects = useQuery({ queryKey: ['projects', project.data?.workspaceId], queryFn: () => api<Project[]>(`/workspaces/${project.data!.workspaceId}/projects`), enabled: !!project.data })
  const workspace = spaces.data?.find(space => space.id === project.data?.workspaceId)
  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    tokenStore.clear(); client.clear(); await navigate({ to: '/login' })
  }
  if (!tokenStore.get()) return <Navigate to="/login" />
  if (project.isError) return <main className="error-page">{(project.error as Error).message}<div><Button asChild variant="outline"><Link to="/">워크스페이스로 이동</Link></Button></div></main>
  return <div className="product-shell">
    <aside className="product-sidebar">
      <Link to="/" className="brand"><ArcatBrand /></Link>
      <Link to="/" className="back-link"><ArrowLeft size={16} /> 모든 워크스페이스</Link>
      <div className="project-identity"><span>{project.data?.key ?? '…'}</span><strong>{project.data?.name ?? '불러오는 중'}</strong><small>{workspace?.name}</small></div>
      <nav aria-label="프로젝트 메뉴">{nav.map(item => <Link key={item.path} to={`/projects/$projectId/${item.path}`} params={{ projectId }} activeProps={{ className: 'active', 'aria-current': 'page' }} className="side-link"><item.icon size={18} aria-hidden="true" /><span>{item.label}</span></Link>)}</nav>
      <div className="sidebar-footer">일정과 실행을 한곳에서</div>
    </aside>
    <div className="product-content">
      <header className="product-topbar">
        <div className="project-location"><Link to="/" className="workspace-crumb">{workspace?.name ?? '워크스페이스'}</Link><span className="crumb-divider" aria-hidden="true">/</span><label className="project-switch"><span className="sr-only">프로젝트 선택</span><select value={projectId} disabled={!projects.data} onChange={event => navigate({ to: '/projects/$projectId/gantt', params: { projectId: event.target.value } })}>{(projects.data ?? (project.data ? [project.data] : [])).map(item => <option key={item.id} value={item.id}>{item.name}{item.archivedAt ? ' · 보관됨' : ''}</option>)}</select></label></div>
        <div className="account-actions"><span>{me.data?.displayName}</span><Button variant="ghost" onClick={logout}>로그아웃</Button></div>
      </header>
      <main id="main-content" tabIndex={-1}><ProjectFiltersProvider key={projectId}>{project.data?.archivedAt && <p className="archive-notice" role="status">보관된 프로젝트입니다. 변경하려면 설정에서 복원하세요.</p>}<Outlet /></ProjectFiltersProvider></main>
    </div>
  </div>
}

export function ProjectView({ view }: { view: 'gantt' | 'wbs' | 'timeline' | 'board' | 'backlog' | 'sprints' | 'issues' | 'detail' | 'settings' }) {
  const { projectId } = useParams({ from: '/projects/$projectId' })
  const id = Number(projectId)
  if (view === 'gantt') return <GanttScreen projectId={id} />
  if (view === 'wbs') return <WbsScreen key={id} projectId={id} />
  if (view === 'timeline') return <TimelineScreen key={id} projectId={id} />
  if (view === 'board') return <BoardScreen projectId={id} />
  if (view === 'backlog') return <BacklogScreen projectId={id} />
  if (view === 'sprints') return <SprintsScreen projectId={id} />
  if (view === 'issues') return <IssuesScreen projectId={id} />
  if (view === 'detail') return <IssueDetailScreen projectId={id} />
  return <SettingsScreen key={id} projectId={id} />
}
