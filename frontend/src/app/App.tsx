import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { AuthPage, VerifyPage, InvitePage } from '@/features/auth'
import { WorkspacePage } from '@/features/workspace'
import { ProjectLayout, ProjectView } from './layouts/ProjectLayout'
import '@/shared/styles/product.css'

const rootRoute = createRootRoute({ component: () => <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><Outlet /></> })
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: WorkspacePage })
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: () => <AuthPage mode="login" /> })
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/register', component: () => <AuthPage mode="register" /> })
const verifyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/verify', component: VerifyPage })
const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/invite', component: InvitePage })
const projectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/$projectId', component: ProjectLayout })
const projectIndex = createRoute({ getParentRoute: () => projectRoute, path: '/', component: () => <ProjectView view="gantt" /> })
const ganttRoute = createRoute({ getParentRoute: () => projectRoute, path: '/gantt', component: () => <ProjectView view="gantt" /> })
const boardRoute = createRoute({ getParentRoute: () => projectRoute, path: '/board', component: () => <ProjectView view="board" /> })
const backlogRoute = createRoute({ getParentRoute: () => projectRoute, path: '/backlog', component: () => <ProjectView view="backlog" /> })
const sprintsRoute = createRoute({ getParentRoute: () => projectRoute, path: '/sprints', component: () => <ProjectView view="sprints" /> })
const issuesRoute = createRoute({ getParentRoute: () => projectRoute, path: '/issues', component: () => <ProjectView view="issues" /> })
const issueRoute = createRoute({ getParentRoute: () => projectRoute, path: '/issues/$issueId', component: () => <ProjectView view="detail" /> })
const settingsRoute = createRoute({ getParentRoute: () => projectRoute, path: '/settings', component: () => <ProjectView view="settings" /> })

const routeTree = rootRoute.addChildren([
  homeRoute, loginRoute, registerRoute, verifyRoute, inviteRoute,
  projectRoute.addChildren([projectIndex, ganttRoute, boardRoute, backlogRoute, sprintsRoute, issuesRoute, issueRoute, settingsRoute]),
])
const router = createRouter({ routeTree })
declare module '@tanstack/react-router' { interface Register { router: typeof router } }

function App() { return <RouterProvider router={router} /> }
export default App
