import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as v from 'valibot'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, APIError, tokenStore } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { FormField, FormErrorSummary, focusFirstFormError } from '@/shared/ui/form'
import { ArcatBrand, Mascot } from '@/shared/ui/Mascot'
import { loginFormSchema, registerFormSchema, loginResponseSchema, messageResponseSchema, authValidationErrors } from '../model/authFormSchema'
import './arcat-auth.css'

const fieldName = (name: string) => `auth-${name}`
const prefixedErrors = (errors: Record<string, string>) => Object.fromEntries(Object.entries(errors).map(([name, message]) => [fieldName(name), message]))
type Status = 'pending' | 'success' | 'error' | 'info'

function WelcomePanel({ mode }: { mode: 'login' | 'register' }) {
  return <section className="arcat-welcome-panel" aria-label="arcat 소개">
    <ArcatBrand />
    <div className="arcat-welcome-copy"><p className="eyebrow">YOUR TEAM, IN SYNC</p><h2>팀의 다음 일을,<br />한곳에서.</h2><p>티켓부터 WBS와 간트까지.<br />팀의 계획을 연결하고 진행 상황을 함께 확인하세요.</p></div>
    <div className="arcat-welcome-art"><span className="arcat-welcome-orbit" aria-hidden="true" /><Mascot variant={mode === 'register' ? 'deliver' : 'welcome'} size={360} /><p className="arcat-welcome-caption">{mode === 'register' ? '새로운 팀의 이야기를 함께 시작해요.' : '오늘의 업무도, 차근차근.'}</p></div>
    <ul className="arcat-welcome-features"><li>티켓과 WBS</li><li>간트·칸반·스프린트</li><li>GitHub·GitLab 연동</li></ul>
  </section>
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [values, setValues] = useState({ email: '', displayName: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const isRegister = mode === 'register'

  function update(name: keyof typeof values, value: string) {
    const next = { ...values, [name]: value }
    setValues(next)
    if (Object.keys(errors).length) {
      const result = isRegister ? v.safeParse(registerFormSchema, next) : v.safeParse(loginFormSchema, next)
      const nextErrors = result.success ? {} : authValidationErrors(result.issues)
      setErrors(Object.fromEntries(Object.keys(errors).filter(key => nextErrors[key]).map(key => [key, nextErrors[key]])))
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setErrorMessage('')
    setSuccessMessage('')
    const result = isRegister ? v.safeParse(registerFormSchema, values) : v.safeParse(loginFormSchema, values)
    if (!result.success) {
      const fields = authValidationErrors(result.issues)
      setErrors(fields)
      focusFirstFormError(prefixedErrors(fields))
      return
    }
    setErrors({})
    setBusy(true)
    try {
      if (isRegister) {
        await api('/auth/register', { body: result.output, schema: messageResponseSchema })
        setSuccessMessage('확인 메일을 보냈습니다. 메일의 링크를 연 뒤 로그인하세요.')
      } else {
        const response = await api('/auth/login', { body: result.output, schema: loginResponseSchema })
        tokenStore.set(response.token)
        client.clear()
        await navigate({ to: '/' })
      }
    } catch (cause) {
      const fields = cause instanceof APIError ? Object.fromEntries(Object.entries(cause.fieldErrors).filter(([key]) => key in values)) : {}
      setErrors(fields)
      setErrorMessage(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.')
      focusFirstFormError(prefixedErrors(fields))
    } finally { setBusy(false) }
  }

  return <main id="main-content" className="auth-page arcat-auth-page"><div className="arcat-auth-layout">
    <WelcomePanel mode={mode} />
    <section className="arcat-auth-form-panel" aria-label={isRegister ? '계정 가입' : '로그인'}><Card className="auth-card arcat-auth-card">
      <CardHeader><p className="eyebrow">{isRegister ? 'A NEW BEGINNING' : 'WELCOME BACK'}</p><CardTitle><h1>{isRegister ? 'arcat 계정 만들기' : '팀 공간에 로그인'}</h1></CardTitle><p className="muted">{isRegister ? '이메일을 확인하고, 팀의 첫 프로젝트를 시작하세요.' : '팀의 이슈와 일정을 한곳에서 관리하세요.'}</p></CardHeader>
      <CardContent><form onSubmit={submit} className="arc-form arcat-auth-form" noValidate aria-busy={busy}>
        <FormErrorSummary errors={prefixedErrors(errors)} message={errorMessage} />
        {isRegister && <FormField name={fieldName('displayName')} label="이름" required error={errors.displayName}>{props => <Input {...props} autoComplete="name" value={values.displayName} onChange={event => update('displayName', event.target.value)} disabled={busy} />}</FormField>}
        <FormField name={fieldName('email')} label="이메일" required error={errors.email}>{props => <Input {...props} type="email" autoComplete="email" inputMode="email" value={values.email} onChange={event => update('email', event.target.value)} disabled={busy} />}</FormField>
        <FormField name={fieldName('password')} label="비밀번호" required error={errors.password} description={isRegister ? '12자 이상으로 입력하세요. 영문은 최대 72자, 한글은 최대 24자입니다.' : undefined}>{props => <Input {...props} type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} value={values.password} onChange={event => update('password', event.target.value)} disabled={busy} />}</FormField>
        <Button type="submit" className="arcat-auth-submit" disabled={busy}>{busy ? '처리 중…' : isRegister ? '가입하고 확인 메일 받기' : '로그인'}</Button>
      </form>
      {successMessage && <div className="arcat-auth-notice" role="status"><Mascot variant="deliver" size={76} /><p>{successMessage}</p></div>}
      <p className="auth-switch">{isRegister ? <>이미 계정이 있나요? <Link to="/login">로그인</Link></> : <>계정이 없나요? <Link to="/register">가입하기</Link></>}</p>
      </CardContent>
    </Card><p className="arcat-auth-footer">계획은 함께, 진행은 한눈에.</p></section>
  </div></main>
}

function StatusCard({ title, message, status, children }: { title: string; message: string; status: Status; children: ReactNode }) {
  return <main id="main-content" className="auth-page arcat-status-page"><Card className="auth-card arcat-status-card"><CardHeader><ArcatBrand compact /><CardTitle><h1>{title}</h1></CardTitle></CardHeader><CardContent><Mascot variant={status === 'success' ? 'celebrate' : status === 'error' ? 'idle' : 'deliver'} size={180} /><p className={`arcat-status-message ${status === 'error' ? 'arcat-status-error' : ''}`} role={status === 'error' ? 'alert' : 'status'}>{message}</p>{children}</CardContent></Card></main>
}

export function VerifyPage() {
  const submitted = useRef(false)
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'))
  const [message, setMessage] = useState(token ? '이메일을 확인하는 중입니다…' : '확인 토큰이 없습니다.')
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'error')
  useEffect(() => {
    if (submitted.current) return
    submitted.current = true
    if (!token) return
    api(`/auth/verify?token=${encodeURIComponent(token)}`, { method: 'POST', schema: messageResponseSchema }).then(() => { setMessage('이메일 확인을 마쳤습니다. 로그인하세요.'); setStatus('success') }).catch(error => { setMessage(error.message); setStatus('error') })
  }, [token])
  return <StatusCard title="이메일 확인" message={message} status={status}><Button asChild className="arcat-status-action"><Link to="/login">로그인으로 이동</Link></Button></StatusCard>
}

export function InvitePage() {
  const submitted = useRef(false)
  const client = useQueryClient()
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'))
  const [signedIn] = useState(() => !!tokenStore.get())
  const [message, setMessage] = useState(!token ? '초대 토큰이 없습니다.' : !signedIn ? '초대받은 이메일 계정으로 로그인한 뒤 이 링크를 다시 여세요.' : '초대를 확인하는 중입니다…')
  const [status, setStatus] = useState<Status>(!token ? 'error' : !signedIn ? 'info' : 'pending')
  useEffect(() => {
    if (submitted.current) return
    submitted.current = true
    if (!token || !signedIn) return
    api(`/auth/invitations/accept?token=${encodeURIComponent(token)}`, { method: 'POST', schema: messageResponseSchema }).then(async () => { await client.invalidateQueries({ queryKey: ['workspaces'] }); setMessage('초대를 수락했습니다.'); setStatus('success') }).catch(error => { setMessage(error.message); setStatus('error') })
  }, [client, token, signedIn])
  return <StatusCard title="팀 초대" message={message} status={status}><Button asChild className="arcat-status-action"><Link to="/">워크스페이스로 이동</Link></Button></StatusCard>
}
