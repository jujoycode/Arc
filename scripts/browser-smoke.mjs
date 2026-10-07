// Full user flow against local API/MySQL/Mailpit. Creates and deletes its own workspace.
import { chromium, request } from '../frontend/node_modules/playwright/index.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const { default: AxeBuilder } = await import(createRequire(new URL('../frontend/package.json', import.meta.url)).resolve('@axe-core/playwright'))
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'

const web = process.env.ARC_WEB_URL ?? 'http://localhost:5173'
const backend = process.env.ARC_API_URL ?? 'http://localhost:8080/api/'
const mail = process.env.ARC_MAIL_URL ?? 'http://localhost:8025/api/v1/'
const http = await request.newContext({ baseURL: backend })
const executablePath = process.env.CHROMIUM_PATH === '' ? undefined : (process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined))
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Seoul' })
const page = await context.newPage()
await page.context().tracing.start({ screenshots: true, snapshots: true, sources: true })
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
const output = process.env.ARC_TEST_OUTPUT ?? join(tmpdir(), `arc-browser-${suffix}`)
mkdirSync(output, { recursive: true })

async function audit(name) {
  await page.evaluate(() => document.fonts.ready)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const violations = result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, reason: node.failureSummary })) }))
  writeFileSync(join(output, `accessibility-${name}.json`), JSON.stringify({ name, violations, passes: result.passes.length, incomplete: result.incomplete.length }, null, 2))
  assert.deepEqual(violations, [], `${name}: accessibility violations`)
}
async function reflow(name) {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} must reflow at ${width}px`)
  }
  // 1440 physical pixels / 2 = 720 CSS pixels: desktop 200% zoom reflow viewport.
  const session = await context.newCDPSession(page)
  await session.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 500, deviceScaleFactor: 2, mobile: false })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} must reflow at a 200% equivalent viewport`)
  await session.send('Emulation.clearDeviceMetricsOverride')
  await session.detach()
  await page.setViewportSize({ width: 1440, height: 1000 })
}

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
  await audit('issue-create')
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

  // Parent collapse hides the whole branch; nested state survives outer folds.
  const issueRow = title => page.locator('.issue-row').filter({ has: page.locator('.issue-title').filter({ hasText: title }) })
  const fold = (key, title, expanded) => page.getByRole('button', { name: `${key} ${title} 하위 항목 ${expanded ? '접기' : '펼치기'}`, exact: true })
  await page.getByRole('button', { name: '필터 초기화', exact: true }).click()
  await issueRow('날짜 계산').waitFor()
  const allRowCount = await page.locator('.issue-row').count()
  const allBarCount = await page.locator('.schedule-bar').count()
  const relationCount = await page.locator('.relation-overlay:not(.progress-overlay) g').count()
  assert.equal(relationCount, 1)
  assert.equal(await page.getByRole('button', { name: '모두 펼치기', exact: true }).isDisabled(), true)
  const depthPadding = title => issueRow(title).locator('.issue-name').evaluate(element => parseFloat(getComputedStyle(element).paddingLeft))
  assert.ok(await depthPadding('출시 계획') < await depthPadding(story.title))
  assert.ok(await depthPadding(story.title) < await depthPadding('날짜 계산'), 'Indentation follows the parent hierarchy')
  await fold(epic.key, '출시 계획', true).click()
  await issueRow(story.title).waitFor({ state: 'detached' })
  assert.equal(await issueRow('날짜 계산').count(), 0, 'Outer collapse hides grandchildren too')
  assert.equal(await page.locator('.issue-row').count(), allRowCount - 2)
  assert.equal(await page.locator('.schedule-bar').count(), allBarCount - 2)
  assert.equal(await issueRow('API 구현').isVisible(), true)
  await fold(epic.key, '출시 계획', false).click()
  await issueRow('날짜 계산').waitFor()
  await fold(story.key, story.title, true).focus()
  await page.keyboard.press('Enter')
  await issueRow('날짜 계산').waitFor({ state: 'detached' })
  assert.equal(await fold(story.key, story.title, false).getAttribute('aria-expanded'), 'false')
  assert.equal(await issueRow(story.title).locator('.collapsed-label').textContent(), ' · 접힘')
  assert.equal(await page.locator('.schedule-bar').count(), allBarCount - 1)
  await fold(epic.key, '출시 계획', true).focus()
  await page.keyboard.press('Space')
  await issueRow(story.title).waitFor({ state: 'detached' })
  assert.equal(await issueRow('출시 계획').isVisible(), true)
  assert.equal(await issueRow('API 구현').isVisible(), true, 'Unrelated branches stay visible')
  assert.equal(await page.locator('.relation-overlay:not(.progress-overlay) g').count(), 0, 'Hidden endpoints must not draw relations')
  await fold(epic.key, '출시 계획', false).click()
  await issueRow(story.title).waitFor()
  assert.equal(await fold(story.key, story.title, false).getAttribute('aria-expanded'), 'false')
  assert.equal(await issueRow('날짜 계산').count(), 0)
  assert.equal(await page.locator('.relation-overlay:not(.progress-overlay) g').count(), relationCount)
  await fold('v1.0', 'v1.0', true).click()
  await issueRow('출시 계획').waitFor({ state: 'detached' })
  assert.equal(await issueRow('API 구현').isVisible(), true)
  await fold('v1.0', 'v1.0', false).click()
  await issueRow(story.title).waitFor()
  assert.equal(await fold(story.key, story.title, false).getAttribute('aria-expanded'), 'false')
  await fold('CHECK', '제품 기능 검증', true).click()
  await issueRow('API 구현').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.issue-row').count(), 1)
  await fold('CHECK', '제품 기능 검증', false).click()
  await issueRow(story.title).waitFor()
  assert.equal(await fold(story.key, story.title, false).getAttribute('aria-expanded'), 'false')
  await page.getByLabel('이슈 검색', { exact: true }).fill('날짜 계산')
  await issueRow('API 구현').waitFor({ state: 'detached' })
  assert.equal(await issueRow('출시 계획').isVisible(), true, 'Filtering retains ancestors')
  assert.equal(await issueRow('날짜 계산').count(), 0, 'Filtering does not override a parent fold')
  await page.getByRole('button', { name: '필터 초기화', exact: true }).click()
  await issueRow('API 구현').waitFor()
  assert.equal(await fold(story.key, story.title, false).getAttribute('aria-expanded'), 'false')
  assert.equal(await epicRow.getAttribute('aria-label'), accessibleName, 'Collapse must preserve aggregate dates and progress')
  await page.getByRole('button', { name: '모두 접기', exact: true }).click()
  await issueRow('API 구현').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.issue-row').count(), 1)
  assert.equal(await page.getByRole('button', { name: '모두 접기', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '모두 펼치기', exact: true }).click()
  await issueRow('날짜 계산').waitFor()
  assert.equal(await page.locator('.issue-row').count(), allRowCount)
  assert.equal(await page.locator('.schedule-bar').count(), allBarCount)
  assert.equal(await page.getByRole('button', { name: '모두 펼치기', exact: true }).isDisabled(), true)
  await page.getByLabel('이슈 검색', { exact: true }).fill('일정')
  await page.locator('#kind-filter').selectOption('STORY')

  await page.getByLabel('시작 월', { exact: true }).fill('2026-10')
  await page.getByLabel('표시 기간', { exact: true }).selectOption('1')
  await page.getByLabel('확대', { exact: true }).selectOption('2')
  await page.getByText('표시 옵션', { exact: true }).click()
  await page.getByLabel('진행선', { exact: true }).check()
  await page.getByLabel('담당자 열', { exact: true }).check()
  await page.getByText('개인 보기 저장 · 불러오기', { exact: true }).click()
  await page.getByLabel('보기 이름').fill('검증 보기')
  await page.getByRole('button', { name: '현재 보기 저장', exact: true }).click()
  await page.getByLabel('저장된 보기').locator('option').filter({ hasText: '검증 보기' }).waitFor({ state: 'attached' })
  await page.getByRole('button', { name: '필터 초기화', exact: true }).click()
  await page.getByLabel('확대', { exact: true }).selectOption('0')
  await page.getByLabel('저장된 보기').selectOption({ label: '검증 보기' })
  assert.equal(await page.getByLabel('확대', { exact: true }).inputValue(), '2')
  assert.equal(await page.getByLabel('이슈 검색', { exact: true }).inputValue(), '일정')
  await page.locator('.progress-overlay').waitFor()
  await page.getByRole('button', { name: '필터 초기화', exact: true }).click()
  await issueRow('날짜 계산').waitFor()
  await fold(story.key, story.title, true).click()
  await issueRow('날짜 계산').waitFor({ state: 'detached' })
  const exportedRowCount = await page.locator('.issue-row').count()
  assert.equal(exportedRowCount, allRowCount - 1)
  await audit('gantt-hierarchy')
  await page.screenshot({ path: join(output, 'gantt-hierarchy-collapsed.png'), fullPage: true })
  const png = await download('PNG')
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 470 + 31 * 34, 'PNG must include selected columns and month range')
  assert.equal(png.readUInt32BE(20), 72 + exportedRowCount * 48, 'PNG must omit collapsed descendants')
  const pdf = await download('PDF')
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  assert.ok(pdf.length > 1000)
  await page.getByRole('button', { name: '모두 펼치기', exact: true }).click()
  await issueRow('날짜 계산').waitFor()

  // WBS is a different view of the same tickets, with stable codes under filters.
  await nav('WBS')
  await heading('WBS')
  const wbsRow = id => page.locator(`.wbs-row[data-ticket-id="${id}"]`)
  await wbsRow(subtask.id).waitFor()
  assert.equal(await wbsRow(epic.id).locator('.wbs-code').textContent(), '1')
  assert.equal(await wbsRow(storyId).locator('.wbs-code').textContent(), '1.1')
  assert.equal(await wbsRow(subtask.id).locator('.wbs-code').textContent(), '1.1.1')
  assert.ok((await wbsRow(epic.id).textContent()).includes('60%'), 'WBS matches Gantt aggregation')
  await page.getByLabel('전체 작업 범위').getByText('말단 완료').waitFor()
  assert.ok((await page.getByLabel('전체 작업 범위').textContent()).includes('1 / 2'))
  assert.ok((await page.getByLabel('전체 작업 범위').textContent()).includes('미추정 1개'), 'Parent story points are not double counted')
  const foldWork = (key, title, expanded) => page.getByRole('button', { name: `${key} ${title} 하위 티켓 ${expanded ? '접기' : '펼치기'}`, exact: true })
  await foldWork(story.key, story.title, true).focus(); await page.keyboard.press('Enter')
  await wbsRow(subtask.id).waitFor({ state: 'detached' })
  await foldWork(epic.key, '출시 계획', true).click()
  await wbsRow(storyId).waitFor({ state: 'detached' })
  assert.equal(await wbsRow(done.id).isVisible(), true)
  await foldWork(epic.key, '출시 계획', false).click()
  await wbsRow(storyId).waitFor()
  assert.equal(await wbsRow(subtask.id).count(), 0, 'WBS retains nested folds')
  await page.getByLabel('WBS 이슈 검색', { exact: true }).fill('날짜 계산')
  await page.getByText('1개 일치 · 2개 표시', { exact: false }).waitFor()
  assert.equal(await wbsRow(epic.id).getByText('상위 맥락').isVisible(), true)
  await foldWork(story.key, story.title, false).click()
  await wbsRow(subtask.id).waitFor()
  assert.equal(await wbsRow(subtask.id).locator('.wbs-code').textContent(), '1.1.1')
  assert.ok((await wbsRow(epic.id).textContent()).includes('60%'))
  await page.getByRole('button', { name: '필터 초기화', exact: true }).click()
  await page.getByRole('button', { name: '모두 접기', exact: true }).click()
  assert.equal(await page.locator('.wbs-row').count(), 2)
  await page.getByRole('button', { name: '모두 펼치기', exact: true }).click()
  await wbsRow(subtask.id).waitFor()
  await page.getByRole('button', { name: `${story.key} 하위 티켓 추가`, exact: true }).click()
  await audit('wbs-child-create')
  const childForm = page.getByRole('dialog')
  assert.equal(await childForm.getByLabel('유형', { exact: true }).inputValue(), 'SUBTASK')
  assert.equal(await childForm.getByLabel('부모 이슈', { exact: true }).inputValue(), String(storyId))
  await childForm.getByLabel('제목', { exact: true }).fill('WBS에서 분해한 티켓')
  await childForm.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  await heading('WBS에서 분해한 티켓')
  const childId = Number(new URL(page.url()).pathname.split('/').at(-1))
  const childTicket = await api(`projects/${projectId}/issues/${childId}`, undefined, ownerToken)
  assert.equal(childTicket.parentId, storyId)
  assert.equal(childTicket.versionId, release.id)
  await nav('WBS'); await wbsRow(childId).waitFor()
  assert.equal(await wbsRow(childId).locator('.wbs-code').textContent(), '1.1.2')
  await audit('wbs'); await reflow('wbs')
  await nav('간트'); await issueRow('WBS에서 분해한 티켓').waitFor()
  await api(`projects/${projectId}/issues/${childId}`, undefined, ownerToken, 'DELETE')
  await page.reload(); await issueRow('WBS에서 분해한 티켓').waitFor({ state: 'detached' })

  await page.getByRole('button', { name: '필터 초기화', exact: true }).click()
  await nav('칸반')
  const storyCard = await card('일정 관리 구현')
  // Keep interception active while the failed mutation starts its refetch.
  // Expiring the route at fulfillment can leave a concurrent request paused.
  let failNextMove = true
  await page.route(`**/api/projects/${projectId}/issues/${storyId}/status`, async route => {
    if (failNextMove) {
      failNextMove = false
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '검증용 충돌' }) })
    } else {
      await route.continue()
    }
  })
  await storyCard.getByLabel('상태 변경').selectOption('IN_PROGRESS')
  await page.getByRole('alert').filter({ hasText: '검증용 충돌' }).waitFor()
  assert.equal(await storyCard.getByLabel('상태 변경').inputValue(), 'TODO')
  await storyCard.getByLabel('상태 변경').selectOption('IN_PROGRESS')
  await page.getByRole('region', { name: '진행 중 열' }).locator('.board-card').filter({ hasText: '일정 관리 구현' }).waitFor()
  await (await card('일정 관리 구현')).getByRole('link').click()
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
  const orderBefore = await page.locator('.backlog-row small').allTextContents()
  let failNextOrder = true
  await page.route(`**/api/projects/${projectId}/backlog/order`, async route => {
    if (failNextOrder && route.request().method() === 'PUT') {
      failNextOrder = false
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '백로그 정렬 충돌 검증' }) })
    } else await route.continue()
  })
  await page.getByRole('button', { name: `${epic.key} 아래로`, exact: true }).click()
  await page.getByRole('alert').getByText('백로그 정렬 충돌 검증').waitFor()
  await page.waitForFunction(key => !document.querySelector(`[aria-label="${key} 아래로"]`)?.disabled, epic.key)
  assert.deepEqual(await page.locator('.backlog-row small').allTextContents(), orderBefore, 'Failed ordering must preserve the visible backlog')
  await page.getByRole('button', { name: `${epic.key} 아래로`, exact: true }).click()
  await page.waitForFunction(key => document.querySelector('.backlog-row small')?.textContent?.startsWith(key), story.key)
  assert.equal(await page.getByRole('alert').count(), 0, 'Successful retry clears the ordering error')
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

  await page.keyboard.press('Escape')
  if (process.env.ARC_PROVIDER_FIXTURE_URL) {
    await page.goto(`${web}/projects/${projectId}/settings`)
    await heading('프로젝트와 팀 설정')
    const integration = page.locator('.integration-settings')
    await integration.getByLabel('저장소 경로', { exact: true }).fill('arc-fixture/repo')
    await integration.getByLabel('저장소 접근 토큰', { exact: true }).fill('arc-fixture-token-123')
    const webhookSecret = 'browser-fixture-secret-1234567890abcdefgh'
    await integration.getByLabel('웹훅 검증키', { exact: true }).fill(webhookSecret)
    await integration.getByRole('button', { name: '저장소 연결 저장', exact: true }).click()
    await integration.getByRole('status').filter({ hasText: '저장소를 연결했습니다.' }).waitFor()
    assert.equal(await integration.getByLabel('저장소 접근 토큰', { exact: true }).inputValue(), '')
    const connection = (await api(`projects/${projectId}/repository-connections`, undefined, ownerToken)).items.find(item => item.provider === 'GITHUB')
    const raw = JSON.stringify({ repository: { id: 101 }, commits: [{ id: 'c'.repeat(40), message: `${story.key} Browser 연결`, timestamp: '2026-10-06T12:00:00Z' }] })
    const response = await http.post(`integrations/webhooks/${connection.id}`, { data: raw, headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'push', 'X-GitHub-Delivery': `browser-${suffix}`, 'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', webhookSecret).update(raw).digest('hex') } })
    assert.equal(response.status(), 202)
    let linked = []
    for (let attempt = 0; attempt < 30; attempt++) {
      linked = await api(`projects/${projectId}/issues/${storyId}/development-links`, undefined, ownerToken)
      if (linked.length) break
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert.equal(linked.length, 1)
    await page.goto(`${web}/projects/${projectId}/issues/${storyId}`)
    await heading('일정 관리 구현')
    await page.locator('.development-list a').filter({ hasText: `${story.key} Browser 연결` }).waitFor()
    assert.equal(await page.locator('.development-list a').getAttribute('href'), 'https://github.com/arc-fixture/repo/commit/' + 'c'.repeat(40))
    await audit('development-links')
    await reflow('development-links')
    await page.goto(`${web}/projects/${projectId}/settings`)
    await integration.getByRole('button', { name: '전달 기록 보기', exact: true }).click()
    await integration.locator('.delivery-records').getByText(/push · 처리됨/).waitFor()
    await audit('repository-connections')
    await reflow('repository-connections')
  }
  for (const view of ['gantt', 'board', 'backlog', 'sprints', 'issues', 'settings']) {
    await page.goto(`${web}/projects/${projectId}/${view}`)
    await page.locator('h1').waitFor()
    await page.locator('.loading-state').waitFor({ state: 'detached' })
    await audit(view)
    await reflow(view)
  }
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await page.goto(`${web}/projects/${projectId}/gantt`)
  await page.getByRole('button', { name: '이슈 만들기', exact: true }).waitFor()
  await page.getByText('표시 옵션', { exact: true }).focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.getByLabel('진행선', { exact: true }).isVisible(), true)
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' })

  await api(`projects/${projectId}`, { name: '제품 기능 검증', archived: true }, ownerToken, 'PUT')
  await page.goto(`${web}/projects/${projectId}/board`)
  await page.getByText('보관된 프로젝트입니다. 변경하려면 설정에서 복원하세요.').waitFor()
  assert.equal(await page.getByRole('button', { name: '이슈 만들기', exact: true }).isDisabled(), true)
  assert.equal(await (await card('일정 관리 구현')).getByLabel('상태 변경').isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log('Browser acceptance passed: email verification, workspace/project creation, issue/comment/relation, shared filters, nested hierarchy collapse and aggregation, saved view, collapsed PNG/PDF, failed move recovery, edit conflict, backlog/sprint, member permissions, mobile keyboard, accessibility, responsive/zoom reflow, forced colors, archive')
  console.log(`Export files: ${output}`)
  await page.context().tracing.stop()
} catch (error) {
  await Promise.allSettled([
    page.screenshot({ path: join(output, 'failure.png'), fullPage: true }),
    page.context().tracing.stop({ path: join(output, 'trace.zip') }),
  ])
  throw error
} finally {
  try {
    if (!workspaceId && ownerToken) workspaceId = (await api('auth/workspaces', undefined, ownerToken)).find(space => space.name === workspaceName)?.id
    if (workspaceId && ownerToken) await api(`auth/workspaces/${workspaceId}`, { confirmation: workspaceName }, ownerToken, 'DELETE')
  } finally {
    await browser.close()
    await http.dispose()
  }
}
