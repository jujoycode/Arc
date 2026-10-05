import { useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, issuePath, refreshProjectIssues } from './api'
import type { Comment, Issue, Project, Relation, User, Workspace } from './api'
import { useIssues } from './GanttScreen'
import { IssueForm, priorityLabels, statusLabels, typeLabels } from './IssueForm'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Activity { id: number; type: string; actorName: string; createdAt: string }

export function IssueDetailScreen({ projectId }: { projectId: number }) {
  const { issueId } = useParams({ from: '/projects/$projectId/issues/$issueId' })
  const id = Number(issueId)
  const navigate = useNavigate()
  const client = useQueryClient()
  const issue = useQuery({ queryKey: ['issue', projectId, id], queryFn: () => api<Issue>(issuePath(projectId, id)) })
  const comments = useQuery({ queryKey: ['comments', projectId, id], queryFn: () => api<Comment[]>(issuePath(projectId, id) + '/comments') })
  const activities = useQuery({ queryKey: ['activities', projectId, id], queryFn: () => api<Activity[]>(issuePath(projectId, id) + '/activities') })
  const relations = useQuery({ queryKey: ['relations', projectId], queryFn: () => api<Relation[]>(`/projects/${projectId}/relations`) })
  const issues = useIssues(projectId)
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') })
  const project = useQuery({ queryKey: ['project', String(projectId)], queryFn: () => api<Project>(`/projects/${projectId}`) })
  const spaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api<Workspace[]>('/auth/workspaces') })
  const manager = ['OWNER', 'ADMIN'].includes(spaces.data?.find(space => space.id === project.data?.workspaceId)?.role ?? '')
  const [editing, setEditing] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentBody, setEditingCommentBody] = useState('')
  const [body, setBody] = useState('')
  const [relationTarget, setRelationTarget] = useState('')
  const [relationType, setRelationType] = useState('BLOCKS')
  const [error, setError] = useState('')
  const item = issue.data
  async function addComment(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try { await api(issuePath(projectId, id) + '/comments', { body: { body } }); setBody(''); await client.invalidateQueries({ queryKey: ['comments', projectId, id] }) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function addRelation(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try { await api(issuePath(projectId, id) + '/relations', { body: { targetId: Number(relationTarget), type: relationType } }); setRelationTarget(''); await client.invalidateQueries({ queryKey: ['relations', projectId] }); await client.invalidateQueries({ queryKey: ['gantt'] }) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function deleteIssue() {
    if (!window.confirm('이슈를 삭제하시겠습니까?')) return
    try { await api(issuePath(projectId, id), { method: 'DELETE' }); await refreshProjectIssues(client, projectId); navigate({ to: '/projects/$projectId/issues', params: { projectId: String(projectId) } }) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function deleteComment(commentId: number) {
    try { await api(`/projects/${projectId}/comments/${commentId}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['comments', projectId, id] }) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function saveComment(commentId: number) {
    try { await api(`/projects/${projectId}/comments/${commentId}`, { method: 'PUT', body: { body: editingCommentBody } }); setEditingCommentId(null); await client.invalidateQueries({ queryKey: ['comments', projectId, id] }) }
    catch (cause) { setError((cause as Error).message) }
  }
  async function deleteRelation(relationId: number) {
    try { await api(`/projects/${projectId}/relations/${relationId}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['relations', projectId] }); await client.invalidateQueries({ queryKey: ['gantt'] }) }
    catch (cause) { setError((cause as Error).message) }
  }
  if (issue.isPending) return <p className="loading-state">이슈를 불러오는 중입니다…</p>
  if (!item) return <p className="form-message" role="alert">{(issue.error as Error)?.message ?? '이슈가 없습니다.'}</p>
  const relevantRelations = relations.data?.filter(relation => relation.fromId === id || relation.toId === id) ?? []
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow"><Link to="/projects/$projectId/issues" params={{ projectId: String(projectId) }}>이슈 목록</Link> / {item.key}</p><h1>{item.title}</h1><p>{typeLabels[item.type]} · {statusLabels[item.status]}</p></div><div className="heading-actions"><Button variant="outline" onClick={() => setEditing(!editing)}>{editing ? '편집 닫기' : '이슈 편집'}</Button>{manager && <Button variant="destructive" onClick={deleteIssue}>삭제</Button>}</div></div>{error && <p className="form-message" role="alert">{error}</p>}{editing ? <div className="detail-panel"><IssueForm key={item.version} projectId={projectId} initial={item} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} /></div> : <div className="detail-grid"><div className="detail-panel"><h2>설명</h2><p className="description-text">{item.description || '설명이 없습니다.'}</p><h2>댓글</h2><div className="comment-list">{comments.data?.map(comment => <article key={comment.id} className="comment"><div><strong>{comment.authorName}</strong><time>{comment.createdAt.slice(0, 16).replace('T', ' ')}</time>{comment.authorId === me.data?.id && <Button size="xs" variant="ghost" onClick={() => { setEditingCommentId(comment.id); setEditingCommentBody(comment.body) }}>수정</Button>}{(comment.authorId === me.data?.id || manager) && <Button size="xs" variant="ghost" onClick={() => deleteComment(comment.id)}>삭제</Button>}</div>{editingCommentId === comment.id ? <div className="form-stack"><Textarea aria-label="댓글 수정" value={editingCommentBody} onChange={e => setEditingCommentBody(e.target.value)} /><div className="setting-actions"><Button size="sm" onClick={() => saveComment(comment.id)}>저장</Button><Button size="sm" variant="outline" onClick={() => setEditingCommentId(null)}>취소</Button></div></div> : <p>{comment.body}</p>}</article>)}</div><form onSubmit={addComment} className="form-stack"><Textarea placeholder="댓글을 입력하세요" value={body} onChange={e => setBody(e.target.value)} required /><Button type="submit">댓글 작성</Button></form><h2>변경 기록</h2><ul className="activity-list">{activities.data?.map(activity => <li key={activity.id}>{activity.actorName} · {activity.type} · {activity.createdAt.slice(0, 16).replace('T', ' ')}</li>)}</ul></div><aside className="detail-panel"><h2>속성</h2><dl className="properties"><div><dt>상태</dt><dd>{statusLabels[item.status]}</dd></div><div><dt>우선순위</dt><dd>{priorityLabels[item.priority]}</dd></div><div><dt>담당자</dt><dd>{item.assigneeName ?? '미지정'}</dd></div><div><dt>시작일</dt><dd>{item.startDate?.slice(0, 10) ?? '—'}</dd></div><div><dt>완료일</dt><dd>{item.dueDate?.slice(0, 10) ?? '—'}</dd></div><div><dt>완료율</dt><dd>{item.progress}%</dd></div><div><dt>스토리 포인트</dt><dd>{item.storyPoints ?? '—'}</dd></div></dl><h2>이슈 관계</h2>{relevantRelations.map(relation => { const other = issues.data?.items.find(candidate => candidate.id === (relation.fromId === id ? relation.toId : relation.fromId)); return <p key={relation.id} className="relation-entry">{relation.type === 'BLOCKS' ? '차단' : '선행'} · {other ? <Link to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(other.id) }}>{other.key} {other.title}</Link> : '이슈'} <Button size="xs" variant="ghost" onClick={() => deleteRelation(relation.id)}>연결 해제</Button></p> })}<form onSubmit={addRelation} className="form-stack"><select value={relationType} onChange={e => setRelationType(e.target.value)} aria-label="관계 유형"><option value="BLOCKS">차단</option><option value="PRECEDES">선행</option></select><select value={relationTarget} onChange={e => setRelationTarget(e.target.value)} required aria-label="연결할 이슈"><option value="">연결할 이슈 선택</option>{issues.data?.items.filter(candidate => candidate.id !== id).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.key} {candidate.title}</option>)}</select><Button type="submit" variant="outline">관계 추가</Button></form></aside></div>}</section>
}
