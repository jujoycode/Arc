// Actual product photography. Uses only local disposable services; no mocked UI/DOM.
import { chromium, request } from '../../frontend/node_modules/playwright/index.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID, randomBytes, createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const web = process.env.ARC_WEB_URL ?? 'http://127.0.0.1:15190'
const backend = process.env.ARC_API_URL ?? 'http://127.0.0.1:18090/api/'
const mail = process.env.ARC_MAIL_URL ?? 'http://127.0.0.1:18027/api/v1/'
for (const value of [web, backend, mail]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(value).hostname), 'Photography requires local disposable services')
const output = resolve(process.env.ARC_CAPTURE_OUTPUT ?? 'docs/product/images')
mkdirSync(output, { recursive: true })
const http = await request.newContext({ baseURL: backend })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, timezoneId: 'Asia/Seoul', locale: 'ko-KR', reducedMotion: 'reduce', acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(20000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const shots = []
const capturedAt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
const month = capturedAt.slice(0, 7)
const date = day => `${month}-${String(day).padStart(2, '0')}`
const nextMonth = new Date(`${month}-01T00:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
const next = nextMonth.toISOString().slice(0, 7)
const suffix = randomUUID().slice(0, 8), password = randomBytes(24).toString('base64url')
let owner, workspace, project
const workspaceName = 'Aurora 제품팀'

async function api(path, body, token, method = body === undefined ? 'GET' : 'POST', expected = 200) {
  const response = await http.fetch(path, { method, data: body, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  assert.equal(response.status(), expected, `${method} ${path}: unexpected status`)
  const raw = await response.text()
  return raw ? JSON.parse(raw) : undefined
}
async function mailToken(email, subject) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const listing = await (await http.get(`${mail}messages`)).json()
    const item = listing.messages.find(item => item.Subject === subject && item.To.some(to => to.Address === email))
    if (item) return (await (await http.get(`${mail}message/${item.ID}`)).json()).Text.match(/token=([^\s]+)/)[1]
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Demo mail not delivered: ${subject}`)
}
async function account(name, prefix) {
  const email = `${prefix}-${suffix}@example.com`
  await api('auth/register', { email, displayName: name, password })
  await api(`auth/verify?token=${await mailToken(email, 'arcat 이메일 확인')}`, undefined, undefined, 'POST')
  const login = await api('auth/login', { email, password })
  return { ...login.user, email, token: login.token }
}
async function actor(user) {
  await page.goto(`${web}/login`)
  await page.evaluate(token => token ? localStorage.setItem('arc-token', token) : localStorage.removeItem('arc-token'), user?.token ?? null)
}
async function go(path, heading) {
  await page.goto(`${web}/${path}`)
  if (heading) {
    if (['팀 공간에 로그인', 'arcat 계정 만들기'].includes(heading)) await page.getByText(heading, { exact: true }).waitFor()
    else await page.getByRole('heading', { name: heading, exact: true }).waitFor()
  }
  await page.locator('.loading-state').waitFor({ state: 'detached' })
  await page.waitForLoadState('networkidle')
}
async function capture(id, title, chapter, role, purpose, features, anchor) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    document.activeElement?.blur()
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  if (anchor) {
    await anchor.waitFor()
    await anchor.evaluate(element => window.scrollTo(0, Math.max(0, element.getBoundingClientRect().top + window.scrollY - 88)))
  } else await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(output, `${id}.png`), fullPage: false, animations: 'disabled' })
  const png = readFileSync(join(output, `${id}.png`))
  assert.equal(png.readUInt32BE(16), 1920); assert.equal(png.readUInt32BE(20), 1080)
  shots.push({ id, file: `${id}.png`, title, chapter, role, purpose, features, route: new URL(page.url()).pathname.replace(/\/workspaces\/\d+/g, '/workspaces/:workspaceId').replace(/\/projects\/\d+/g, '/projects/:projectId').replace(/\/issues\/\d+/g, '/issues/:issueId'), frame: anchor ? '화면 하단 기능으로 스크롤' : '화면 상단', width: 1920, height: 1080 })
  console.log(`Captured ${shots.length}: ${id}.png`)
}
async function delivery(connection, provider, payload, event, secret) {
  const raw = JSON.stringify(payload)
  const headers = { 'Content-Type': 'application/json' }
  if (provider === 'GITHUB') Object.assign(headers, { 'X-GitHub-Event': event, 'X-GitHub-Delivery': randomUUID(), 'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') })
  else Object.assign(headers, { 'X-Gitlab-Event': event, 'X-Gitlab-Event-UUID': randomUUID(), 'X-Gitlab-Token': secret })
  assert.equal((await http.post(`integrations/webhooks/${connection.id}`, { data: raw, headers })).status(), 202)
}

