// Calico identity, responsive color contrast and privacy-aware pointer behavior.
// Runs against the built product and removes its own workspace after the check.
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
const output = join(process.env.ARC_TEST_OUTPUT ?? join(tmpdir(), `arc-browser-${suffix}`), 'calico-brand')
mkdirSync(output, { recursive: true })
const http = await request.newContext({ baseURL: backend })
const executablePath = process.env.CHROMIUM_PATH === '' ? undefined : (process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined))
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' })
await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
const page = await context.newPage()
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const results = { accessibility: [], pointer: {}, poses: {}, assets: [] }
const password = 'calico-browser-password-123'
const email = `calico-browser-${suffix}@example.com`
const workspaceName = `Calico brand ${suffix}`
let wid, pid, ownerToken

async function api(path, body, token = ownerToken, method = body === undefined ? 'GET' : 'POST', expected = 200) {
  const response = await http.fetch(path, { method, data: body, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const raw = await response.text()
  assert.equal(response.status(), expected, `${path}: ${raw.slice(0, 250)}`)
  return raw ? JSON.parse(raw) : undefined
}
async function mailToken() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listing = await (await http.get(`${mail}messages`)).json()
    const item = listing.messages.find(item => item.Subject === 'arcat 이메일 확인' && item.To.some(to => to.Address === email))
    if (item) return (await (await http.get(`${mail}message/${item.ID}`)).json()).Text.match(/token=([^\s]+)/)[1]
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Expected the local account verification email')
}
async function heading(name) { await page.getByRole('heading', { name, exact: true }).waitFor() }
async function frames(target = page) {
  await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function loadedImages(target = page) {
  await target.waitForFunction(() => [...document.querySelectorAll('.arcat-brand img, .arcat-mascot-picture img')].every(image => image.complete && image.naturalWidth > 0))
  const assets = await target.locator('.arcat-brand img, .arcat-mascot-picture img').evaluateAll(images => images.map(image => ({ src: new URL(image.currentSrc).pathname, width: image.naturalWidth, height: image.naturalHeight, alt: image.alt })))
  assert.ok(assets.length, 'The current screen supplies the brand artwork')
  assert.ok(assets.every(image => image.alt === ''), 'Decorative artwork does not duplicate visible text')
  results.assets.push(...assets)
  return assets
}
async function auditScreen(name) {
  for (const width of [1920, 768, 360]) {
    await page.setViewportSize({ width, height: 1080 })
    await page.evaluate(() => document.fonts.ready)
    await loadedImages()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no document overflow at ${width}px`)
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    const violations = result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, reason: node.failureSummary })) }))
    const report = { name, width, violations, passes: result.passes.length, incomplete: result.incomplete.length }
    results.accessibility.push(report)
    writeFileSync(join(output, `accessibility-${name}-${width}.json`), JSON.stringify(report, null, 2))
    await page.screenshot({ path: join(output, `${name}-${width}.png`) })
    assert.deepEqual(violations, [], `${name} at ${width}px: accessibility violations`)
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
}
const mascot = target => target.locator('.arcat-welcome-panel .arcat-mascot[data-interactive="true"]')
async function offsets(figure) {
  return figure.evaluate(node => {
    const picture = node.querySelector('.arcat-mascot-picture') ?? node
    const style = getComputedStyle(picture)
    return Object.fromEntries(['x', 'y', 'pupil-x', 'pupil-y'].map(key => {
      const property = key.startsWith('pupil') ? `--arcat-${key}` : `--arcat-pointer-${key}`
      // Detached nodes lack computed styles; inspect the retained element too.
      return [key, Number.parseFloat(style.getPropertyValue(property) || picture.style.getPropertyValue(property)) || 0]
    }))
  })
}
function centered(value, label) { assert.ok(Object.values(value).every(number => Math.abs(number) < .01), `${label}: artwork returns to its neutral pose`) }
function bounded(value, label) {
  assert.ok(Math.abs(value.x) <= 12 && Math.abs(value.y) <= 12, `${label}: body movement remains small`)
  assert.ok(Math.abs(value['pupil-x']) <= 6 && Math.abs(value['pupil-y']) <= 6, `${label}: eyes remain inside their outlines`)
}
async function tracking(target, active) {
  await target.waitForFunction(expected => document.querySelector('.arcat-welcome-panel .arcat-mascot')?.dataset.tracking === expected, active ? 'active' : 'inactive')
}
async function pose(name, selector) {
  const picture = page.locator(selector).locator('.arcat-mascot-picture img').first()
  await picture.waitFor()
  await loadedImages()
  const src = await picture.getAttribute('src')
  results.poses[name] = src
  return src
}
async function unavailableEmptyState(view, label, apiPattern, selector, loading) {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const message = `${label} 조회 실패 검증`
  await page.route(apiPattern, async route => {
    await pending
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: message }) })
  })
  try {
    await page.goto(`${web}/projects/${pid}/${view}`)
    await heading(label)
    await page.getByText(loading, { exact: true }).waitFor()
    assert.equal(await page.locator(selector).count(), 0, `${label}: waiting for data must not show empty-project guidance`)
    release()
    await page.getByRole('alert').filter({ hasText: message }).waitFor()
    assert.equal(await page.locator(selector).count(), 0, `${label}: a failed query must not show empty-project guidance`)
  } finally {
    release()
    await page.unroute(apiPattern)
  }
}

try {
  await page.goto(`${web}/login`)
  await heading('팀 공간에 로그인')
  const figure = mascot(page)
  await figure.waitFor()
  await loadedImages()
  assert.match(await page.title(), /^arcat\b/)
  const favicon = await page.locator('link[rel="icon"]').getAttribute('href')
  assert.ok(favicon, 'The browser uses the current brand favicon')
  assert.equal((await http.get(new URL(favicon, web).href)).status(), 200)
  const welcomeSource = await figure.locator('.arcat-mascot-picture img').getAttribute('src')
  await tracking(page, true)
  await page.mouse.move(20, 20)
  await frames()
  const left = await offsets(figure)
  await page.mouse.move(1900, 1050)
  await frames()
  const right = await offsets(figure)
  bounded(left, 'Pointer at upper left')
  bounded(right, 'Pointer at lower right')
  assert.ok(left.x < right.x && left.y < right.y, 'The body follows the pointer in both directions')
  assert.ok(left['pupil-x'] < right['pupil-x'] && left['pupil-y'] < right['pupil-y'], 'The gaze follows the pointer in both directions')
  assert.notEqual(await figure.locator('.arcat-mascot-motion').evaluate(node => getComputedStyle(node).transform), 'none', 'Pointer movement is visible on the character')
  results.pointer.normal = { left, right }

  // Boundary changes recenter the illustration instead of leaving it tilted.
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerleave')))
  await frames()
  centered(await offsets(figure), 'Leaving the browser')
  await page.mouse.move(1870, 940)
  await frames()
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await frames()
  centered(await offsets(figure), 'Window loses focus')

  // Password privacy is a focus state. Text length/content cannot drive its gaze.
  const secret = page.getByLabel('비밀번호', { exact: true })
  await secret.focus()
  await page.waitForFunction(() => document.querySelector('.arcat-welcome-panel .arcat-mascot')?.dataset.private === 'true')
  await tracking(page, false)
  const privateSource = await figure.locator('.arcat-mascot-picture img').getAttribute('src')
  assert.notEqual(privateSource, welcomeSource, 'Password focus displays the eyes-covered artwork')
  await loadedImages()
  await secret.fill('a')
  await page.mouse.move(30, 1000)
  await frames()
  const shortSecret = await offsets(figure)
  await secret.fill('a-longer-private-value-with-different-content')
  await page.mouse.move(1900, 30)
  await frames()
  const longSecret = await offsets(figure)
  centered(shortSecret, 'Short password')
  centered(longSecret, 'Long password')
  assert.deepEqual(shortSecret, longSecret, 'Password content has no influence on the character coordinates')
  assert.equal(await figure.locator('.arcat-mascot-picture img').getAttribute('src'), privateSource)
  await page.getByLabel('이메일', { exact: true }).focus()
  await page.waitForFunction(() => document.querySelector('.arcat-welcome-panel .arcat-mascot')?.dataset.private === 'false')
  await tracking(page, true)
  assert.equal(await figure.locator('.arcat-mascot-picture img').getAttribute('src'), welcomeSource, 'Leaving the password field restores the welcome artwork')
  results.pointer.passwordPrivacy = { privateSource, shortSecret, longSecret }

  // OS motion preference changes take effect while the page remains mounted.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await tracking(page, false)
  await page.mouse.move(1890, 1050)
  await frames()
  centered(await offsets(figure), 'Reduced motion')
  assert.equal(await figure.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0, 'Reduced motion disables character animations')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await tracking(page, true)
  await page.mouse.move(30, 80)
  await frames()
  assert.ok((await offsets(figure)).x < 0, 'Fine-pointer tracking resumes after changing the motion preference')

  // SPA navigation must detach the previous mascot from pointer updates.
  const detachedFigure = await figure.elementHandle()
  await page.locator('.auth-switch').getByRole('link', { name: '가입하기', exact: true }).click()
  await heading('arcat 계정 만들기')
  assert.equal(await detachedFigure.evaluate(node => node.isConnected), false)
  const detachedBefore = await offsets(detachedFigure)
  await tracking(page, true)
  await page.mouse.move(1880, 1030)
  await frames()
  assert.deepEqual(await offsets(detachedFigure), detachedBefore, 'Unmounted artwork receives no further pointer updates')
  await detachedFigure.dispose()
  await page.getByLabel('비밀번호', { exact: true }).focus()
  await tracking(page, false)
  assert.equal(await mascot(page).getAttribute('data-private'), 'true', 'Registration also protects password entry')
  await page.getByLabel('이름', { exact: true }).focus()
  await auditScreen('register')
  await page.locator('.auth-switch').getByRole('link', { name: '로그인', exact: true }).click()
  await heading('팀 공간에 로그인')
  await auditScreen('login')

  // A touch device stays still even if a synthetic pointer event is delivered.
  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })
  const touch = await touchContext.newPage()
  touch.on('pageerror', error => errors.push(error.message))
  try {
    await touch.goto(`${web}/login`)
    await mascot(touch).waitFor()
    assert.equal(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches), true, 'The mobile check uses a coarse pointer')
    await tracking(touch, false)
    await touch.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { clientX: 380, clientY: 820, pointerType: 'touch' })))
    await frames(touch)
    centered(await offsets(mascot(touch)), 'Touch pointer')
    results.pointer.touch = 'neutral'
    await touch.screenshot({ path: join(output, 'login-touch.png') })
  } finally { await touchContext.close() }

  await page.goto(`${web}/verify`)
  await heading('이메일 확인')
  await auditScreen('verification-error')

  await api('auth/register', { email, displayName: '삼색 브랜드 관리자', password }, undefined)
  await api(`auth/verify?token=${await mailToken()}`, undefined, undefined, 'POST')
  ownerToken = (await api('auth/login', { email, password }, undefined)).token
  await page.goto(`${web}/login`)
  await page.evaluate(token => localStorage.setItem('arc-token', token), ownerToken)
  await page.goto(`${web}/`)
  await heading('함께 일할 공간')
  const emptySpacePose = await pose('workspace-empty', '.arcat-workspace-empty')
  await auditScreen('workspace-empty')
  await page.getByLabel('워크스페이스 이름', { exact: true }).fill(workspaceName)
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await page.locator('.space-item').filter({ hasText: workspaceName }).waitFor()
  wid = (await api('auth/workspaces')).find(space => space.name === workspaceName).id
  const celebratedPose = await pose('workspace-created', '.arcat-workspace-notice')
  const emptyProjectPose = await pose('project-empty', '.arcat-project-empty')
  assert.notEqual(celebratedPose, emptySpacePose, 'Onboarding and success have their own illustration poses')
  assert.notEqual(emptyProjectPose, celebratedPose, 'An empty project uses a calm planning pose')
  await auditScreen('project-empty')
  await page.getByLabel('프로젝트 이름', { exact: true }).fill('삼색 브랜드 검증')
  await page.getByLabel('프로젝트 키', { exact: true }).fill('CALICO')
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click()
  await heading('간트 차트')
  pid = Number(new URL(page.url()).pathname.split('/')[2])
  await unavailableEmptyState('wbs', 'WBS', `**/api/projects/${pid}/issues?*`, '.arcat-wbs-empty', '작업 분해와 버전 일정을 불러오는 중입니다…')
  await page.goto(`${web}/projects/${pid}/wbs`)
  await heading('WBS')
  await pose('wbs-empty', '.arcat-wbs-empty')
  await auditScreen('wbs-empty')
  await unavailableEmptyState('sprints', '스프린트', `**/api/projects/${pid}/sprints`, '.arcat-sprint-empty', '스프린트를 불러오는 중입니다…')
  await page.goto(`${web}/projects/${pid}/sprints`)
  await heading('스프린트')
  await pose('sprint-empty', '.arcat-sprint-empty')
  await auditScreen('sprint-empty')
  await page.getByRole('navigation', { name: '프로젝트 메뉴' }).getByRole('link', { name: '칸반', exact: true }).click()
  await heading('칸반 보드')
  const topBrand = page.locator('.product-topbar .arcat-brand')
  await topBrand.waitFor()
  assert.equal((await topBrand.textContent()).trim(), 'arcat', 'The top navigation displays the product wordmark')
  await loadedImages()
  await auditScreen('project-board')
  await page.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('제목', { exact: true }).fill('고양이 배달과 저장 안내')
  const me = await api('auth/me')
  await form.getByLabel('담당자', { exact: true }).selectOption(String(me.id))
  const assignmentPose = await pose('assignment', '.ticket-assignment-notice')
  await form.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  await heading('고양이 배달과 저장 안내')
  await page.getByRole('button', { name: '이슈 편집', exact: true }).click()
  await heading('티켓 계획 편집')
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  await page.getByText('티켓 변경 사항을 저장했습니다.', { exact: true }).waitFor()
  const savePose = await pose('ticket-saved', '.ticket-save-notice')
  assert.notEqual(assignmentPose, savePose, 'Assignment and successful saving use different artwork')
  await page.goto(`${web}/projects/${pid}/wbs`)
  await heading('WBS')
  await page.getByLabel('WBS 이슈 검색', { exact: true }).fill('matches-no-calico-ticket')
  await page.getByText('조건에 맞는 티켓이 없습니다.', { exact: true }).waitFor()
  assert.equal(await page.locator('.arcat-wbs-empty').count(), 0, 'A filtered-out ticket is not an empty project')
  assert.deepEqual(errors, [], 'No uncaught browser errors during tracking, navigation or fixture actions')
  results.assets = [...new Map(results.assets.map(asset => [asset.src, asset])).values()]
  writeFileSync(join(output, 'verification.json'), JSON.stringify(results, null, 2))
  console.log('Calico brand browser acceptance passed: bounded body/gaze, password privacy, pointer recenter, SPA cleanup, reduced-motion/touch, top navigation, distinct workflow poses, truthful loading/error/filtered states, 24 responsive accessibility audits')
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await context.tracing.stop({ path: join(output, 'trace.zip') }).catch(() => {})
  if (wid && ownerToken) await api(`auth/workspaces/${wid}`, { confirmation: workspaceName }, ownerToken, 'DELETE').catch(error => console.error('Fixture cleanup failed:', error.message))
  await browser.close()
  await http.dispose()
}
