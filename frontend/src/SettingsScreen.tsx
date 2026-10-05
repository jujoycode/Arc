import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Member, Project, Version } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function SettingsScreen({ projectId }: { projectId: number }) {
  const client = useQueryClient()
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const versions = useQuery({ queryKey: ['versions', projectId], queryFn: () => api<Version[]>(`/projects/${projectId}/versions`) })
  const members = useQuery({ queryKey: ['members', project.data?.workspaceId], queryFn: () => api<Member[]>(`/auth/workspaces/${project.data!.workspaceId}/members`), enabled: !!project.data })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [versionName, setVersionName] = useState('')
  const [versionStart, setVersionStart] = useState('')
  const [versionDue, setVersionDue] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function invite(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    try { await api(`/auth/workspaces/${project.data!.workspaceId}/invitations`, { body: { email: inviteEmail, role: inviteRole } }); setInviteEmail(''); setMessage('초대 메일을 보냈습니다.') }
    catch (cause) { setError((cause as Error).message) }
  }
  async function addVersion(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try { await api(`/projects/${projectId}/versions`, { body: { name: versionName, startDate: versionStart || null, dueDate: versionDue } }); setVersionName(''); await client.invalidateQueries({ queryKey: ['versions', projectId] }) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function updateProject(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try { await api(`/projects/${projectId}`, { method: 'PUT', body: { name: name || project.data?.name, description: description || project.data?.description, parentProjectId: project.data?.parentProjectId ?? null, archived: false } }); await client.invalidateQueries({ queryKey: ['project', String(projectId)] }); setMessage('프로젝트를 저장했습니다.') }
    catch (cause) { setError((cause as Error).message) }
  }
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">PROJECT SETTINGS</p><h1>팀과 버전 설정</h1><p>프로젝트 정보, 릴리스 버전, 팀원을 관리합니다.</p></div></div>{error && <p role="alert" className="form-message">{error}</p>}{message && <p role="status" className="success-message">{message}</p>}<div className="settings-grid"><section className="detail-panel"><h2>프로젝트</h2><p className="muted">키 {project.data?.key} · 이슈 번호를 만든 뒤에는 키를 변경할 수 없습니다.</p><form className="form-stack" onSubmit={updateProject}><Input placeholder={project.data?.name ?? '이름'} value={name} onChange={e => setName(e.target.value)} /><Textarea placeholder={project.data?.description || '설명'} value={description} onChange={e => setDescription(e.target.value)} /><Button type="submit">프로젝트 저장</Button></form></section><section className="detail-panel"><h2>버전 / 마일스톤</h2><ul className="setting-list">{versions.data?.map(version => <li key={version.id}>{version.name}<span>{version.dueDate.slice(0, 10)}</span></li>)}</ul><form className="form-stack" onSubmit={addVersion}><Input placeholder="버전 이름" value={versionName} onChange={e => setVersionName(e.target.value)} required /><label>시작일<Input type="date" value={versionStart} onChange={e => setVersionStart(e.target.value)} /></label><label>완료일<Input type="date" value={versionDue} onChange={e => setVersionDue(e.target.value)} required /></label><Button type="submit" variant="outline">버전 추가</Button></form></section><section className="detail-panel"><h2>팀원</h2><ul className="setting-list">{members.data?.map(member => <li key={member.id}>{member.displayName} <small>{member.email}</small><span>{member.role}</span></li>)}</ul><form className="form-stack" onSubmit={invite}><Input type="email" placeholder="초대할 이메일" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required /><select value={inviteRole} onChange={e => setInviteRole(e.target.value)} aria-label="초대 역할"><option value="MEMBER">멤버</option><option value="ADMIN">관리자</option></select><Button type="submit" variant="outline">초대 메일 보내기</Button></form></section></div></section>
}