try {
  await actor(null)
  await go('login', '팀 공간에 로그인')
  await page.getByLabel('이메일', { exact: true }).fill('minji@example.com')
  await capture('login', '이메일 로그인', '01-team-and-access', '모든 사용자', '집배원 고양이가 안내하는 시작 화면에서 검증된 이메일로 팀 공간에 접속합니다.', ['arcat 제품 소개와 집배원 고양이', '이메일·비밀번호 로그인', '가입 화면 이동'])
  await go('register', 'arcat 계정 만들기')
  await page.getByLabel('이름', { exact: true }).fill('김민지')
  const ownerEmail = `minji-${suffix}@example.com`
  await page.getByLabel('이메일', { exact: true }).fill(ownerEmail)
  await capture('register', '계정 가입', '01-team-and-access', '모든 사용자', '이름과 이메일로 계정을 만들고 확인 메일을 받습니다.', ['집배원 고양이와 팀 시작 안내', '이름·이메일·비밀번호 입력', '12자 이상 비밀번호', '이메일 확인 후 로그인'])
  await api('auth/register', { email: ownerEmail, displayName: '김민지', password })
  await go(`verify?token=${await mailToken(ownerEmail, 'arcat 이메일 확인')}`)
  await page.getByText('이메일 확인을 마쳤습니다. 로그인하세요.').waitFor()
  await capture('email-verification', '이메일 확인 완료', '01-team-and-access', '가입 사용자', '실제 확인 메일의 일회용 링크로 이메일을 검증합니다.', ['확인 링크 검증', '고양이와 텍스트로 확인 결과 안내', '로그인으로 이동'])
  const login = await api('auth/login', { email: ownerEmail, password })
  owner = { ...login.user, token: login.token }
  await actor(owner)
  await go('', '함께 일할 공간')
  await page.getByRole('heading', { name: '팀의 첫 공간을 준비해 볼까요?', exact: true }).waitFor()
  await capture('workspace-onboarding', '첫 워크스페이스 시작 안내', '01-team-and-access', '새로 가입한 사용자', '집배원 고양이와 안내를 따라 첫 팀 공간을 준비합니다.', ['업무가 없는 가입 직후의 실제 빈 상태', '워크스페이스 이름 입력과 생성', '첫 공간 생성 후 프로젝트 준비', '장식 캐릭터와 텍스트 안내'])
  const developer = await account('이서준', 'seojun')
  const designer = await account('박지우', 'jiwoo')
  const manager = await account('한지훈', 'jihoon')
  const admin = await account('최유진', 'yujin')
  workspace = await api('auth/workspaces', { name: workspaceName }, owner.token)
  for (const user of [developer, designer, manager, admin]) {
    await api(`auth/workspaces/${workspace.id}/invitations`, { email: user.email, role: user === admin ? 'ADMIN' : 'MEMBER' }, owner.token)
    const invite = await mailToken(user.email, 'arcat 팀 초대')
    if (user === developer) {
      await actor(developer); await go(`invite?token=${invite}`)
      await page.getByText('초대를 수락했습니다.', { exact: true }).waitFor()
      await capture('team-invitation', '팀 초대 수락', '01-team-and-access', '초대받은 팀원', '초대받은 이메일로 로그인한 뒤 팀에 합류합니다.', ['초대 이메일 일치 확인', '고양이와 텍스트로 초대 수락 안내', '워크스페이스로 이동'])
    } else await api(`auth/invitations/accept?token=${invite}`, undefined, user.token, 'POST')
  }
  project = await api(`workspaces/${workspace.id}/projects`, { name: '고객 포털 고도화', key: 'PORTAL', description: '고객이 문의·계정·알림을 한곳에서 관리하는 포털을 개선합니다.' }, owner.token)
  const mobile = await api(`workspaces/${workspace.id}/projects`, { name: '모바일 고객 포털', key: 'MOBILE', parentProjectId: project.id }, owner.token)
  const empty = await api(`workspaces/${workspace.id}/projects`, { name: '운영 도구 준비', key: 'OPS' }, owner.token)
  await api(`projects/${project.id}/managers/${manager.id}`, undefined, owner.token, 'PUT')
  const release = await api(`projects/${project.id}/versions`, { name: 'v1.2 고객 포털', startDate: date(1), dueDate: date(28) }, owner.token)
  const upcoming = await api(`projects/${project.id}/versions`, { name: 'v1.3 운영 개선', startDate: `${next}-01`, dueDate: `${next}-25` }, owner.token)
  const currentSprint = await api(`projects/${project.id}/sprints`, { name: 'Sprint 08 · 계정과 문의', goal: '고객 로그인과 문의 접수의 핵심 흐름을 완성합니다.', startOn: date(1), endOn: date(14) }, owner.token)
  const plannedSprint = await api(`projects/${project.id}/sprints`, { name: 'Sprint 09 · 알림과 운영', goal: '알림 경험과 운영 효율을 개선합니다.', startOn: date(15), endOn: date(28) }, owner.token)
  async function ticket(title, fields) {
    const created = await api(`projects/${project.id}/issues`, { title, priority: 'NORMAL', ...fields }, owner.token)
    return api(`projects/${project.id}/issues/${created.id}`, undefined, owner.token)
  }
  const epic = await ticket('안전한 계정과 고객 경험', { type: 'EPIC', versionId: release.id, assigneeId: manager.id })
  const story = await ticket('고객 이메일 로그인', { type: 'STORY', parentId: epic.id, assigneeId: developer.id, status: 'IN_PROGRESS', progress: 65, priority: 'HIGH', startDate: date(1), dueDate: date(10), storyPoints: 5, versionId: release.id, description: '고객이 검증된 이메일로 로그인하고 본인의 계정 정보를 확인합니다.\n\n완료 기준\n• 이메일 확인과 로그인 흐름 연결\n• 비밀번호 오류 안내와 입력 보존\n• 키보드만으로 로그인 가능\n\n상위 목표: 안전한 계정과 고객 경험' })
  const apiTask = await ticket('로그인 API와 세션 검증', { type: 'SUBTASK', parentId: story.id, assigneeId: developer.id, status: 'IN_PROGRESS', progress: 75, startDate: date(1), dueDate: date(8), storyPoints: 3, versionId: release.id })
  const uiTask = await ticket('로그인 폼과 오류 안내', { type: 'SUBTASK', parentId: story.id, assigneeId: designer.id, status: 'REVIEW', progress: 90, startDate: date(3), dueDate: date(10), storyPoints: 2, versionId: release.id })
  const inquiries = await ticket('문의 접수와 담당자 배정', { type: 'STORY', parentId: epic.id, assigneeId: designer.id, status: 'TODO', startDate: date(9), dueDate: date(18), storyPoints: 8, versionId: release.id })
  const notices = await ticket('고객 알림 설정', { type: 'STORY', parentId: epic.id, assigneeId: developer.id, status: 'TODO', startDate: date(15), dueDate: date(24), storyPoints: 5, versionId: release.id })
  const done = await ticket('접근성 기준과 화면 설계', { type: 'TASK', assigneeId: designer.id, status: 'DONE', progress: 100, startDate: date(1), dueDate: date(5), storyPoints: 3, versionId: release.id })
  const bug = await ticket('로그인 실패 문구 정리', { type: 'BUG', assigneeId: developer.id, status: 'REVIEW', progress: 85, priority: 'URGENT', startDate: date(6), dueDate: date(9), storyPoints: 2, versionId: release.id })
  await ticket('운영 FAQ 초안', { type: 'TASK', assigneeId: admin.id, startDate: date(18), dueDate: date(26), storyPoints: 3, versionId: release.id })
  await ticket('파일 첨부 정책 검토', { type: 'TASK', assigneeId: manager.id, storyPoints: 2 })
  await ticket('다음 릴리스 성능 점검', { type: 'TASK', assigneeId: developer.id, startDate: `${next}-05`, dueDate: `${next}-12`, storyPoints: 5, versionId: upcoming.id })
  await ticket('출시 문서 최종 확인', { type: 'TASK', assigneeId: admin.id, dueDate: date(27), storyPoints: 1 })
  await api(`projects/${mobile.id}/issues`, { title: '모바일 로그인 화면 연결', type: 'TASK', startDate: date(5), dueDate: date(16), progress: 35, assigneeId: developer.id }, owner.token)
  for (const item of [story, apiTask, uiTask, done, bug]) await api(`projects/${project.id}/issues/${item.id}/sprint`, { sprintId: currentSprint.id }, owner.token, 'PUT')
  for (const item of [inquiries, notices]) await api(`projects/${project.id}/issues/${item.id}/sprint`, { sprintId: plannedSprint.id }, owner.token, 'PUT')
  await api(`projects/${project.id}/sprints/${currentSprint.id}/start`, {}, owner.token)
  await api(`projects/${project.id}/issues/${story.id}/relations`, { targetId: inquiries.id, type: 'PRECEDES' }, owner.token)
  await api(`projects/${project.id}/issues/${apiTask.id}/relations`, { targetId: bug.id, type: 'BLOCKS' }, owner.token)
  await api(`projects/${project.id}/issues/${story.id}/comments`, { body: '로그인 API와 세션 검증을 진행하고 있습니다. 키보드 조작도 함께 확인하겠습니다.' }, developer.token)
  await api(`projects/${project.id}/issues/${story.id}/comments`, { body: '완료 기준을 확인했습니다. 오류 문구 검토 후 다음 문의 접수 작업을 시작하겠습니다.' }, owner.token)
  const pendingEmail = `reviewer-${suffix}@example.com`
  await api(`auth/workspaces/${workspace.id}/invitations`, { email: pendingEmail, role: 'MEMBER' }, owner.token)
  const secret = randomBytes(32).toString('hex')
  const github = await api(`projects/${project.id}/repository-connections`, { provider: 'GITHUB', repository: 'arc-fixture/repo', token: 'arc-fixture-token-123', webhookSecret: secret }, owner.token)
  const gitlab = await api(`projects/${project.id}/repository-connections`, { provider: 'GITLAB', repository: 'arc-fixture/repo', token: 'arc-fixture-token-123', webhookSecret: secret }, owner.token)
  const stamp = `${capturedAt}T00:10:00Z`
  await delivery(github, 'GITHUB', { repository: { id: 101 }, commits: [{ id: 'a'.repeat(40), message: `${story.key} 이메일 로그인 흐름 연결`, timestamp: stamp }] }, 'push', secret)
  await delivery(github, 'GITHUB', { repository: { id: 101 }, pull_request: { number: 24, title: `${story.key} 로그인 접근성과 오류 안내 개선`, body: '', state: 'closed', merged: true, updated_at: stamp } }, 'pull_request', secret)
  await delivery(gitlab, 'GITLAB', { project: { id: 201 }, object_attributes: { iid: 12, title: `${story.key} 세션 검증과 감사 기록 정리`, description: '', state: 'merged', updated_at: stamp.replace('T', ' ').replace('Z', ' UTC') } }, 'Merge Request Hook', secret)
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await api(`projects/${project.id}/issues/${story.id}/development-links`, undefined, owner.token)).length === 3) break
    if (attempt === 59) throw new Error('Demo development events were not processed')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  const path = view => `projects/${project.id}/${view}`
  const row = id => page.locator(`.wbs-row[data-ticket-id="${id}"]`)
  await actor(owner)
  await go('', '함께 일할 공간')
  await capture('workspaces', '워크스페이스와 프로젝트 선택', '01-team-and-access', '팀원·관리자', '팀 공간과 프로젝트를 선택하고 프로젝트 간 이동을 시작합니다.', ['워크스페이스별 역할', '프로젝트 카드', '상위 프로젝트 지정', '새 워크스페이스·프로젝트 생성'])
  await page.getByPlaceholder('프로젝트 이름', { exact: true }).fill('고객 데이터 분석')
  await page.getByPlaceholder('프로젝트 키 (예: ARC)').fill('INSIGHT')
  await capture('project-creation', '새 프로젝트 준비', '01-team-and-access', '워크스페이스 소유자·관리자', '프로젝트 이름·키·상위 프로젝트를 정해 관리 범위를 나눕니다.', ['프로젝트 키 입력', '상위 프로젝트 선택', '관리자 생성 권한'])

  await go(path('gantt'), '간트 차트')
  await page.getByLabel('시작 월', { exact: true }).fill(month)
  await page.getByLabel('표시 기간', { exact: true }).selectOption('2')
  await page.getByLabel('확대', { exact: true }).selectOption('0')
  await capture('gantt', '간트로 일정과 관계 확인', '02-planning-and-schedule', '모든 팀원', '프로젝트·버전·티켓의 일정과 진행률, 선행·차단 관계를 한 화면에서 확인합니다.', ['부모·자식 계층', '기간·확대·월 이동', '오늘·주말', '버전 일정 상속', '관계선', 'PNG·PDF 출력'])
  await page.getByRole('button', { name: new RegExp(`${story.key} ${story.title} 하위 항목 접기`) }).click()
  await capture('gantt-collapse', '계층별 간트 접기', '02-planning-and-schedule', '모든 팀원', '부모를 기준으로 자손을 접어 일정의 큰 흐름에 집중합니다.', ['중첩 계층 접기', '하위 접힘 상태 보존', '부모 집계 유지', '전체 접기·펼치기'])
  await page.getByRole('button', { name: new RegExp(`${story.key} ${story.title} 하위 항목 펼치기`) }).click()
  await page.getByText('표시 옵션', { exact: true }).click()
  await page.getByLabel('진행선', { exact: true }).check()
  await page.getByLabel('담당자 열', { exact: true }).check()
  await page.getByText('개인 보기 저장 · 불러오기', { exact: true }).click()
  await page.getByLabel('보기 이름', { exact: true }).fill('v1.2 배포 검토')
  await page.getByRole('button', { name: '현재 보기 저장', exact: true }).click()
  await page.getByRole('button', { name: 'v1.2 배포 검토 보기 삭제', exact: true }).waitFor()
  await capture('gantt-personal-view', '간트 옵션과 개인 보기', '02-planning-and-schedule', '모든 팀원', '반복해서 확인할 필터·기간·표시 옵션을 개인 보기로 저장합니다.', ['진행선·완료율·관계선', '담당자·우선순위 열', '개인 보기 저장·불러오기·삭제', '현재 보이는 계층 출력'])
  for (const format of ['PNG', 'PDF']) {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: format, exact: true }).click()
    const download = await pending
    assert.equal(await download.failure(), null)
  }
  await page.locator('.issue-select').filter({ hasText: story.title }).click()
  await capture('gantt-item-detail', '간트 선택 항목 상세', '02-planning-and-schedule', '모든 팀원', '일정 항목을 선택해 속성과 관계를 읽고 원래 티켓으로 이동합니다.', ['선택 항목 상태·일정·담당자', '연결 티켓 탐색', '공통 티켓 상세 이동'], page.getByRole('complementary', { name: '선택한 항목 상세' }))

  await go(path('wbs'), 'WBS')
  await capture('wbs-manager', '관리자의 WBS 계획', '02-planning-and-schedule', '기본·프로젝트 관리자', '범위를 분해하고 담당자를 배정하며 팀의 말단 완료와 추정 현황을 확인합니다.', ['계층 코드', '팀 완료 비율·포인트·미추정', '접기·필터', '티켓·하위 작업 생성', '상세 계획 편집'])
  await page.getByRole('button', { name: `${story.key} 하위 티켓 추가`, exact: true }).click()
  await page.getByRole('dialog').getByLabel('제목', { exact: true }).fill('로그인 오류 문구 다듬기')
  await capture('wbs-child-ticket', 'WBS 하위 티켓 추가', '02-planning-and-schedule', '기본·프로젝트 관리자', '선택한 부모 아래로 작업을 분해하면서 같은 티켓을 다른 보기와 공유합니다.', ['부모·유형 기본값', '버전 연결', '담당자·일정·포인트', '서버 계층 검증'])
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click()
  await actor(developer); await go(path('wbs'), 'WBS')
  await page.getByRole('button', { name: '내 업무', exact: true }).click()
  await row(apiTask.id).waitFor()
  await capture('wbs-developer', '개발자의 내 업무와 팀 진척', '02-planning-and-schedule', '개발자', '내 담당 티켓과 부모 맥락을 보면서 팀 전체 진척을 함께 확인합니다.', ['팀 업무·내 업무 전환', '내 티켓 상태별 수', '조상 맥락', '필터에도 팀 합계 유지', '관리 조작 비노출'])
  await go(path(`issues/${apiTask.id}`), '로그인 API와 세션 검증')
  await page.getByRole('button', { name: '진행 상황 수정', exact: true }).click()
  await capture('ticket-execution', '담당 개발자의 실행 정보 수정', '03-tickets-and-views', '담당자·관리자', '계획을 바꾸지 않고 담당 티켓의 상태와 완료율을 기록합니다.', ['상태·완료율 전용 폼', '담당자 검사', '계획 필드 분리', '다른 보기 반영'])
  await actor(owner)

  await go(path('timeline'), '타임라인')
  await page.getByLabel('타임라인 유형 필터', { exact: true }).selectOption('STORY')
  await capture('timeline-epic', 'Epic별 타임라인', '02-planning-and-schedule', '모든 팀원', 'Epic별 일정 개요를 읽고 기간 막대로 티켓 상세를 엽니다.', ['Epic 그룹', '월 이동', '하위 집계', '날짜·진척 텍스트', '상세 이동'])
  await page.getByLabel('타임라인 기간', { exact: true }).selectOption('3')
  await page.getByLabel('타임라인 유형 필터', { exact: true }).selectOption('TASK')
  await page.getByLabel('타임라인 그룹', { exact: true }).selectOption('version')
  await capture('timeline-version', '버전별 분기 일정', '02-planning-and-schedule', '모든 팀원', '릴리스 버전으로 일정을 묶고 3개월 범위에서 계획을 비교합니다.', ['버전 그룹', '1개월·3개월 기간', '기간 경계 자르기', '버전 일정 상속'])
  await page.getByRole('button', { name: '필터 초기화', exact: true }).click()
  await page.getByLabel('타임라인 기간', { exact: true }).selectOption('1')
  await capture('timeline-unscheduled', '미계획·기간 밖 업무', '02-planning-and-schedule', '모든 팀원', '차트에 나타나지 않는 업무도 별도 목록에서 찾아 계획 누락을 확인합니다.', ['미계획 목록', '기간 밖 목록', '한쪽 날짜 표식', '상속 일정 역전 안내'], page.getByRole('region', { name: '미계획 티켓', exact: true }))

  await go(path('issues'), '이슈 목록')
  await capture('ticket-table', '티켓 테이블', '03-tickets-and-views', '모든 팀원', '프로젝트 티켓을 조건별로 비교하고 정렬·페이지 조회합니다.', ['키·제목 검색', '상태·유형·우선순위·담당자·버전·스프린트 필터', '서버 정렬·페이지', '상세 이동'])
  await page.getByText('표시할 열', { exact: true }).click()
  for (const label of ['시작일 열', '완료율 열', '스토리 포인트 열']) await page.getByLabel(label, { exact: true }).check()
  await capture('ticket-table-columns', '테이블 표시 열 선택', '03-tickets-and-views', '모든 팀원', '업무 비교에 필요한 열을 선택하고 같은 프로젝트 탐색 동안 유지합니다.', ['필수 키·제목 열', '시작일·완료율·포인트', '열 숨기기·기본값 복원', '표시 설정 유지'])
  await page.getByRole('button', { name: '이슈 만들기', exact: true }).click()
  await page.getByRole('dialog').getByLabel('제목', { exact: true }).fill('고객 문의 목록의 키보드 탐색')
  await page.getByRole('dialog').getByLabel('담당자', { exact: true }).selectOption(String(designer.id))
  await capture('ticket-create', '공통 티켓 생성', '03-tickets-and-views', '기본·프로젝트 관리자', 'Epic·Story·Task·Bug·하위 작업을 하나의 티켓 계약으로 생성합니다.', ['기본 정보·계획·일정·진행 상황 그룹', '필수·선택과 입력 안내', '담당자·부모·버전·포인트', '담당자 선택 시 집배원 고양이와 배정 안내', '모든 보기에서 같은 키 사용'])
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click()
  await go(path(`issues/${story.id}`), story.title)
  await capture('ticket-detail', '티켓 상세와 팀 협업', '03-tickets-and-views', '모든 팀원', '한 티켓에서 완료 기준·속성·댓글·변경 기록·관계·개발 활동을 확인합니다.', ['설명·상태·담당자·일정', '댓글 협업', '변경 기록', '선행·차단 관계', '관리자 삭제'])
  await page.getByLabel('관계 유형', { exact: true }).selectOption('BLOCKS')
  await page.getByLabel('연결할 이슈', { exact: true }).selectOption(String(notices.id))
  await capture('ticket-relations', '선행·차단 관계 연결', '03-tickets-and-views', '기본·프로젝트 관리자', '먼저 완료할 업무와 차단 관계를 연결하고 간트의 관계선으로 함께 확인합니다.', ['선행·차단 선택', '같은 프로젝트 티켓 연결', '관계 순환 검증', '관리자 연결 해제'])
  await capture('ticket-history', '티켓 변경 기록', '03-tickets-and-views', '모든 팀원', '업무의 생성·수정·관계·스프린트 편성 기록에서 작업한 사람과 시각을 확인합니다.', ['변경자·시각·작업 종류', '계획·실행 변경 기록', '댓글·개발 활동 함께 확인'], page.getByRole('heading', { name: '변경 기록', exact: true }))
  await page.locator('.comment').filter({ hasText: '완료 기준을 확인했습니다.' }).getByRole('button', { name: '수정', exact: true }).click()
  await capture('ticket-comment-edit', '댓글 수정과 협업 기록', '03-tickets-and-views', '모든 팀원·댓글 작성자', '모든 팀원이 댓글을 작성하고 작성자는 자신의 댓글을 수정·삭제합니다.', ['본인 댓글 편집', '관리자 문제 댓글 삭제', '다른 담당자의 업무에도 댓글', '변경 기록'])
  await page.getByRole('button', { name: '취소', exact: true }).click()
  await page.getByRole('button', { name: '이슈 편집', exact: true }).click()
  await capture('ticket-plan-edit', '관리자의 티켓 계획 편집', '03-tickets-and-views', '기본·프로젝트 관리자', '담당자·일정·범위·계층·추정을 변경하고 모든 보기에 반영합니다.', ['제목·설명·유형·우선순위', '담당자·일정·포인트·부모·버전', '계층·날짜 검증', '낙관적 버전'])
  await page.getByLabel('제목', { exact: true }).fill('고객 이메일 로그인 · 문구 검토')
  const snapshot = await api(`projects/${project.id}/issues/${story.id}`, undefined, owner.token)
  await api(`projects/${project.id}/issues/${story.id}/execution`, { status: snapshot.status, progress: snapshot.progress, version: snapshot.version }, developer.token, 'PATCH')
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  await page.getByRole('alert').getByText('다른 사용자가 이슈를 변경했습니다.', { exact: false }).waitFor()
  await capture('ticket-edit-conflict', '동시 편집 충돌과 입력 보존', '03-tickets-and-views', '편집 권한이 있는 사용자', '다른 사용자가 먼저 저장한 경우 충돌을 알리고 입력 내용을 보존합니다.', ['version 충돌 안내', '입력 보존', '새 데이터 확인 후 재시도'])
  await page.getByRole('button', { name: '취소', exact: true }).click()
  await go(path('board'), '칸반 보드')
  await capture('kanban', '칸반 상태별 실행', '03-tickets-and-views', '모든 팀원·담당자', '할 일·진행 중·검토·완료로 티켓을 나누고 실행 상태를 갱신합니다.', ['드래그·상태 메뉴', '담당자·관리자만 변경', '공통 필터', '실패 시 상태 복원', '상세·스프린트 동기화'])

  await go(path('backlog'), '백로그')
  await capture('backlog', '백로그와 스프린트 편성', '04-sprints', '모든 팀원·관리자', '미편성 업무의 우선순위를 정하고 계획 중 스프린트에 넣습니다.', ['백로그 순서 변경', '스프린트 편성·백로그 복귀', '공통 필터', '관리자 계획 권한'])
  await go(path('sprints'), '스프린트')
  await capture('sprint-active', '진행 중 스프린트', '04-sprints', '모든 팀원', '스프린트 목표·기간·완료 수·포인트와 상태별 업무를 확인합니다.', ['스프린트 보드', '담당 티켓 상태 변경', '목표·기간', '완료·포인트 요약'])
  await page.getByRole('button', { name: '스프린트 계획', exact: true }).click()
  const sprintForm = page.getByRole('dialog')
  await sprintForm.getByPlaceholder('스프린트 이름', { exact: true }).fill('Sprint 10 · 운영 안정화')
  await sprintForm.getByPlaceholder('목표', { exact: true }).fill('고객 피드백을 반영하고 운영 지표를 점검합니다.')
  await sprintForm.getByLabel('시작일', { exact: true }).fill(`${next}-01`)
  await sprintForm.getByLabel('종료일', { exact: true }).fill(`${next}-14`)
  await capture('sprint-plan', '새 스프린트 계획', '04-sprints', '기본·프로젝트 관리자', '목표와 기간을 지정해 다음 스프린트를 준비합니다.', ['이름·목표·시작일·종료일', '계획 상태 생성', '기간 검증', '프로젝트당 진행 스프린트 하나'])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '스프린트 종료', exact: true }).click()
  await page.getByRole('dialog').getByRole('combobox').selectOption(String(plannedSprint.id))
  await capture('sprint-close', '스프린트 종료와 이월', '04-sprints', '기본·프로젝트 관리자', '미완료 티켓을 백로그 또는 다음 계획 스프린트로 이월합니다.', ['종료 확인', '미완료 업무 이동 선택', '완료·미완료 포인트 결과', '종료 이력 보존'])
  await page.getByRole('button', { name: '종료 확정', exact: true }).click()
  await page.getByRole('button', { name: '결과 보기', exact: true }).click()
  await capture('sprint-history', '종료 당시 스프린트 결과', '04-sprints', '모든 팀원', '티켓이 다음 스프린트로 이동해도 종료 당시 상태와 포인트를 다시 확인합니다.', ['종료 시점 티켓 목록', '완료·미완료 수·포인트', '당시 상태 보존', '재시작 불가'])
  await page.keyboard.press('Escape')

  await go(path('settings'), '프로젝트와 팀 설정')
  await capture('project-settings', '프로젝트 설정과 관리자', '05-settings-and-integrations', '모든 팀원·워크스페이스 관리자', '프로젝트 정보와 기본·추가 관리자를 확인하고 관리 범위를 지정합니다.', ['프로젝트 이름·키·설명·부모', '기본 OWNER·ADMIN', '프로젝트 관리자 지정·해제', '첫 티켓 후 키 변경 제한'])
  await capture('version-settings', '버전 일정 관리', '05-settings-and-integrations', '기본·프로젝트 관리자', '릴리스 묶음의 시작·완료일을 등록하고 티켓과 일정 보기에 연결합니다.', ['릴리스 버전', '시작일·완료일', '티켓 버전 연결', '일정 상속'], page.locator('.detail-panel').filter({ has: page.getByRole('heading', { name: '버전 / 마일스톤', exact: true }) }))
  await capture('team-settings', '팀원 역할·초대 관리', '05-settings-and-integrations', '워크스페이스 소유자·관리자', '팀원을 초대하고 워크스페이스 역할·소유권·멤버십을 관리합니다.', ['이메일 초대·취소·만료', 'MEMBER·ADMIN', '소유권 이전', '멤버 제거와 프로젝트 지정 해제'], page.locator('.team-settings'))
  await capture('workspace-lifecycle', '프로젝트 보관과 워크스페이스 삭제', '05-settings-and-integrations', '워크스페이스 소유자·관리자', '프로젝트는 보관·복원하고 워크스페이스 접근 종료는 이름 확인을 거칩니다.', ['프로젝트 보관·복원', '소유자만 워크스페이스 삭제', '이름 확인', '읽기 전용 상태'], page.locator('.detail-panel').filter({ has: page.getByRole('heading', { name: '워크스페이스 삭제', exact: true }) }))
  await capture('repository-integrations', 'GitHub·GitLab 저장소 연결', '05-settings-and-integrations', '워크스페이스 소유자·관리자', '저장소를 연결하고 웹훅·접근 권한·연결 상태를 관리합니다.', ['GitHub·GitLab', '접근 토큰 암호화', '웹훅 검증키', '권한 확인·연결 해제', '입력 토큰 저장 후 비움'], page.locator('.integration-settings'))
  await page.locator('.repository-list > li').first().getByRole('button', { name: '전달 기록 보기', exact: true }).click()
  await page.locator('.delivery-records').getByText('처리됨', { exact: false }).first().waitFor()
  await capture('webhook-deliveries', '웹훅 전달 기록', '05-settings-and-integrations', '워크스페이스 소유자·관리자', '수신 이벤트의 처리 상태와 시도 횟수를 확인하고 실패 전달을 다시 시도합니다.', ['전달 ID·이벤트·시도 횟수', '처리·대기·실패 상태', '실패 재시도', '중복 전달 제거'], page.locator('.repository-list'))
  await go(path(`issues/${story.id}`), story.title)
  await page.getByRole('region', { name: '개발 활동', exact: true }).getByText('병합됨', { exact: true }).first().waitFor()
  await capture('development-activity', '티켓에 연결된 커밋·PR·MR', '05-settings-and-integrations', '모든 팀원', '티켓 키로 연결된 GitHub·GitLab 개발 기록을 업무 상세에서 확인합니다.', ['커밋·PR·MR 연결', '열림·닫힘·병합 상태', '제공자 원본 링크', '이슈 상태 자동 변경 없음'], page.getByRole('region', { name: '개발 활동', exact: true }))

  // Apply the workspace policy after the original product flow. Newly required
  // planning fields do not interfere with existing execution or comments.
  const fieldPath = `auth/workspaces/${workspace.id}/ticket-fields`
  const originalPolicy = await api(fieldPath, undefined, owner.token)
  const fieldPolicy = await api(fieldPath, {
    revision: originalPolicy.revision,
    standardFields: originalPolicy.standardFields.map(field => ({ ...field,
      ...(field.key === 'title' ? { label: '티켓 제목', description: '팀원이 결과를 알아볼 수 있는 제목을 입력하세요.' } : {}),
      ...(field.key === 'priority' ? { visible: false, required: false } : {}),
      ...(field.key === 'assigneeId' ? { description: '실행 상태와 완료율을 기록할 담당자를 지정하세요.' } : {}),
    })),
    customFields: [
      { key: 'customer_group', type: 'TEXT', label: '고객군', description: '이 업무가 지원하는 고객군을 적어 주세요.', active: true, required: true, order: 0, options: [] },
      { key: 'estimated_hours', type: 'NUMBER', label: '예상 시간', description: '시간 단위입니다. 0은 추가 작업 없음, 빈 값은 미추정입니다.', active: true, required: false, order: 1, options: [] },
      { key: 'review_date', type: 'DATE', label: '목표 검토일', description: '팀과 함께 결과를 확인할 날짜입니다.', active: true, required: false, order: 2, options: [] },
      { key: 'release_channel', type: 'SELECT', label: '출시 채널', description: '업무가 적용될 채널을 선택하세요.', active: true, required: true, order: 3, options: [{ value: 'web', label: '웹 포털', active: true }, { value: 'mobile', label: '모바일', active: true }] },
    ],
  }, owner.token, 'PUT')
  const plannedTicket = await api(`projects/${project.id}/issues/${story.id}`, undefined, owner.token)
  await api(`projects/${project.id}/issues/${story.id}`, {
    title: plannedTicket.title, type: plannedTicket.type, description: plannedTicket.description,
    status: plannedTicket.status, priority: plannedTicket.priority, assigneeId: plannedTicket.assigneeId,
    startDate: plannedTicket.startDate, dueDate: plannedTicket.dueDate, progress: plannedTicket.progress,
    storyPoints: plannedTicket.storyPoints, parentId: plannedTicket.parentId, versionId: plannedTicket.versionId,
    version: plannedTicket.version, fieldRevision: fieldPolicy.revision,
    customFields: { customer_group: '고객 포털 이용자', estimated_hours: 12.5, review_date: date(10), release_channel: 'web' },
  }, owner.token, 'PUT')
  await go(`workspaces/${workspace.id}/ticket-fields`, '티켓 필드 설정')
  await page.getByRole('button', { name: '설정 저장', exact: true }).waitFor()
  await page.locator('.field-definition').filter({ has: page.locator('summary strong').filter({ hasText: /^티켓 제목$/ }) }).locator('summary').click()
  await capture('ticket-fields-standard', '팀에 맞는 표준 티켓 필드', '05-settings-and-integrations', '워크스페이스 소유자·관리자', '필드 이름·입력 안내·표시 여부·필수 여부·순서를 워크스페이스 단위로 정합니다.', ['모든 프로젝트에 같은 양식 적용', '핵심 제목·유형·상태·완료율 유지', '숨긴 필드의 기존 값 보존', '저장 전 입력 구성 미리보기'])
  const customSection = page.getByRole('group', { name: '커스텀 필드', exact: true })
  await customSection.locator('.field-definition').first().locator('summary').click()
  await page.locator('.field-preview').evaluate(element => element.scrollTo(0, element.scrollHeight))
  await capture('ticket-fields-custom', '커스텀 필드와 입력 구성 미리보기', '05-settings-and-integrations', '워크스페이스 소유자·관리자', '텍스트·숫자·날짜·단일 선택 정보를 추가하고 팀의 입력 양식을 확인합니다.', ['활성 필드 최대 30개', '필수·선택·설명·순서 설정', '저장 후 타입 고정', '필드·선택지 비활성화와 기존 값 보존'], customSection)

  await go(path(`issues/${story.id}`), story.title)
  await page.getByRole('button', { name: '이슈 편집', exact: true }).click()
  await page.getByLabel('고객군', { exact: true }).waitFor()
  const ticketExtras = page.getByRole('group', { name: '추가 정보', exact: true })
  await capture('ticket-custom-form', '티켓 계획에 팀별 추가 정보 입력', '03-tickets-and-views', '기본·프로젝트 관리자', '팀이 정한 필드와 필수 조건을 티켓 생성·계획 편집에 적용합니다.', ['텍스트·숫자·날짜·선택 입력', '0과 미추정 구분', '필드별 입력 안내', '담당자의 실행 수정은 기존 범위 유지'], ticketExtras)
  await page.getByLabel('티켓 제목', { exact: true }).fill('')
  await page.getByLabel('고객군', { exact: true }).fill('')
  await page.getByLabel('출시 채널', { exact: true }).selectOption('')
  await page.getByRole('button', { name: '변경 저장', exact: true }).click()
  await page.getByLabel('티켓 제목', { exact: true }).and(page.locator('[aria-invalid="true"]')).waitFor()
  assert.equal(await page.getByLabel('예상 시간', { exact: true }).inputValue(), '12.5', 'Validation must preserve other inputs')
  await capture('ticket-validation', '필드별 검증과 입력 내용 보존', '03-tickets-and-views', '티켓 편집 사용자', '잘못된 입력을 저장하기 전에 오류 요약과 해당 필드의 설명으로 안내합니다.', ['Valibot 입력 검증', '필수 오류·필드 오류 연결', '오류 요약에서 입력으로 이동', '오류에도 작성한 다른 값 보존'])
  await page.getByRole('button', { name: '취소', exact: true }).click()
  await page.getByRole('heading', { name: '추가 정보', exact: true }).waitFor()
  await capture('ticket-custom-detail', '저장된 팀별 추가 정보 확인', '03-tickets-and-views', '모든 팀원', '티켓 상세에서 팀이 정한 추가 정보를 읽고 계획·실행 맥락을 공유합니다.', ['표시 이름과 타입별 값', '단일 선택의 선택지 이름', '일반 팀원의 조회', '필드 비활성화 후 기존 값 보존'], page.getByRole('heading', { name: '추가 정보', exact: true }))
  await go(`projects/${empty.id}/wbs`, 'WBS')
  await capture('empty-project', '프로젝트 시작 전 빈 상태', '05-settings-and-integrations', '모든 팀원·관리자', '업무가 없는 프로젝트에서는 0건과 업무 없음을 표시하고 첫 티켓을 만들 수 있습니다.', ['빈 결과 안내', '완료로 오해하지 않는 팀 집계', '첫 티켓 생성'])
  await api(`projects/${project.id}`, { name: project.name, description: '고객 포털 고도화', archived: true }, owner.token, 'PUT')
  await go(path('wbs'), 'WBS')
  await capture('archived-project', '보관 프로젝트의 읽기 전용 WBS', '05-settings-and-integrations', '모든 팀원', '지난 프로젝트의 업무·진척은 남겨 두면서 변경을 제한합니다.', ['보관 안내', '변경 버튼 비활성', '조회·필터·접기 가능', '관리자 복원'])
  await api(`projects/${project.id}`, { name: project.name, archived: false }, owner.token, 'PUT')
  assert.deepEqual(errors, [], 'Product photography must have no browser script errors')
  writeFileSync(join(output, '../screenshots.json'), JSON.stringify({ capturedAt, timezone: 'Asia/Seoul', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), demo: 'Aurora 제품팀 / 고객 포털 고도화', providerMode: 'local signed GitHub/GitLab provider fixture; no live provider account', viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, screenshots: shots }, null, 2) + '\n')
  console.log(`Completed ${shots.length} actual product screenshots at 1920×1080; no script errors.`)
} catch (cause) {
  const diagnostics = resolve(process.env.ARC_CAPTURE_ARTIFACTS_DIR ?? '.ci-artifacts/product-capture')
  mkdirSync(diagnostics, { recursive: true })
  await page.screenshot({ path: join(diagnostics, 'capture-failure.png') }).catch(() => undefined)
  throw cause
} finally {
  if (workspace && owner) await api(`auth/workspaces/${workspace.id}`, { confirmation: workspaceName }, owner.token, 'DELETE').catch(() => undefined)
  await browser.close()
  await http.dispose()
}
