import { useState } from 'react'
import * as v from 'valibot'
import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, APIError, tokenStore } from '@/shared/api/client'
import type { Project } from '@/features/project'
import type { User } from '@/features/auth'
import type { Workspace } from '../../api/types'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { FormField, FormErrorSummary, focusFirstFormError } from '@/shared/ui/form'
import { ArcatBrand, Mascot } from '@/shared/ui/Mascot'
import './arcat-workspace.css'

const nameSchema = v.pipe(v.string(), v.trim(), v.minLength(1, '이름을 입력해 주세요.'), v.maxLength(120, '이름은 120자 이하로 입력해 주세요.'))
const idSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1))
const workspaceFormSchema = v.object({ name: nameSchema })
const projectFormSchema = v.object({
  name: nameSchema,
  key: v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z][A-Z0-9]{1,9}$/, '프로젝트 키는 영문자로 시작하는 2~10자의 영문 대문자와 숫자로 입력하세요.')),
  parentProjectId: v.union([v.pipe(v.literal(''), v.transform(() => null)), v.pipe(v.string(), v.check(value => /^[1-9]\d*$/.test(value), '올바른 상위 프로젝트를 선택하세요.'), v.transform(Number), v.safeInteger('올바른 상위 프로젝트를 선택하세요.'))]),
})
const createdWorkspaceSchema = v.object({ id: idSchema, name: v.string(), role: v.picklist(['OWNER', 'ADMIN', 'MEMBER']) })
const createdProjectSchema = v.object({ id: idSchema })
const prefixedErrors = (prefix: string, errors: Record<string, string>) => Object.fromEntries(Object.entries(errors).map(([name, message]) => [`${prefix}-${name}`, message]))
function inputErrors(issues: readonly v.BaseIssue<unknown>[]) {
  const errors: Record<string, string> = {}
  for (const issue of issues) { const name = issue.path?.[0]?.key; if (typeof name === 'string' && !errors[name]) errors[name] = issue.message }
  return errors
}

