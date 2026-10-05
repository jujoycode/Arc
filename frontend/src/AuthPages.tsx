import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, tokenStore } from './api'
import type { User } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      if (mode === 'register') {
        await api('/auth/register', { body: { email, displayName, password } })
        setMessage('확인 메일을 보냈습니다. 메일의 링크를 연 뒤 로그인하세요.')
      } else {
        const result = await api<{ token: string; user: User }>('/auth/login', { body: { email, password } })
        tokenStore.set(result.token)
        client.clear()
        await navigate({ to: '/' })
      }
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  return <main id="main-content" className="auth-page"><Card className="auth-card"><CardHeader><div className="auth-brand">A <span>Arc</span></div><CardTitle>{mode === 'login' ? '팀 공간에 로그인' : 'Arc 계정 만들기'}</CardTitle><p className="muted">팀의 이슈와 일정을 한곳에서 관리하세요.</p></CardHeader><CardContent><form onSubmit={submit} className="form-stack">{mode === 'register' && <div><Label htmlFor="displayName">이름</Label><Input id="displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} required maxLength={120} /></div>}<div><Label htmlFor="email">이메일</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div><div><Label htmlFor="password">비밀번호</Label><Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} required /></div><Button type="submit" disabled={busy}>{busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 확인 메일 받기'}</Button></form>{message && <p className="form-message" role="status">{message}</p>}<p className="auth-switch">{mode === 'login' ? <>계정이 없나요? <Link to="/register">가입하기</Link></> : <>이미 계정이 있나요? <Link to="/login">로그인</Link></>}</p></CardContent></Card></main>
}

export function VerifyPage() {
  const submitted = useRef(false)
  const [message, setMessage] = useState('이메일을 확인하는 중입니다…')
  useEffect(() => {
    if (submitted.current) return
    submitted.current = true
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { setMessage('확인 토큰이 없습니다.'); return }
    api(`/auth/verify?token=${encodeURIComponent(token)}`, { method: 'POST' }).then(() => setMessage('이메일 확인을 마쳤습니다. 로그인하세요.')).catch(error => setMessage(error.message))
  }, [])
  return <main id="main-content" className="auth-page"><Card className="auth-card"><CardHeader><CardTitle>이메일 확인</CardTitle></CardHeader><CardContent><p role="status">{message}</p><Button asChild className="mt-4"><Link to="/login">로그인으로 이동</Link></Button></CardContent></Card></main>
}

export function InvitePage() {
  const submitted = useRef(false)
  const client = useQueryClient()
  const [message, setMessage] = useState('초대를 확인하는 중입니다…')
  useEffect(() => {
    if (submitted.current) return
    submitted.current = true
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { setMessage('초대 토큰이 없습니다.'); return }
    if (!tokenStore.get()) { setMessage('초대받은 이메일 계정으로 로그인한 뒤 이 링크를 다시 여세요.'); return }
    api(`/auth/invitations/accept?token=${encodeURIComponent(token)}`, { method: 'POST' }).then(async () => { await client.invalidateQueries({ queryKey: ['workspaces'] }); setMessage('초대를 수락했습니다.') }).catch(error => setMessage(error.message))
  }, [])
  return <main id="main-content" className="auth-page"><Card className="auth-card"><CardHeader><CardTitle>팀 초대</CardTitle></CardHeader><CardContent><p role="status">{message}</p><Button asChild className="mt-4"><Link to="/">워크스페이스로 이동</Link></Button></CardContent></Card></main>
}
