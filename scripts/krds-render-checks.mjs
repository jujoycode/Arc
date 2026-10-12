import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function settled(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

// Inspect the real keyboard target and painted controls; never focus/scroll fields to make a check pass.
async function focusedDialogControl(page) {
  await settled(page)
  return page.evaluate(() => {
    const node = document.activeElement, dialog = document.querySelector('[role="dialog"]')
    const body = dialog?.querySelector('.ticket-dialog-body') ?? dialog, actions = body?.querySelector('.arc-form-actions')
    const r = node.getBoundingClientRect(), d = dialog.getBoundingClientRect()
    const b = body?.getBoundingClientRect(), a = actions?.getBoundingClientRect()
    const inBody = body?.contains(node), inActions = actions?.contains(node)
    const top = inBody ? Math.max(b.top, d.top, 0) : Math.max(d.top, 0)
    const stickyActions = actions && ['sticky', 'fixed'].includes(getComputedStyle(actions).position)
    const bottom = inBody ? Math.min(b.bottom, d.bottom, innerHeight, inActions || !stickyActions ? Infinity : a?.top ?? Infinity) : Math.min(d.bottom, innerHeight)
    const style = getComputedStyle(node), outline = style.outlineStyle === 'none' ? 0 : parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset))
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
    return { id: node.id, tag: node.tagName, text: node.textContent?.trim(), inside: !!dialog?.contains(node),
      title: node.id === 'form-field-title', action: !!inActions, close: node.closest('[data-slot="dialog-close"]') !== null,
      top: r.top, bottom: r.bottom, clipTop: top, clipBottom: bottom, scrollTop: body?.scrollTop, outline,
      visible: r.top - outline >= top - 1 && r.bottom + outline <= bottom + 1 && (hit === node || node.contains(hit)) }
  })
}

export async function checkControlledDialog(page, opener, output, name, { shortLoop = false, dismiss = 'Escape' } = {}) {
  const viewport = page.viewportSize(), samples = [], failures = []
  let returned = false
  try {
    if (shortLoop) await page.setViewportSize({ width: 360, height: 420 })
    await opener.focus()
    const handle = await opener.elementHandle()
    await page.keyboard.press('Enter')
    await page.getByRole('dialog').waitFor()
    await page.getByRole('dialog').locator('.loading-state').waitFor({ state: 'detached' })
    await settled(page)
    assert.ok(await page.getByRole('dialog').evaluate(node => node.contains(document.activeElement)), `${name}: dialog autofocus`)
    if (shortLoop) {
      const pageScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
      let foundTitle = false, sawAction = false, sawClose = false, forwardWrapped = false, reverseWrapped = false
      for (let step = 0; step < 70; step++) {
        await page.keyboard.press('Tab')
        const sample = await focusedDialogControl(page)
        samples.push({ direction: 'forward', step, ...sample })
        if (sample.id === 'form-field-description' && !samples.slice(0, -1).some(item => item.id === sample.id)) await page.screenshot({ path: join(output, `dialog-${name}-description.png`) })
        if (!sample.inside || !sample.visible) failures.push(`forward ${step}: ${sample.id || sample.text} is outside the visible dialog interval`)
        if (sample.title && foundTitle && sawAction && sawClose) { forwardWrapped = true; break }
        if (sample.title) foundTitle = true
        if (foundTitle) { sawAction ||= sample.action; sawClose ||= sample.close }
      }
      if (!forwardWrapped) failures.push('complete forward loop did not visit title, actions, close and title again')
      // Start at the returned title. Shift+Tab must wrap through close/actions and back to title.
      sawAction = false; sawClose = false
      for (let step = 0; step < 70; step++) {
        await page.keyboard.press('Shift+Tab')
        const sample = await focusedDialogControl(page)
        samples.push({ direction: 'reverse', step, ...sample })
        if (!sample.inside || !sample.visible) failures.push(`reverse ${step}: ${sample.id || sample.text} is outside the visible dialog interval`)
        sawAction ||= sample.action; sawClose ||= sample.close
        if (sample.title && sawAction && sawClose) { reverseWrapped = true; break }
      }
      if (!reverseWrapped) failures.push('complete reverse loop did not visit close, actions and title')
      const afterScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
      if (pageScroll.x !== afterScroll.x || pageScroll.y !== afterScroll.y) failures.push('dialog focus reveal moved the background page')
      await page.screenshot({ path: join(output, `dialog-${name}.png`) })
    }
    if (dismiss === 'Escape') await page.keyboard.press('Escape')
    else {
      // Reach cancel/close by keyboard too; pointer auto-scroll would conceal focus visibility defects.
      for (let step = 0; step < 70; step++) {
        const match = await page.getByRole('dialog').getByRole('button', { name: dismiss, exact: true }).evaluate(node => node === document.activeElement)
        if (match) break
        await page.keyboard.press('Tab')
      }
      assert.ok(await page.getByRole('dialog').getByRole('button', { name: dismiss, exact: true }).evaluate(node => node === document.activeElement), `${name}: keyboard reaches ${dismiss}`)
      await page.keyboard.press('Enter')
    }
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    try { await page.waitForFunction(node => document.activeElement === node, handle, { timeout: 1500 }); returned = true } catch { failures.push('dismissal did not return focus to the exact opener') }
    writeFileSync(join(output, `dialog-${name}.json`), JSON.stringify({ name, shortLoop, dismiss, returned, failures, samples, active: await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id })) }, null, 2))
    await handle.dispose()
    assert.deepEqual(failures, [], `${name}: controlled dialog keyboard regressions`)
  } finally {
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
    await page.setViewportSize(viewport)
  }
}