export function WorkspacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [workspaceName, setWorkspaceName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [parentProjectId, setParentProjectId] = useState('')
  const [selectedWorkspace, setSelectedWorkspace] = useState<number | null>(null)
  const [workspaceError, setWorkspaceError] = useState('')
  const [workspaceErrors, setWorkspaceErrors] = useState<Record<string, string>>({})
  const [projectError, setProjectError] = useState('')
  const [projectErrors, setProjectErrors] = useState<Record<string, string>>({})
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [createdWorkspace, setCreatedWorkspace] = useState('')
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me'), enabled: !!tokenStore.get() })
  const spaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api<Workspace[]>('/auth/workspaces'), enabled: !!tokenStore.get() })
  const activeWorkspace = selectedWorkspace ?? spaces.data?.[0]?.id
  const activeSpace = spaces.data?.find(space => space.id === activeWorkspace)
  const workspaceManager = activeSpace?.role === 'OWNER' || activeSpace?.role === 'ADMIN'
  const projects = useQuery({ queryKey: ['projects', activeWorkspace], queryFn: () => api<Project[]>(`/workspaces/${activeWorkspace}/projects`), enabled: !!activeWorkspace })
  if (!tokenStore.get()) return <Navigate to="/login" />

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault()
    if (creatingWorkspace) return
    setWorkspaceError('')
    const result = v.safeParse(workspaceFormSchema, { name: workspaceName })
    if (!result.success) { const fields = inputErrors(result.issues); setWorkspaceErrors(fields); focusFirstFormError(prefixedErrors('workspace', fields)); return }
    setWorkspaceErrors({})
    setCreatingWorkspace(true)
    try {
      const response = await api('/auth/workspaces', { body: result.output, schema: createdWorkspaceSchema })
      setWorkspaceName('')
      setSelectedWorkspace(response.id)
      setParentProjectId('')
      setCreatedWorkspace(response.name)
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    } catch (cause) {
      const fields: Record<string, string> = cause instanceof APIError && cause.fieldErrors.name ? { name: cause.fieldErrors.name } : {}
      setWorkspaceErrors(fields)
      setWorkspaceError(cause instanceof Error ? cause.message : '워크스페이스를 만들지 못했습니다. 다시 시도해 주세요.')
      focusFirstFormError(prefixedErrors('workspace', fields))
    } finally { setCreatingWorkspace(false) }
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault()
    if (creatingProject || !activeWorkspace || !workspaceManager) return
    setProjectError('')
    const result = v.safeParse(projectFormSchema, { name: projectName, key: projectKey, parentProjectId })
    const fields = result.success ? {} : inputErrors(result.issues)
    if (result.success && result.output.parentProjectId !== null && !projects.data?.some(project => project.id === result.output.parentProjectId && !project.archivedAt)) fields.parentProjectId = '현재 워크스페이스의 사용 중인 상위 프로젝트를 선택하세요.'
    if (!result.success || Object.keys(fields).length) { setProjectErrors(fields); focusFirstFormError(prefixedErrors('project', fields)); return }
    setProjectErrors({})
    setCreatingProject(true)
    try {
      const response = await api(`/workspaces/${activeWorkspace}/projects`, { body: result.output, schema: createdProjectSchema })
      await queryClient.invalidateQueries({ queryKey: ['projects', activeWorkspace] })
      await queryClient.invalidateQueries({ queryKey: ['gantt'] })
      await navigate({ to: '/projects/$projectId/gantt', params: { projectId: String(response.id) } })
    } catch (cause) {
      const fields = cause instanceof APIError ? Object.fromEntries(Object.entries(cause.fieldErrors).filter(([name]) => ['name', 'key', 'parentProjectId'].includes(name))) : {}
      setProjectErrors(fields)
      setProjectError(cause instanceof Error ? cause.message : '프로젝트를 만들지 못했습니다. 다시 시도해 주세요.')
      focusFirstFormError(prefixedErrors('project', fields))
    } finally { setCreatingProject(false) }
  }

  function selectWorkspace(id: number) {
    setSelectedWorkspace(id)
    setParentProjectId('')
    setProjectError('')
    setProjectErrors({})
    setCreatedWorkspace('')
  }

  async function logout() { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); tokenStore.clear(); queryClient.clear(); await navigate({ to: '/login' }) }

  return <main id="main-content" className="workspace-page arcat-workspace-page">
    <header className="workspace-header"><ArcatBrand compact /><div className="header-actions"><span>{me.data?.displayName}</span><Button variant="outline" onClick={logout}>로그아웃</Button></div></header>
    <div className="workspace-content">
      <p className="eyebrow">YOUR WORKSPACE</p><h1>함께 일할 공간</h1><p className="muted">프로젝트를 선택해 간트, 칸반, 스프린트를 관리하세요.</p>
      {createdWorkspace && <div className="arcat-workspace-notice" role="status"><Mascot variant="celebrate" size={84} /><div><strong>{createdWorkspace} 공간을 만들었습니다.</strong><p>첫 프로젝트를 준비하고 팀의 계획을 함께 시작해 보세요.</p></div></div>}
      <div className="workspace-layout">
        <section><div className="section-heading"><h2>워크스페이스</h2></div>
          {spaces.isPending && <p className="loading-state">워크스페이스를 불러오는 중입니다…</p>}
          {spaces.isError && <div><p role="alert" className="form-message">{spaces.error.message}</p><Button variant="outline" disabled={spaces.isFetching} onClick={() => spaces.refetch()}>다시 불러오기</Button></div>}
          <div className="space-list">{spaces.data?.map(space => <button key={space.id} className={`space-item ${activeWorkspace === space.id ? 'active' : ''}`} onClick={() => selectWorkspace(space.id)} disabled={creatingProject}>{space.name}<small>{space.role}</small></button>)}</div>
          <Card className="mt-5 arcat-workspace-create"><CardHeader><CardTitle>새 워크스페이스</CardTitle></CardHeader><CardContent>
            <form onSubmit={createWorkspace} className="arc-form" noValidate aria-busy={creatingWorkspace}>
              <FormErrorSummary errors={prefixedErrors('workspace', workspaceErrors)} message={workspaceError} />
              <FormField name="workspace-name" label="워크스페이스 이름" required error={workspaceErrors.name}>{props => <Input {...props} placeholder="워크스페이스 이름" value={workspaceName} disabled={creatingWorkspace} onChange={event => { setWorkspaceName(event.target.value); if (workspaceErrors.name) { const parsed = v.safeParse(nameSchema, event.target.value); setWorkspaceErrors(parsed.success ? {} : { name: parsed.issues[0].message }) } }} />}</FormField>
              <Button type="submit" disabled={creatingWorkspace}>만들기</Button>
            </form>
          </CardContent></Card>
        </section>
        <section><div className="section-heading"><h2>프로젝트</h2><div className="header-actions">{activeWorkspace && <Link className="table-link" to="/workspaces/$workspaceId/ticket-fields" params={{ workspaceId: String(activeWorkspace) }}>티켓 필드 설정</Link>}<span>{projects.data?.length ?? 0}개</span></div></div>
          {projects.isError && <div><p role="alert" className="form-message">{projects.error.message}</p><Button variant="outline" disabled={projects.isFetching} onClick={() => projects.refetch()}>다시 불러오기</Button></div>}
          {activeWorkspace && projects.isPending && <p className="loading-state">프로젝트를 불러오는 중입니다…</p>}
          {spaces.isSuccess && !spaces.data.length && <div className="arcat-workspace-empty"><Mascot variant="welcome" size={164} /><h3>팀의 첫 공간을 준비해 볼까요?</h3><p className="empty-message">첫 워크스페이스를 만들고 팀원을 초대하세요.</p></div>}
          {activeSpace && projects.isSuccess && !projects.data.length && <div className="arcat-workspace-empty arcat-project-empty"><Mascot variant="deliver" size={124} /><div><h3>아직 프로젝트가 없습니다.</h3><p>{workspaceManager ? '이름과 프로젝트 키를 정하면 첫 티켓을 담을 준비가 끝납니다.' : '워크스페이스 관리자에게 프로젝트 생성을 요청해 주세요.'}</p></div></div>}
          <div className="project-cards">{projects.data?.map(project => <Link key={project.id} to="/projects/$projectId/gantt" params={{ projectId: String(project.id) }} className="project-card"><span className="project-key">{project.key}</span><strong>{project.name}</strong><span className="muted">{project.archivedAt ? '보관됨 · ' : ''}간트 · 칸반 · 스프린트 →</span></Link>)}</div>
          {activeWorkspace && workspaceManager && <Card className="mt-5 arcat-project-create"><CardHeader><CardTitle>새 프로젝트</CardTitle><p className="muted">같은 계획을 함께 진행할 팀의 업무 공간을 만듭니다.</p></CardHeader><CardContent>
            <form onSubmit={createProject} className="arc-form" noValidate aria-busy={creatingProject}>
              <FormErrorSummary errors={prefixedErrors('project', projectErrors)} message={projectError} />
              <div className="arc-form-grid">
                <FormField name="project-name" label="프로젝트 이름" required error={projectErrors.name}>{props => <Input {...props} placeholder="프로젝트 이름" value={projectName} disabled={creatingProject} onChange={event => { setProjectName(event.target.value); if (projectErrors.name) { const parsed = v.safeParse(nameSchema, event.target.value); setProjectErrors(current => { const next = { ...current }; if (parsed.success) delete next.name; else next.name = parsed.issues[0].message; return next }) } }} />}</FormField>
                <FormField name="project-key" label="프로젝트 키" required error={projectErrors.key} description="티켓 번호의 앞에 붙는 2~10자의 영문·숫자입니다.">{props => <Input {...props} placeholder="프로젝트 키 (예: ARC)" value={projectKey} disabled={creatingProject} onChange={event => { const value = event.target.value.toUpperCase(); setProjectKey(value); if (projectErrors.key) { const parsed = v.safeParse(projectFormSchema.entries.key, value); setProjectErrors(current => { const next = { ...current }; if (parsed.success) delete next.key; else next.key = parsed.issues[0].message; return next }) } }} />}</FormField>
                <FormField name="project-parentProjectId" label="상위 프로젝트" error={projectErrors.parentProjectId} description="필요할 때 같은 워크스페이스의 프로젝트 아래에 배치합니다." fullWidth>{props => <select {...props} value={parentProjectId} disabled={creatingProject || projects.isPending || projects.isError} onChange={event => { setParentProjectId(event.target.value); setProjectErrors(current => { const next = { ...current }; delete next.parentProjectId; return next }) }}><option value="">없음</option>{projects.data?.filter(project => !project.archivedAt).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>}</FormField>
              </div>
              <div className="arcat-project-create-actions"><Button type="submit" disabled={creatingProject}>프로젝트 만들기</Button></div>
            </form>
          </CardContent></Card>}
        </section>
      </div>
    </div>
  </main>
}
