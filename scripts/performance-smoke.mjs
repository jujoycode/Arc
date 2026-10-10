// Opt-in measurement against a disposable MySQL + Mailpit installation.
// Creates its own workspace; requires a matching database container explicitly.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { chromium, request } from '../frontend/node_modules/playwright/index.mjs'

const container = process.env.ARC_PERF_MYSQL_CONTAINER
assert.ok(container, 'Set ARC_PERF_MYSQL_CONTAINER to a disposable MySQL container')
const count = Number(process.env.ARC_PERF_ISSUES ?? 5000)
assert.ok(Number.isInteger(count) && count >= 100 && count <= 20000, 'Use 100–20000 fixture issues')
const apiUrl = process.env.ARC_API_URL ?? 'http://127.0.0.1:8080/api/'
const web = process.env.ARC_WEB_URL ?? 'http://127.0.0.1:5173'
const mail = process.env.ARC_MAIL_URL ?? 'http://127.0.0.1:8025/api/v1/'
const http = await request.newContext({ baseURL: apiUrl })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const protocol = await context.newCDPSession(page)
await protocol.send('Performance.enable')
page.setDefaultTimeout(60000)
const suffix = Date.now().toString(36)
const email = `performance-${suffix}@example.com`
const workspaceName = `Performance ${suffix}`, projectName = `Fixture ${suffix}`
let token, workspaceId
const results = { count, environment: { node: process.version, browser: browser.version(), viewport: '1440x1000' }, api: [], views: [] }
const errors = []
page.on('pageerror', error => errors.push(error.message))

async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await http.fetch(path, { method, data: body, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  assert.ok(response.ok(), `${path}: HTTP ${response.status()}`)
  const raw = await response.text()
  return raw ? JSON.parse(raw) : undefined
}
function sql(input) {
  return execFileSync('docker', ['exec', '-i', container, 'sh', '-c', 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --batch --skip-column-names -u "$MYSQL_USER" "$MYSQL_DATABASE"'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}
try {
  const password = 'performance-fixture-password-123'
  await api('auth/register', { email, displayName: '성능 점검', password })
  let verification
  for (let i = 0; i < 30 && !verification; i++) {
    const listing = await (await http.get(`${mail}messages`)).json()
    const message = listing.messages.find(item => item.Subject === 'arcat 이메일 확인' && item.To.some(to => to.Address === email))
    if (message) verification = (await (await http.get(`${mail}message/${message.ID}`)).json()).Text.match(/token=([^\s]+)/)[1]
    else await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(verification, 'Verification email missing')
  await api(`auth/verify?token=${verification}`, undefined, 'POST')
  token = (await api('auth/login', { email, password })).token
  const actorId = (await api('auth/me')).id
  workspaceId = (await api('auth/workspaces', { name: workspaceName })).id
  const projectId = (await api(`workspaces/${workspaceId}/projects`, { name: projectName, key: 'PERF' })).id
  // Refuse to seed a database that does not belong to the configured API.
  assert.equal(sql(`SELECT name FROM projects WHERE id=${projectId};`), projectName)
  assert.equal(sql(`SELECT COUNT(*) FROM issues WHERE project_id=${projectId};`), '0')
  const states = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']
  const values = Array.from({ length: count }, (_, i) => `(${projectId},${i + 1},'Performance issue ${i + 1}','TASK','${states[i % 4]}','NORMAL',${actorId},'2026-10-01','2026-10-30',${i % 101},${i})`)
  sql(`START TRANSACTION; INSERT INTO issues (project_id,issue_number,title,issue_type,status,priority,reporter_id,start_date,due_date,done_ratio,sort_order) VALUES ${values.join(',')}; UPDATE projects SET next_issue_number=${count + 1} WHERE id=${projectId}; COMMIT;`)
  for (const path of [`projects/${projectId}/issues?size=1000&page=0`, `projects/${projectId}/gantt`]) {
    const samples = []
    let bytes
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      const response = await http.get(path, { headers: { Authorization: `Bearer ${token}` } })
      assert.ok(response.ok())
      const body = await response.body()
      samples.push(performance.now() - start)
      bytes = body.length
    }
    results.api.push({ path: path.replace(String(projectId), ':projectId'), samplesMs: samples.map(value => Math.round(value)), bytes })
  }
  await context.addInitScript(value => localStorage.setItem('arc-token', value), token)
  for (const [view, selector, expected] of [['gantt', '.issue-row', count + 1], ['board', '.board-card', count], ['backlog', '.backlog-row', Math.min(count, 100)]]) {
    const start = performance.now()
    await page.goto(`${web}/projects/${projectId}/${view}`)
    await page.waitForFunction(({ selector, expected }) => document.querySelectorAll(selector).length >= expected, { selector, expected })
    await page.evaluate(() => document.fonts.ready)
    const readyMs = performance.now() - start
    const metrics = await page.evaluate(async () => {
      const nodes = document.querySelectorAll('*').length
      const frames = []
      let previous = performance.now()
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve))
        const now = performance.now()
        frames.push(now - previous); previous = now
        scrollBy(0, 80)
      }
      frames.sort((a, b) => a - b)
      return { nodes, scrollFrameP95Ms: Math.round(frames[18]) }
    })
    const { metrics: engineMetrics } = await protocol.send('Performance.getMetrics')
    const heapBytes = engineMetrics.find(item => item.name === 'JSHeapUsedSize')?.value
    results.views.push({ view, readyMs: Math.round(readyMs), ...metrics, jsHeapMiB: heapBytes ? Math.round(heapBytes / 1048576) : undefined })
    if (view === 'backlog' && count > 100) {
      await page.getByRole('button', { name: '백로그 마지막 페이지', exact: true }).click()
      await page.getByRole('link').filter({ hasText: `PERF-${count}` }).waitFor()
      assert.ok(await page.locator('.backlog-row').count() <= 100)
      await page.getByRole('button', { name: '백로그 첫 페이지', exact: true }).click()
      await page.getByRole('link').filter({ hasText: 'PERF-1 ·' }).waitFor()
      const reorderStart = performance.now()
      await page.getByRole('button', { name: 'PERF-1 아래로', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('.backlog-row small')?.textContent?.startsWith('PERF-2 ·'))
      results.backlogReorderMs = Math.round(performance.now() - reorderStart)
    }
  }
  assert.deepEqual(errors, [], 'Browser runtime errors')
  const output = process.env.ARC_PERF_OUTPUT ?? '.ci-artifacts/performance.json'
  mkdirSync(output.slice(0, output.lastIndexOf('/')) || '.', { recursive: true })
  writeFileSync(output, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  if (workspaceId && token) await api(`auth/workspaces/${workspaceId}`, { confirmation: workspaceName }, 'DELETE').catch(() => {})
  await context.close(); await browser.close(); await http.dispose()
}