export async function checkGanttGeometry(page, output, name, fromName, toName) {
  await settled(page)
  const measurement = await page.evaluate(({ fromName, toName }) => {
    const rect = node => {
      const r = node.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, centerY: (r.top + r.bottom) / 2 }
    }
    const left = [...document.querySelectorAll('.issue-row')], right = [...document.querySelectorAll('.timeline-row')]
    const rows = left.map((node, index) => ({ name: node.querySelector('.issue-select')?.getAttribute('aria-label'), left: rect(node), right: rect(right[index]), bar: right[index].querySelector('.schedule-bar') ? rect(right[index].querySelector('.schedule-bar')) : null }))
    const bars = [...document.querySelectorAll('.schedule-bar')]
    const from = bars.find(node => node.getAttribute('aria-label').startsWith(fromName)), to = bars.find(node => node.getAttribute('aria-label').startsWith(toName))
    const path = document.querySelector('.relation-overlay:not(.progress-overlay) > g > path')
    const point = length => {
      const p = path.getPointAtLength(length), screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM())
      return { x: screen.x, y: screen.y }
    }
    return { leftCount: left.length, rightCount: right.length, rows, relation: path && from && to ? { start: point(0), end: point(path.getTotalLength()), from: rect(from), to: rect(to) } : null,
      leftHeader: rect(document.querySelector('.issue-header')), rightHeader: { top: document.querySelector('.month-header').getBoundingClientRect().top, bottom: document.querySelector('.day-header').getBoundingClientRect().bottom } }
  }, { fromName, toName })
  writeFileSync(join(output, `gantt-geometry-${name}.json`), JSON.stringify(measurement, null, 2))
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${name}: ${label}: ${actual} vs ${expected}`)
  assert.equal(measurement.leftCount, measurement.rightCount, `${name}: both panes show the same rows`)
  near(measurement.leftHeader.height, 72, 'left header height')
  near(measurement.rightHeader.bottom - measurement.rightHeader.top, 72, 'date header height')
  near(measurement.rows[0].left.top, measurement.leftHeader.bottom, 'left first row meets header')
  near(measurement.rows[0].right.top, measurement.rightHeader.bottom, 'right first row meets header')
  for (const row of measurement.rows) {
    near(row.left.height, 48, `${row.name} left row height`)
    near(row.right.height, 48, `${row.name} right row height`)
    near(row.left.top, row.right.top, `${row.name} row top alignment`)
    near(row.left.bottom, row.right.bottom, `${row.name} row bottom alignment`)
    if (row.bar) near(row.bar.centerY, row.left.centerY, `${row.name} bar center`)
  }
  assert.ok(measurement.relation, `${name}: fixture relation is rendered`)
  const relation = measurement.relation
  near(relation.start.y, relation.from.centerY, 'relation source center')
  near(relation.end.y, relation.to.centerY, 'relation target center')
  near(relation.start.x, relation.from.right, 'relation source edge')
  near(relation.end.x, relation.to.left, 'relation target edge')
}

export async function checkTicketTableKeyboard(page, output) {
  const viewport = page.viewportSize()
  const region = page.getByRole('region', { name: '티켓 목록표', exact: true })
  try {
    await page.setViewportSize({ width: 360, height: 420 })
    // This toolbar button precedes the region. Only Tab may enter the table.
    await page.getByRole('button', { name: '기본 열로 복원', exact: true }).focus()
    let reached = false
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press('Tab')
      if (await region.evaluate(node => node === document.activeElement)) { reached = true; break }
    }
    assert.ok(reached, 'Normal Tab reaches the named ticket table scroll region')
    const before = await region.evaluate(node => ({ scroll: node.scrollLeft, width: node.clientWidth, content: node.scrollWidth }))
    assert.ok(before.content > before.width, 'The named table region owns actual horizontal overflow')
    for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => document.querySelector('.table-wrap').scrollLeft > 0)
    await settled(page)
    const right = await region.evaluate(node => node.scrollLeft)
    for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(previous => document.querySelector('.table-wrap').scrollLeft < previous, right)
    const left = await region.evaluate(node => node.scrollLeft)
    assert.equal(await page.evaluate(() => scrollX), 0, 'Arrow keys scroll the table, not the page')
    const lastSort = region.getByRole('button').last()
    for (let step = 0; step < 30; step++) {
      await page.keyboard.press('Tab')
      if (await lastSort.evaluate(node => node === document.activeElement)) break
    }
    assert.ok(await lastSort.evaluate(node => node === document.activeElement), 'Tab reaches the last table column sort control')
    const visible = await lastSort.evaluate(node => {
      const r = node.getBoundingClientRect(), owner = node.closest('.table-wrap').getBoundingClientRect()
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
      return { left: r.left, right: r.right, ownerLeft: owner.left, ownerRight: owner.right, uncovered: hit === node || node.contains(hit) }
    })
    assert.ok(visible.left >= visible.ownerLeft - 1 && visible.right <= visible.ownerRight + 1 && visible.uncovered, 'Tab reveals the last column without fixed UI covering it')
    writeFileSync(join(output, 'ticket-table-keyboard.json'), JSON.stringify({ reached, before, right, left, visible }, null, 2))
  } finally {
    await region.evaluate(node => { node.scrollLeft = 0 })
    await page.setViewportSize(viewport)
  }
}
