import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { Member, Workspace } from '@/features/workspace'
import { useProjectAccess, type Project, type Version } from '@/features/project'
import type { User } from '@/features/auth'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { IntegrationSettings } from '@/features/integration'

interface Invitation { id: number; email: string; role: string; expiresAt: string }

export function SettingsScreen({ projectId }: { projectId: number }) {
  const client = useQueryClient()
  const access = useProjectAccess(projectId)
  const navigate = useNavigate()
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const workspaceId = project.data?.workspaceId
  const spaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api<Workspace[]>('/auth/workspaces') })
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') })
  const projects = useQuery({ queryKey: ['projects', workspaceId], queryFn: () => api<Project[]>(`/workspaces/${workspaceId}/projects`), enabled: !!workspaceId })
  const versions = useQuery({ queryKey: ['versions', projectId], queryFn: () => api<Version[]>(`/projects/${projectId}/versions`) })
  const members = useQuery({ queryKey: ['members', workspaceId], queryFn: () => api<Member[]>(`/auth/workspaces/${workspaceId}/members`), enabled: !!workspaceId })
  const role = spaces.data?.find(space => space.id === workspaceId)?.role
  const manager = role === 'OWNER' || role === 'ADMIN'
  const owner = role === 'OWNER'
  const invitations = useQuery({ queryKey: ['invitations', workspaceId], queryFn: () => api<Invitation[]>(`/auth/workspaces/${workspaceId}/invitations`), enabled: !!workspaceId && manager })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [versionName, setVersionName] = useState('')
  const [versionStart, setVersionStart] = useState('')
  const [versionDue, setVersionDue] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [projectKey, setProjectKey] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)
  const [parentId, setParentId] = useState<number | null | undefined>(undefined)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [managerId, setManagerId] = useState('')
  const [managerBusy, setManagerBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function run(action: () => Promise<unknown>, success: string) {
    setError(''); setMessage('')
    try { await action(); setMessage(success) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function refreshTeam() {
    await Promise.all([client.invalidateQueries({ queryKey: ['members', workspaceId] }), client.invalidateQueries({ queryKey: ['invitations', workspaceId] }), client.invalidateQueries({ queryKey: ['workspaces'] }), client.invalidateQueries({ queryKey: ['project', String(projectId)] })])
  }
  async function setProjectManager(userId: number, assigned: boolean) {
    if (!access.workspaceManager || access.archived || managerBusy) return
    setManagerBusy(true)
    try {
      await run(async () => {
        await api(`/projects/${projectId}/managers/${userId}`, { method: assigned ? 'PUT' : 'DELETE' })
        setManagerId('')
        await client.invalidateQueries({ queryKey: ['project', String(projectId)] })
      }, assigned ? '프로젝트 관리자를 지정했습니다.' : '프로젝트 관리자 지정을 해제했습니다.')
    } finally { setManagerBusy(false) }
  }
  async function invite(event: React.FormEvent) {
    event.preventDefault()
    await run(async () => { await api(`/auth/workspaces/${workspaceId}/invitations`, { body: { email: inviteEmail, role: inviteRole } }); setInviteEmail(''); await refreshTeam() }, '초대 메일을 보냈습니다.')
  }
  async function addVersion(event: React.FormEvent) {
    event.preventDefault()
    await run(async () => { await api(`/projects/${projectId}/versions`, { body: { name: versionName, startDate: versionStart || null, dueDate: versionDue } }); setVersionName(''); setVersionStart(''); setVersionDue(''); await client.invalidateQueries({ queryKey: ['versions', projectId] }); await client.invalidateQueries({ queryKey: ['gantt'] }) }, '버전을 추가했습니다.')
  }
  async function saveProject(event: React.FormEvent) {
    event.preventDefault()
    await run(async () => { await api(`/projects/${projectId}`, { method: 'PUT', body: { name: name ?? project.data?.name, key: projectKey ?? project.data?.key, description: description ?? project.data?.description ?? '', parentProjectId: parentId === undefined ? project.data?.parentProjectId ?? null : parentId, archived: !!project.data?.archivedAt } }); await client.invalidateQueries({ queryKey: ['project', String(projectId)] }); await client.invalidateQueries({ queryKey: ['projects', workspaceId] }); await client.invalidateQueries({ queryKey: ['gantt'] }) }, '프로젝트를 저장했습니다.')
  }
  async function setArchive(archived: boolean) {
    await run(async () => { await api(`/projects/${projectId}`, { method: 'PUT', body: { name: project.data?.name, description: project.data?.description, parentProjectId: project.data?.parentProjectId ?? null, archived } }); await client.invalidateQueries({ queryKey: ['project', String(projectId)] }); await client.invalidateQueries({ queryKey: ['projects', workspaceId] }); await client.invalidateQueries({ queryKey: ['gantt'] }) }, archived ? '프로젝트를 보관했습니다.' : '프로젝트를 복원했습니다.')
  }
  async function changeRole(member: Member, nextRole: string) {
    await run(async () => { await api(`/auth/workspaces/${workspaceId}/members/${member.id}/role`, { method: 'PATCH', body: { role: nextRole } }); await refreshTeam() }, `${member.displayName}님의 역할을 변경했습니다.`)
  }
  async function removeMember(member: Member) {
    if (!window.confirm(`${member.displayName}님을 워크스페이스에서 제거할까요?`)) return
    await run(async () => { await api(`/auth/workspaces/${workspaceId}/members/${member.id}`, { method: 'DELETE' }); await refreshTeam() }, '팀원을 제거했습니다.')
  }
  async function transferOwner(member: Member) {
    if (!window.confirm(`${member.displayName}님에게 소유권을 이전할까요? 현재 계정은 관리자가 됩니다.`)) return
    await run(async () => { await api(`/auth/workspaces/${workspaceId}/owner/${member.id}`, { method: 'POST' }); await refreshTeam() }, '소유권을 이전했습니다.')
  }
  async function deleteWorkspace(event: React.FormEvent) {
    event.preventDefault()
    if (deleteConfirmation !== spaces.data?.find(space => space.id === workspaceId)?.name) { setError('워크스페이스 이름을 정확히 입력해 주세요.'); return }
    await run(async () => { await api(`/auth/workspaces/${workspaceId}`, { method: 'DELETE', body: { confirmation: deleteConfirmation } }); client.clear(); await navigate({ to: '/' }) }, '워크스페이스를 삭제했습니다.')
  }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">PROJECT SETTINGS</p><h1>프로젝트와 팀 설정</h1><p>프로젝트 정보, 릴리스 버전, 팀원을 관리합니다.</p></div></div>{error && <p role="alert" className="form-message">{error}</p>}{message && <p role="status" className="success-message">{message}</p>}<div className="settings-grid">
    <section className="detail-panel" aria-label="프로젝트 관리자 설정"><h2>프로젝트 관리자</h2><p className="view-note">워크스페이스 소유자·관리자는 기본 관리자입니다. 추가 관리자는 이 프로젝트의 WBS·티켓·스프린트·버전을 관리하며 팀원 역할이나 다른 프로젝트 권한은 바뀌지 않습니다.</p>
      {project.isError && <p className="form-message" role="alert">{project.error.message}</p>}{members.isError && <p className="form-message" role="alert">{members.error.message}</p>}
      <h3>기본 관리자</h3><ul className="setting-list">{members.data?.filter(member => member.role === 'OWNER' || member.role === 'ADMIN').map(member => <li key={member.id}><span>{member.displayName}</span><span>{member.role === 'OWNER' ? '워크스페이스 소유자' : '워크스페이스 관리자'}</span></li>)}</ul>
      <h3>추가 관리자</h3><ul className="setting-list">{project.data?.managerIds?.map(id => <li key={id}><span>{members.data?.find(member => member.id === id)?.displayName ?? `팀원 ${id}`}</span>{access.workspaceManager && <Button size="sm" variant="outline" disabled={access.archived || managerBusy} aria-label={`${members.data?.find(member => member.id === id)?.displayName ?? `팀원 ${id}`} 프로젝트 관리자 해제`} onClick={() => setProjectManager(id, false)}>지정 해제</Button>}</li>)}</ul>{!project.isPending && !project.isError && !project.data?.managerIds?.length && <p className="muted">추가로 지정한 관리자가 없습니다.</p>}
      {access.workspaceManager && <form className="form-stack" onSubmit={event => { event.preventDefault(); if (managerId) void setProjectManager(Number(managerId), true) }}><label>지정할 팀원<select aria-label="프로젝트 관리자로 지정할 팀원" value={managerId} onChange={event => setManagerId(event.target.value)} disabled={access.archived || managerBusy} required><option value="">팀원 선택</option>{members.data?.filter(member => member.role === 'MEMBER' && !project.data?.managerIds?.includes(member.id)).map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><Button type="submit" variant="outline" disabled={access.archived || managerBusy || !managerId}>프로젝트 관리자 지정</Button></form>}
    </section>
    <section className="detail-panel"><h2>프로젝트</h2><p className="muted">첫 이슈를 만든 뒤에는 프로젝트 키를 변경할 수 없습니다.</p><form className="form-stack" onSubmit={saveProject}><label>이름<Input value={name ?? project.data?.name ?? ''} onChange={e => setName(e.target.value)} disabled={!manager} required /></label><label>프로젝트 키<Input value={projectKey ?? project.data?.key ?? ''} onChange={e => setProjectKey(e.target.value.toUpperCase())} disabled={!manager || (project.data?.nextIssueNumber ?? 1) > 1} minLength={2} maxLength={10} required /></label><label>설명<Textarea value={description ?? project.data?.description ?? ''} onChange={e => setDescription(e.target.value)} disabled={!manager} /></label><label>상위 프로젝트<select value={parentId === undefined ? project.data?.parentProjectId ?? '' : parentId ?? ''} onChange={e => setParentId(e.target.value ? Number(e.target.value) : null)} disabled={!manager}><option value="">없음</option>{projects.data?.filter(item => item.id !== projectId && !item.archivedAt).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{manager && <Button type="submit">프로젝트 저장</Button>}</form>{manager && <div className="setting-actions"><Button variant="outline" onClick={() => setArchive(!project.data?.archivedAt)}>{project.data?.archivedAt ? '프로젝트 복원' : '프로젝트 보관'}</Button></div>}</section>
    <section className="detail-panel"><h2>버전 / 마일스톤</h2><ul className="setting-list">{versions.data?.map(version => <li key={version.id}><span>{version.name}</span><span>{version.dueDate.slice(0, 10)}</span></li>)}</ul>{!versions.data?.length && <p className="muted">등록된 버전이 없습니다.</p>}{access.manager && !project.data?.archivedAt && <form className="form-stack" onSubmit={addVersion}><label>버전 이름<Input placeholder="버전 이름" value={versionName} onChange={e => setVersionName(e.target.value)} required /></label><label>시작일<Input type="date" value={versionStart} onChange={e => setVersionStart(e.target.value)} /></label><label>완료일<Input type="date" value={versionDue} onChange={e => setVersionDue(e.target.value)} required /></label><Button type="submit" variant="outline">버전 추가</Button></form>}</section>
    <section className="detail-panel team-settings"><h2>팀원</h2><ul className="setting-list">{members.data?.map(member => <li key={member.id} className="setting-member"><span><strong>{member.displayName}</strong><small>{member.email}</small></span><span className="setting-actions">{manager && member.role !== 'OWNER' ? <><select aria-label={`${member.displayName} 역할`} value={member.role} onChange={e => changeRole(member, e.target.value)}><option value="MEMBER">멤버</option><option value="ADMIN">관리자</option></select>{owner && member.id !== me.data?.id && <Button size="sm" variant="outline" onClick={() => transferOwner(member)}>소유권 이전</Button>}<Button size="sm" variant="ghost" onClick={() => removeMember(member)}>제거</Button></> : <span>{member.role === 'OWNER' ? '소유자' : member.role}</span>}</span></li>)}</ul>{manager && <><h3>팀원 초대</h3><form className="form-stack" onSubmit={invite}><label>초대할 이메일<Input type="email" placeholder="초대할 이메일" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required /></label><label>초대 역할<select value={inviteRole} onChange={e => setInviteRole(e.target.value)} aria-label="초대 역할"><option value="MEMBER">멤버</option><option value="ADMIN">관리자</option></select></label><Button type="submit" variant="outline">초대 메일 보내기</Button></form><h3>대기 중인 초대</h3><ul className="setting-list">{invitations.data?.map(invitation => <li key={invitation.id}><span>{invitation.email} <small>{invitation.role}</small></span><Button size="sm" variant="ghost" onClick={() => run(async () => { await api(`/auth/workspaces/${workspaceId}/invitations/${invitation.id}`, { method: 'DELETE' }); await refreshTeam() }, '초대를 취소했습니다.')}>초대 취소</Button></li>)}</ul>{!invitations.data?.length && <p className="muted">대기 중인 초대가 없습니다.</p>}</>}</section>
    {owner && <section className="detail-panel"><h2>워크스페이스 삭제</h2><p className="muted">워크스페이스와 모든 프로젝트에 대한 접근을 종료합니다. 확인하려면 이름을 입력하세요.</p><form className="form-stack" onSubmit={deleteWorkspace}><label>삭제할 워크스페이스 이름<Input aria-label="삭제할 워크스페이스 이름" placeholder={spaces.data?.find(space => space.id === workspaceId)?.name} value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} /></label><Button type="submit" variant="destructive" disabled={!deleteConfirmation}>워크스페이스 삭제</Button></form></section>}
    <IntegrationSettings projectId={projectId} />
  </div></section>
}
