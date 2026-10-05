// Full user flow against local API/MySQL/Mailpit. Creates and deletes its own workspace.
import { chromium, request } from '../frontend/node_modules/playwright/index.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const web = process.env.ARC_WEB_URL ?? 'http://localhost:5173'
const backend = process.env.ARC_API_URL ?? 'http://localhost:8080/api/'
const mail = process.env.ARC_MAIL_URL ?? 'http://localhost:8025/api/v1/'
const http = await request.newContext({ baseURL: backend })
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Seoul' })
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
let verificationRequests = 0, invitationRequests = 0
page.on('request', req => {
  if (req.url().includes('/api/auth/verify?')) verificationRequests++
  if (req.url().includes('/api/auth/invitations/accept?')) invitationRequests++
})
const suffix = Date.now().toString(36)
const ownerEmail = `browser-owner-${suffix}@example.com`, memberEmail = `browser-member-${suffix}@example.com`
const password = 'browser-smoke-password-123'
const workspaceName = `Browser smoke ${suffix}`
let workspaceId, projectId, ownerToken
const output = join(tmpdir(), `arc-browser-${suffix}`)
mkdirSync(output)

async function api(path, body, token, method = body === undefined ? 'GET' : 'POST', expected = 200) {
  const response = await http.fetch(path, { method, data: body, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const raw = await response.text()
  assert.equal(response.status(), expected, `${path}: ${raw.slice(0, 250)}`)
  return raw ? JSON.parse(raw) : undefined
}
async function mailToken(email, subject) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listing = await (await http.get(`${mail}messages`)).json()
    const item = listing.messages.find(item => item.Subject === subject && item.To.some(to => to.Address === email))
    if (item) return (await (await http.get(`${mail}message/${item.ID}`)).json()).Text.match(/token=([^\s]+)/)[1]
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Expected ${subject} email`)
}
async function login(email) {
  await page.goto(`${web}/login`)
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('비밀번호', { exact: true }).fill(password)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await page.getByRole('heading', { name: '함께 일할 공간' }).waitFor()
  return page.evaluate(() => localStorage.getItem('arc-token'))
}
async function nav(label) { await page.getByRole('navigation', { name: '프로젝트 메뉴' }).getByRole('link', { name: label, exact: true }).click() }
async function heading(name) { await page.getByRole('heading', { name, exact: true }).waitFor() }
async function card(title) { const locator = page.locator('.board-card').filter({ hasText: title }); await locator.waitFor(); return locator }
async function download(format) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: format, exact: true }).click()
  const file = await pending
  const path = join(output, file.suggestedFilename())
  await file.saveAs(path)
  return readFileSync(path)
}

try {
  await api('auth/register', { email: ownerEmail, displayName: '검증 관리자', password })
  await page.goto(`${web}/verify?token=${await mailToken(ownerEmail, 'Arc 이메일 확인')}`)
  await page.getByText('이메일 확인을 마쳤습니다. 로그인하세요.').waitFor()
  assert.equal(verificationRequests, 1, 'StrictMode must not submit verification twice')
  ownerToken = await login(ownerEmail)
  await page.getByPlaceholder('워크스페이스 이름', { exact: true }).fill(workspaceName)
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await page.locator('.space-item').filter({ hasText: workspaceName }).waitFor()
  workspaceId = (await api('auth/workspaces', undefined, ownerToken)).find(space => space.name === workspaceName).id
  await page.getByPlaceholder('프로젝트 이름', { exact: true }).fill('제품 기능 검증')
  await page.getByPlaceholder('프로젝트 키 (예: ARC)').fill('CHECK')
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click()
  await heading('간트 차트')
  projectId = Number(new URL(page.url()).pathname.split('/')[2])
  const owner = await api('auth/me', undefined, ownerToken)
  const release = await api(`projects/${projectId}/versions`, { name: 'v1.0', startDate: '2026-10-01', dueDate: '2026-10-31' }, ownerToken)
  const epic = await api(`projects/${projectId}/issues`, { title: '출시 계획', type: 'EPIC', startDate: '2026-09-01', dueDate: '2026-12-31', versionId: release.id }, ownerToken)

  await nav('칸반')
  await page.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('제목', { exact: true }).fill('일정 관리 구현')
  await form.getByLabel('설명', { exact: true }).fill('실제 제품의 이슈 생성과 화면 동기화를 검증합니다.')
  await form.getByLabel('우선순위', { exact: true }).selectOption('HIGH')
  await form.getByLabel('담당자', { exact: true }).selectOption(String(owner.id))
  await form.getByLabel('시작일', { exact: true }).fill('2026-10-06')
  await form.getByLabel('완료일', { exact: true }).fill('2026-10-15')
  await form.getByLabel('완료율', { exact: true }).fill('40')
  await form.getByLabel('스토리 포인트', { exact: true }).fill('5')
  await form.getByLabel('부모 이슈', { exact: true }).selectOption(String(epic.id))
  await form.getByLabel('버전', { exact: true }).selectOption(String(release.id))
  await form.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  await heading('일정 관리 구현')
  const storyId = Number(new URL(page.url()).pathname.split('/').at(-1))
  const story = await api(`projects/${projectId}/issues/${storyId}`, undefined, ownerToken)
  assert.equal(story.assigneeId, owner.id)
  const subtask = await api(`projects/${projectId}/issues`, { title: '날짜 계산', type: 'SUBTASK', parentId: storyId, startDate: '2026-10-07', dueDate: '2026-10-12', progress: 60 }, ownerToken)
  const done = await api(`projects/${projectId}/issues`, { title: 'API 구현', type: 'TASK', status: 'DONE', storyPoints: 3, dueDate: '2026-10-20' }, ownerToken)
  await page.reload()
  await page.getByLabel('댓글 내용').fill('일정과 계층을 확인했습니다.')
  await page.getByRole('button', { name: '댓글 작성', exact: true }).click()
  await page.locator('.comment').getByText('일정과 계층을 확인했습니다.').waitFor()
  await page.getByLabel('연결할 이슈').selectOption(String(done.id))
  await page.getByRole('button', { name: '관계 추가', exact: true }).click()
  await page.locator('.relation-entry').getByText(`${done.key} API 구현`).waitFor()

  await nav('칸반')
  await page.getByLabel('보드 이슈 검색', { exact: true }).fill('일정')
  await page.getByLabel('보드 유형 필터').selectOption('STORY')
  await nav('이슈 목록')
  assert.equal(await page.getByLabel('이슈 검색', { exact: true }).inputValue(), '일정')
  assert.equal(await page.getByLabel('유형 필터', { exact: true }).inputValue(), 'STORY')
  await page.getByText('1개 결과 · 필터 적용', { exact: false }).waitFor()
  await nav('간트')
  assert.equal(await page.getByLabel('이슈 검색', { exact: true }).inputValue(), '일정')
  const epicRow = page.locator('.issue-select').filter({ hasText: '출시 계획' })
  await epicRow.waitFor()
  const accessibleName = await epicRow.getAttribute('aria-label')
  assert.ok(accessibleName.includes('10월 7일') && accessibleName.includes('10월 12일') && accessibleName.includes('60%'), 'Parent must aggregate child dates and progress')
  await epicRow.focus(); await page.keyboard.press('Enter')
  await page.getByRole('complementary', { name: '선택한 항목 상세' }).getByText('60% (하위 항목 집계)').waitFor()
  await page.locator('.issue-select').filter({ hasText: '일정 관리 구현' }).click()
  await page.getByRole('button', { name: `연결 이슈 ${done.key} 열기 →` }).waitFor()
  await page.getByLabel('시작 월', { exact: true }).fill('2026-10')
  await page.getByLabel('표시 기간', { exact: true }).selectOption('1')
  await page.getByLabel('확대', { exact: true }).selectOption('2')
  await page.getByLabel('진행선', { exact: true }).check()
  await page.getByLabel('담당자 열', { exact: true }).check()
  await page.getByLabel('보기 이름').fill('검증 보기')
  await page.getByRole('button', { name: '현재 보기 저장', exact: true }).click()
  await page.getByLabel('저장된 보기').locator('option').filter({ hasText: '검증 보기' }).waitFor({ state: 'attached' })
  await page.getByRole('button', { name: '필터 초기화', exact: true }).click()
  await page.getByLabel('확대', { exact: true }).selectOption('0')
  await page.getByLabel('저장된 보기').selectOption({ label: '검증 보기' })
  assert.equal(await page.getByLabel('확대', { exact: true }).inputValue(), '2')
  assert.equal(await page.getByLabel('이슈 검색', { exact: true }).inputValue(), '일정')
  await page.locator('.progress-overlay').waitFor()
  const png = await download('PNG')
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 470 + 31 * 34, 'PNG must include selected columns and month range')
  assert.ok(png.readUInt32BE(20) >= 222)
  const pdf = await download('PDF')
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  assert.ok(pdf.length > 1000)

  await page.getByRole('button', { name: '필터 초기화', exact: true }).click()
  await nav('칸반')
  const storyCard = await card('일정 관리 구현')
  await page.route(`**/api/projects/${projectId}/issues/${storyId}/status`, route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '검증용 충돌' }) }), { times: 1 })
  await storyCard.getByLabel('상태 변경').selectOption('IN_PROGRESS')
  await page.getByRole('alert').filter({ hasText: '검증용 충돌' }).waitFor()
  assert.equal(await storyCard.getByLabel('상태 변경').inputValue(), 'TODO')
  await storyCard.getByLabel('상태 변경').selectOption('IN_PROGRESS')
  await page.getByRole('region', { name: '진행 중 열' }).locator('.board-card').filter({ hasText: '일정 관리 구현' }).waitFor()
  await (await card('일정 관리 구현')).getByRole('button').click()
  await heading('일정 관리 구현')
  await page.getByRole('button', { name: '이슈 편집', exact: true }).click()
  await page.getByLabel('제목', { exact: true }).fill('보존할 편집 내용')
  const current = await api(`projects/${projectId}/issues/${storyId}`, undefined, ownerToken)
  await api(`projects/${projectId}/issues/${storyId}/status`, { status: 'REVIEW', version: current.version }, ownerToken, 'PATCH')
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '다른 사용자가 이슈를 변경했습니다.' }).waitFor()
  assert.equal(await page.getByLabel('제목', { exact: true }).inputValue(), '보존할 편집 내용')

  const sprint = await api(`projects/${projectId}/sprints`, { name: '첫 스프린트', goal: '검증 완료', startOn: '2026-10-01', endOn: '2026-10-14' }, ownerToken)
  await nav('백로그')
  await page.getByLabel(`${story.key} 스프린트 편성`, { exact: true }).selectOption(String(sprint.id))
  await api(`projects/${projectId}/issues/${done.id}/sprint`, { sprintId: sprint.id }, ownerToken, 'PUT')
  await nav('스프린트')
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '2개 이슈 · 8점으로 시작했습니다.' }).waitFor()

  await api('auth/register', { email: memberEmail, displayName: '검증 팀원', password })
  await page.goto(`${web}/verify?token=${await mailToken(memberEmail, 'Arc 이메일 확인')}`)
  await page.getByText('이메일 확인을 마쳤습니다. 로그인하세요.').waitFor()
  assert.equal(verificationRequests, 2)
  const memberToken = await login(memberEmail)
  await api(`auth/workspaces/${workspaceId}/invitations`, { email: memberEmail, role: 'MEMBER' }, ownerToken)
  await page.goto(`${web}/invite?token=${await mailToken(memberEmail, 'Arc 팀 초대')}`)
  await page.getByText('초대를 수락했습니다.', { exact: true }).waitFor()
  assert.equal(invitationRequests, 1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${web}/projects/${projectId}/sprints`)
  await heading('스프린트')
  assert.equal(await page.getByRole('button', { name: '스프린트 계획', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: '스프린트 종료', exact: true }).count(), 0)
  const status = (await card('일정 관리 구현')).getByLabel('상태 변경')
  await status.focus(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter')
  await page.waitForFunction(() => [...document.querySelectorAll('.board-card')].some(card => card.textContent.includes('일정 관리 구현') && card.querySelector('select').value === 'IN_PROGRESS'))
  assert.equal((await api(`projects/${projectId}/issues/${storyId}`, undefined, memberToken)).status, 'IN_PROGRESS')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page must not overflow horizontally')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(token => localStorage.setItem('arc-token', token), ownerToken)
  await page.goto(`${web}/projects/${projectId}/sprints`)
  await page.getByRole('button', { name: '스프린트 종료', exact: true }).click()
  await page.getByRole('button', { name: '종료 확정', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '2개 중 1개 완료 · 완료 3점 / 미완료 5점' }).waitFor()
  assert.equal((await api(`projects/${projectId}/issues/${storyId}`, undefined, ownerToken)).sprintId, null)
  await page.getByRole('button', { name: '결과 보기', exact: true }).click()
  await page.getByRole('dialog').getByText(`${story.key} · 일정 관리 구현 · 진행 중 · 5점`, { exact: true }).waitFor()
  assert.equal((await api(`projects/${projectId}/sprints/${sprint.id}/history`, undefined, ownerToken)).length, 2)

  await api(`projects/${projectId}`, { name: '제품 기능 검증', archived: true }, ownerToken, 'PUT')
  await page.goto(`${web}/projects/${projectId}/board`)
  await page.getByText('보관된 프로젝트입니다. 변경하려면 설정에서 복원하세요.').waitFor()
  assert.equal(await page.getByRole('button', { name: '이슈 만들기', exact: true }).isDisabled(), true)
  assert.equal(await (await card('일정 관리 구현')).getByLabel('상태 변경').isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log('Browser acceptance passed: email verification, workspace/project creation, issue/comment/relation, shared filters, hierarchy aggregation, saved view, PNG/PDF, failed move recovery, edit conflict, backlog/sprint, member permissions, mobile keyboard, archive')
  console.log(`Export files: ${output}`)
} finally {
  if (!workspaceId && ownerToken) workspaceId = (await api('auth/workspaces', undefined, ownerToken)).find(space => space.name === workspaceName)?.id
  if (workspaceId && ownerToken) await api(`auth/workspaces/${workspaceId}`, { confirmation: workspaceName }, ownerToken, 'DELETE')
  await browser.close()
  await http.dispose()
}
