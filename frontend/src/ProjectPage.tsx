import { Link, Navigate, Outlet, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarRange, Columns3, List, ListTodo, Settings2, Timer, ArrowLeft } from 'lucide-react'
import { api, tokenStore } from './api'
import type { Project } from './api'
import { Button } from '@/components/ui/button'
import { GanttScreen, BoardScreen, IssuesScreen, BacklogScreen, SprintsScreen, SettingsScreen } from './ProjectViews'
import { IssueDetailScreen } from './IssueDetailScreen'

const nav = [
  { path: 'gantt', label: '간트', icon: CalendarRange },
  { path: 'board', label: '칸반', icon: Columns3 },
  { path: 'backlog', label: '백로그', icon: ListTodo },
  { path: 'sprints', label: '스프린트', icon: Timer },
  { path: 'issues', label: '이슈 목록', icon: List },
  { path: 'settings', label: '설정', icon: Settings2 },
] as const

export function ProjectLayout() {
  const { projectId } = useParams({ from: '/projects/$projectId' })
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => api<Project>(`/projects/${projectId}`), enabled: !!tokenStore.get() })
  if (!tokenStore.get()) return <Navigate to="/login" />
  if (project.isError) return <main className="error-page">{(project.error as Error).message}<div><Button asChild variant="outline"><Link to="/">워크스페이스로 이동</Link></Button></div></main>
  return <div className="product-shell"><aside className="product-sidebar"><Link to="/" className="brand"><span className="brand-mark">A</span> Arc</Link><Link to="/" className="back-link"><ArrowLeft size={15} /> 워크스페이스</Link><div className="project-identity"><span>{project.data?.key ?? '...'}</span><strong>{project.data?.name ?? '불러오는 중'}</strong></div><nav aria-label="프로젝트 메뉴">{nav.map(item => <Link key={item.path} to={`/projects/$projectId/${item.path}`} params={{ projectId }} activeProps={{ className: 'active' }} className="side-link"><item.icon size={17} /> {item.label}</Link>)}</nav><div className="sidebar-footer">Arc 팀용 MVP</div></aside><div className="product-content"><header className="product-topbar"><span>{project.data?.name}</span><span className="topbar-caption">프로젝트 작업 공간</span></header><main id="main-content"><Outlet /></main></div></div>
}

export function ProjectView({ view }: { view: 'gantt' | 'board' | 'backlog' | 'sprints' | 'issues' | 'detail' | 'settings' }) {
  const { projectId } = useParams({ from: '/projects/$projectId' })
  const id = Number(projectId)
  if (view === 'gantt') return <GanttScreen projectId={id} />
  if (view === 'board') return <BoardScreen projectId={id} />
  if (view === 'backlog') return <BacklogScreen projectId={id} />
  if (view === 'sprints') return <SprintsScreen projectId={id} />
  if (view === 'issues') return <IssuesScreen projectId={id} />
  if (view === 'detail') return <IssueDetailScreen projectId={id} />
  return <SettingsScreen projectId={id} />
}
