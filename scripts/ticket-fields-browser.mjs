// Ticket forms, workspace field policy and draft safety against the built product.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium, request } from '../frontend/node_modules/playwright/index.mjs'
const { default: AxeBuilder } = await import(createRequire(new URL('../frontend/package.json', import.meta.url)).resolve('@axe-core/playwright'))

const web = (process.env.ARC_WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const backend = process.env.ARC_API_URL ?? 'http://localhost:8080/api/'
const mail = process.env.ARC_MAIL_URL ?? 'http://localhost:8025/api/v1/'
const suffix = Date.now().toString(36)
const output = join(process.env.ARC_TEST_OUTPUT ?? join(tmpdir(), `arc-browser-${suffix}`), 'ticket-fields')
mkdirSync(output, { recursive: true })
const http = await request.newContext({ baseURL: backend })
const executablePath = process.env.CHROMIUM_PATH === '' ? undefined : (process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined))
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Seoul' })
await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
const page = await context.newPage()
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const password = 'ticket-fields-browser-password-123'
const workspaceName = `Ticket forms ${suffix}`
let wid, pid, ownerToken

async function api(path, body, token = ownerToken, method = body === undefined ? 'GET' : 'POST', expected = 200) {
  const response = await http.fetch(path, { method, data: body, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const raw = await response.text()
  assert.equal(response.status(), expected, `${path}: ${raw.slice(0, 250)}`)
  return raw ? JSON.parse(raw) : undefined
}
async function mailToken(email) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listing = await (await http.get(`${mail}messages`)).json()
    const item = listing.messages.find(item => item.Subject === 'arcat 이메일 확인' && item.To.some(to => to.Address === email))
    if (item) return (await (await http.get(`${mail}message/${item.ID}`)).json()).Text.match(/token=([^\s]+)/)[1]
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Expected verification email for ${email}`)
}
async function account(email, displayName) {
  await api('auth/register', { email, displayName, password }, undefined)
  await api(`auth/verify?token=${await mailToken(email)}`, undefined, undefined, 'POST')
  return (await api('auth/login', { email, password }, undefined)).token
}
async function invite(email, token) {
  await api(`auth/workspaces/${wid}/invitations`, { email, role: 'MEMBER' })
  for (let attempt = 0; attempt < 20; attempt++) {
    const listing = await (await http.get(`${mail}messages`)).json()
    const item = listing.messages.find(item => item.Subject === 'arcat 팀 초대' && item.To.some(to => to.Address === email))
    if (item) {
      const mailBody = await (await http.get(`${mail}message/${item.ID}`)).json()
      await api(`auth/invitations/accept?token=${mailBody.Text.match(/token=([^\s]+)/)[1]}`, undefined, token, 'POST')
      return
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Expected workspace invitation')
}
async function as(token, path) {
  await page.goto(`${web}/login`)
  await page.evaluate(value => localStorage.setItem('arc-token', value), token)
  await page.goto(`${web}${path}`)
}
async function audit(name) {
  await page.evaluate(() => document.fonts.ready)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const violations = result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, reason: node.failureSummary })) }))
  writeFileSync(join(output, `accessibility-${name}.json`), JSON.stringify({ name, violations, passes: result.passes.length }, null, 2))
  assert.deepEqual(violations, [], `${name}: accessibility violations`)
}
async function reflow(name) {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: page overflow at ${width}`)
    const dialog = page.getByRole('dialog')
    if (await dialog.count()) assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${name}: dialog overflow at ${width}`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}
async function heading(name) { await page.getByRole('heading', { name, exact: true }).waitFor() }
async function createForm() {
  await page.goto(`${web}/projects/${pid}/board`)
  await heading('칸반 보드')
  await page.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('위험 메모', { exact: true }).waitFor()
  return form
}
async function edit(id) {
  await page.goto(`${web}/projects/${pid}/issues/${id}`)
  await page.getByRole('button', { name: '이슈 편집', exact: true }).click()
  await heading('티켓 계획 편집')
  return page.locator('form').filter({ has: page.getByRole('button', { name: '변경 저장', exact: true }) })
}
async function invalid(locator) { await page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-invalid') === 'true', await locator.getAttribute('id')) }
async function focused(locator) { await page.waitForFunction(id => document.activeElement?.id === id, await locator.getAttribute('id')) }

try {
  ownerToken = await account(`fields-ui-owner-${suffix}@example.com`, '양식 관리자')
  const developerEmail = `fields-ui-dev-${suffix}@example.com`
  const developerToken = await account(developerEmail, '양식 개발자')
  wid = (await api('auth/workspaces', { name: workspaceName })).id
  pid = (await api(`workspaces/${wid}/projects`, { name: '폼 상세 검증', key: 'FORMS' })).id
  await invite(developerEmail, developerToken)
  const developerId = (await api('auth/me', undefined, developerToken)).id
  const legacy = await api(`projects/${pid}/issues`, { title: '이전 양식의 담당 업무', type: 'TASK', assigneeId: developerId })
  const path = `auth/workspaces/${wid}/ticket-fields`
  let policy = await api(path)
  policy.customFields = [
    { key: 'risk_note', type: 'TEXT', label: '위험 메모', description: '검토할 위험을 적으세요.', active: true, required: true, order: 0, options: [] },
    { key: 'estimate_cost', type: 'NUMBER', label: '예상 비용', description: '0은 비용 없음입니다.', active: true, required: false, order: 1, options: [] },
    { key: 'review_day', type: 'DATE', label: '검토일', description: '', active: true, required: false, order: 2, options: [] },
    { key: 'delivery_channel', type: 'SELECT', label: '출시 채널', description: '', active: true, required: false, order: 3, options: [{ value: 'web', label: '웹', active: true }] },
  ]
  policy = await api(path, policy, ownerToken, 'PUT')
  await as(ownerToken, `/workspaces/${wid}/ticket-fields`)
  await heading('티켓 필드 설정')
  await page.getByRole('button', { name: '설정 저장', exact: true }).waitFor()
  await audit('field-settings')
  await reflow('field-settings')
  // Add a real typed field through the settings UI, keeping stable IDs opaque.
  await page.getByRole('button', { name: '커스텀 필드 추가', exact: true }).click()
  const addedField = page.locator('details.field-definition').last()
  await page.getByRole('button', { name: '설정 저장', exact: true }).click()
  await invalid(addedField.getByLabel('필드 이름', { exact: true }))
  await focused(addedField.getByLabel('필드 이름', { exact: true }))
  await addedField.getByLabel('필드 이름', { exact: true }).fill('검토 결과')
  await addedField.getByLabel('필드 타입', { exact: true }).selectOption('SELECT')
  await addedField.getByRole('button', { name: '선택지 추가', exact: true }).click()
  await addedField.getByLabel('선택지 1', { exact: true }).fill('검토 완료')
  const settingsSaved = page.waitForResponse(response => response.url().endsWith(`/api/${path}`) && response.request().method() === 'PUT')
  await page.getByRole('button', { name: '설정 저장', exact: true }).click()
  assert.equal((await settingsSaved).status(), 200)
  policy = await api(path)
  const reviewField = policy.customFields.find(field => field.label === '검토 결과')
  assert.equal(reviewField.type, 'SELECT')
  assert.equal(reviewField.options[0].label, '검토 완료')
  // Settings themselves use a revision: a conflict keeps the local definition draft.
  const riskDefinition = page.locator('details.field-definition').filter({ has: page.locator('summary strong', { hasText: /^위험 메모$/ }) })
  await riskDefinition.locator('summary').click()
  await riskDefinition.getByLabel('필드 이름', { exact: true }).fill('검토 위험 초안')
  policy.standardFields.find(item => item.key === 'description').description = '다른 관리자가 변경한 설정'
  policy = await api(path, policy, ownerToken, 'PUT')
  const settingsConflict = page.waitForResponse(response => response.url().endsWith(`/api/${path}`) && response.request().method() === 'PUT')
  await page.getByRole('button', { name: '설정 저장', exact: true }).click()
  assert.equal((await settingsConflict).status(), 409)
  const draftDefinition = page.locator('details.field-definition').filter({ has: page.locator('summary strong', { hasText: /^검토 위험 초안$/ }) })
  assert.equal(await draftDefinition.getByLabel('필드 이름', { exact: true }).inputValue(), '검토 위험 초안')
  await page.getByRole('button', { name: '최신 설정 확인', exact: true }).click()
  await page.getByRole('button', { name: '최신 설정에서 다시 편집', exact: true }).click()
  await page.getByText('충돌 전 작성한 내용 확인', { exact: true }).waitFor()
  assert.equal((await api(path)).customFields.find(item => item.key === 'risk_note').label, '위험 메모')

  let form = await createForm()
  await form.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  await invalid(form.getByLabel('제목', { exact: true }))
  await invalid(form.getByLabel('위험 메모', { exact: true }))
  await focused(form.getByLabel('제목', { exact: true }))
  await audit('ticket-errors')
  await page.setViewportSize({ width: 360, height: 900 })
  await audit('ticket-errors-mobile')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await form.getByLabel('제목', { exact: true }).fill('입력 검증과 0 저장')
  await form.getByLabel('위험 메모', { exact: true }).fill('디자인과 정책 검토')
  await form.getByLabel('완료율', { exact: true }).fill('')
  await form.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  await invalid(form.getByLabel('완료율', { exact: true }))
  await form.getByLabel('완료율', { exact: true }).fill('0')
  await form.getByLabel('시작일', { exact: true }).fill('2026-10-20')
  await form.getByLabel('완료일', { exact: true }).fill('2026-10-10')
  await form.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  await invalid(form.getByLabel('완료일', { exact: true }))
  await form.getByLabel('완료일', { exact: true }).fill('2026-10-21')
  await form.getByLabel('예상 비용', { exact: true }).fill('0')
  await form.getByLabel('검토 결과', { exact: true }).selectOption(reviewField.options[0].value)
  await audit('ticket-create')
  await reflow('ticket-create')
  await form.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  await heading('입력 검증과 0 저장')
  const ticketId = Number(new URL(page.url()).pathname.split('/').at(-1))
  let ticket = await api(`projects/${pid}/issues/${ticketId}`)
  assert.equal(ticket.customFields.estimate_cost, 0)
  assert.equal(ticket.customFields[reviewField.key], reviewField.options[0].value)
  assert.equal(ticket.progress, 0)
  await heading('추가 정보')

  // Empty optional numeric input saves null, while a zero remains a real value.
  form = await edit(ticketId)
  await form.getByLabel('예상 비용', { exact: true }).fill('')
  await form.getByRole('button', { name: '변경 저장', exact: true }).click()
  await page.getByRole('button', { name: '이슈 편집', exact: true }).waitFor()
  ticket = await api(`projects/${pid}/issues/${ticketId}`)
  assert.equal(ticket.customFields.estimate_cost, null)

  // Settings changed elsewhere: reject stale policy and preserve every unsaved value.
  form = await createForm()
  await form.getByLabel('제목', { exact: true }).fill('설정 충돌 후 유지한 초안')
  await form.getByLabel('위험 메모', { exact: true }).fill('초안을 보존하세요')
  policy.standardFields.find(item => item.key === 'description').description = '변경된 설명 안내'
  policy = await api(path, policy, ownerToken, 'PUT')
  const policyConflict = page.waitForResponse(response => response.url().endsWith(`/api/projects/${pid}/issues`) && response.request().method() === 'POST')
  await form.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  assert.equal((await policyConflict).status(), 409)
  await form.getByRole('button', { name: '필드 설정 다시 확인', exact: true }).waitFor()
  assert.equal(await form.getByLabel('제목', { exact: true }).inputValue(), '설정 충돌 후 유지한 초안')
  assert.equal(await form.getByLabel('위험 메모', { exact: true }).inputValue(), '초안을 보존하세요')
  await form.getByRole('button', { name: '필드 설정 다시 확인', exact: true }).click()
  await form.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  await heading('설정 충돌 후 유지한 초안')

  // Optimistic ticket conflict preserves the draft and blocks accidental overwrite.
  form = await edit(ticketId)
  await form.getByLabel('제목', { exact: true }).fill('저장되지 않은 티켓 초안')
  ticket = await api(`projects/${pid}/issues/${ticketId}`)
  await api(`projects/${pid}/issues/${ticketId}`, { ...ticket, title: '다른 관리자의 변경' }, ownerToken, 'PUT')
  const ticketConflict = page.waitForResponse(response => response.url().endsWith(`/api/projects/${pid}/issues/${ticketId}`) && response.request().method() === 'PUT')
  await form.getByRole('button', { name: '변경 저장', exact: true }).click()
  assert.equal((await ticketConflict).status(), 409)
  await form.getByRole('link', { name: '최신 티켓 확인 (새 창)', exact: true }).waitFor()
  assert.equal(await form.getByLabel('제목', { exact: true }).inputValue(), '저장되지 않은 티켓 초안')
  assert.equal(await form.getByRole('button', { name: '변경 저장', exact: true }).isEnabled(), false, 'Conflicting ticket must not silently advance its version and overwrite')
  assert.equal((await api(`projects/${pid}/issues/${ticketId}`)).title, '다른 관리자의 변경')

  // Failed sprint operations must report inside the open dialog and retain its inputs.
  await page.goto(`${web}/projects/${pid}/sprints`)
  await heading('스프린트')
  await page.getByRole('button', { name: '스프린트 계획', exact: true }).click()
  let sprintDialog = page.getByRole('dialog', { name: '스프린트 계획' })
  await sprintDialog.getByLabel('스프린트 이름', { exact: true }).fill('실패 초안을 보존한 스프린트')
  await sprintDialog.getByLabel('목표', { exact: true }).fill('오류가 있어도 입력을 보존합니다.')
  await sprintDialog.getByLabel('시작일', { exact: true }).fill('2026-10-10')
  await sprintDialog.getByLabel('종료일', { exact: true }).fill('2026-10-20')
  const sprintCreateRoute = `**/api/projects/${pid}/sprints`
  await page.route(sprintCreateRoute, route => route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '계획 저장 실패 검증' }) }) : route.continue())
  await sprintDialog.getByRole('button', { name: '계획 저장', exact: true }).click()
  await sprintDialog.getByRole('alert').getByText('계획 저장 실패 검증', { exact: true }).waitFor()
  assert.equal(await sprintDialog.getByLabel('스프린트 이름', { exact: true }).inputValue(), '실패 초안을 보존한 스프린트')
  assert.equal(await sprintDialog.getByLabel('목표', { exact: true }).inputValue(), '오류가 있어도 입력을 보존합니다.')
  await audit('sprint-create-error')
  await reflow('sprint-create-error')
  await page.unroute(sprintCreateRoute)
  await sprintDialog.getByRole('button', { name: '계획 저장', exact: true }).click()
  await sprintDialog.waitFor({ state: 'detached' })
  const plannedSprint = (await api(`projects/${pid}/sprints`)).find(sprint => sprint.name === '실패 초안을 보존한 스프린트')
  const nextSprint = await api(`projects/${pid}/sprints`, { name: '실패 후 이동할 스프린트', startOn: '2026-10-21', endOn: '2026-10-31' })
  await page.reload()
  await page.locator('.sprint-tile').filter({ hasText: plannedSprint.name }).getByRole('button', { name: '시작', exact: true }).click()
  await page.locator('.active-sprint').getByRole('heading', { name: plannedSprint.name, exact: true }).waitFor()
  await page.getByRole('button', { name: '스프린트 종료', exact: true }).click()
  sprintDialog = page.getByRole('dialog', { name: '스프린트 종료' })
  await sprintDialog.getByLabel('이동할 곳', { exact: true }).selectOption(String(nextSprint.id))
  const sprintCloseRoute = `**/api/projects/${pid}/sprints/${plannedSprint.id}/close`
  await page.route(sprintCloseRoute, route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '스프린트 종료 실패 검증' }) }))
  await sprintDialog.getByRole('button', { name: '종료 확정', exact: true }).click()
  await sprintDialog.getByRole('alert').getByText('스프린트 종료 실패 검증', { exact: true }).waitFor()
  assert.equal(await sprintDialog.getByLabel('이동할 곳', { exact: true }).inputValue(), String(nextSprint.id))
  assert.equal((await api(`projects/${pid}/sprints`)).find(sprint => sprint.id === plannedSprint.id).status, 'ACTIVE')
  await audit('sprint-close-error')
  await page.unroute(sprintCloseRoute)
  await sprintDialog.getByRole('button', { name: '종료 확정', exact: true }).click()
  await sprintDialog.waitFor({ state: 'detached' })
  assert.equal((await api(`projects/${pid}/sprints`)).find(sprint => sprint.id === plannedSprint.id).status, 'CLOSED')

  await as(developerToken, `/workspaces/${wid}/ticket-fields`)
  await heading('티켓 필드 설정')
  assert.equal(await page.getByRole('button', { name: '설정 저장', exact: true }).count(), 0, 'Member may read policy but cannot save')
  await as(developerToken, `/projects/${pid}/issues/${legacy.id}`)
  await page.getByRole('button', { name: '진행 상황 수정', exact: true }).click()
  form = page.getByRole('form', { name: '담당 티켓 진행 상황 수정' })
  await form.getByLabel('완료율', { exact: true }).fill('')
  await form.getByRole('button', { name: '진행 상황 저장', exact: true }).click()
  await invalid(form.getByLabel('완료율', { exact: true }))
  await form.getByLabel('완료율', { exact: true }).fill('55')
  await audit('execution-form')
  await reflow('execution-form')
  await form.getByRole('button', { name: '진행 상황 저장', exact: true }).click()
  await page.getByRole('button', { name: '진행 상황 수정', exact: true }).waitFor()
  const executed = await api(`projects/${pid}/issues/${legacy.id}`)
  assert.equal(executed.progress, 55)
  assert.deepEqual(executed.customFields, {}, 'A new required plan field cannot block execution')

  // Untrusted JSON must become a visible query failure, never unchecked form state.
  await page.route(`**/api/${path}`, route => route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workspaceId: wid, revision: 'invalid', standardFields: [], customFields: [] }) }) : route.continue())
  await as(ownerToken, `/workspaces/${wid}/ticket-fields`)
  await heading('티켓 필드 설정')
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('button', { name: '설정 저장', exact: true }).count(), 0)
  await page.unroute(`**/api/${path}`)
  assert.deepEqual(errors, [], 'No uncaught browser errors')
  console.log('Ticket field browser acceptance passed: settings API, accessible form errors/reflow, zero/null, policy and ticket draft conflicts, member read-only, execution bypass, runtime schema failure')
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await context.tracing.stop({ path: join(output, 'trace.zip') }).catch(() => {})
  if (wid && ownerToken) await api(`auth/workspaces/${wid}`, { confirmation: workspaceName }, ownerToken, 'DELETE').catch(error => console.error('Fixture cleanup failed:', error.message))
  await browser.close()
  await http.dispose()
}
