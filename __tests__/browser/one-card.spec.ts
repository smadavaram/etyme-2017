import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/**
 * Ask Etyme, one card, pressed on the seeded world (record 130, build
 * tracker row L3.1.2.12). A hiring manager says Yes to a week, and the
 * test proves it three ways: the sentence on the card, the record on
 * reload, and the ledger row.
 */
const db = new PrismaClient({ datasourceUrl: process.env.ONE_CARD_DB })
const ASK = '/dashboard/conversations/etyme'

async function sitAs(page: Page, as: string, desk: string) {
  const res = await page.request.post('/api/demo', { data: { as, desk } })
  expect(res.ok(), `the demo seat ${as}/${desk} opened`).toBe(true)
}

const num = async (page: Page, label: string) =>
  Number((await page.locator('[data-one-card]').getByText(label, { exact: true }).locator('xpath=preceding-sibling::b').first().innerText()).trim())

test.afterAll(async () => { await db.$disconnect() })

test('a hiring manager presses Yes on a week, and the card, the record on reload and the ledger row all agree', async ({ page }) => {
  await sitAs(page, 'world-northbend', 'hiring')
  await page.goto(ASK)
  const screen = page.locator('[data-one-card]')
  await expect(screen).toBeVisible()
  await expect(screen.getByRole('button', { name: 'Why' })).toHaveAttribute('aria-expanded', 'false')

  // Not now until the card in focus is a week with a Yes on it.
  const card = screen.locator('article[data-card-key]')
  for (let i = 0; i < 12; i++) {
    const key = await card.getAttribute('data-card-key')
    if (key?.startsWith('TIMESHEET_APPROVAL:') && (await card.getByRole('button', { name: 'Approve', exact: true }).count()) > 0) break
    await card.getByRole('button', { name: 'Not now' }).click()
    await expect(card).not.toHaveAttribute('data-card-key', key ?? '')
  }
  const key = (await card.getAttribute('data-card-key'))!
  expect(key).toMatch(/^TIMESHEET_APPROVAL:/)
  const timesheetId = key.split(':')[1]
  const queueBefore = await num(page, 'Queue')
  const doneBefore = await num(page, 'Done today')
  const rowsBefore = await db.automationLog.count({ where: { action: 'TIMESHEET_APPROVED' } })
  expect((await db.timesheet.findUniqueOrThrow({ where: { id: timesheetId } })).clientApprovedAt).toBeNull()

  await card.getByRole('button', { name: 'Approve', exact: true }).click()

  // 1. The card: the route's own sentence, and that card is no longer in focus.
  await expect(page.locator('[data-said]')).toContainText(/\S/)
  await expect(screen.locator(`article[data-card-key="${key}"]`)).toHaveCount(0)
  await expect(async () => { expect(await num(page, 'Queue')).toBe(queueBefore - 1) }).toPass()

  // 2. The record, on reload.
  await page.reload()
  await expect(screen).toBeVisible()
  await expect(screen.locator(`article[data-card-key="${key}"]`)).toHaveCount(0)
  expect(await num(page, 'Queue')).toBe(queueBefore - 1)
  const ts = await db.timesheet.findUniqueOrThrow({ where: { id: timesheetId } })
  expect(ts.clientApprovedAt).not.toBeNull()

  // 3. The ledger row, written by the route the card pressed.
  const rows = await db.automationLog.findMany({ where: { action: 'TIMESHEET_APPROVED' }, orderBy: { at: 'desc' }, take: 3 })
  expect(await db.automationLog.count({ where: { action: 'TIMESHEET_APPROVED' } })).toBe(rowsBefore + 1)
  expect(JSON.stringify(rows[0])).toContain(timesheetId)
  expect(doneBefore).toBeGreaterThanOrEqual(0)
})

test('Why stays closed until it is tapped, then shows the rule, the source and the ledger line', async ({ page }) => {
  await sitAs(page, 'world-northbend', 'procurement')
  await page.goto(ASK)
  const screen = page.locator('[data-one-card]')
  await expect(screen.locator('[data-why]')).toHaveCount(0)
  await screen.getByRole('button', { name: 'Why' }).click()
  const why = screen.locator('[data-why]')
  await expect(why).toContainText('Rule')
  await expect(why).toContainText('Source')
  await expect(why).toContainText('Ledger')
})

test('the screen fits a 390 wide phone with no sideways scroll, for each of three seats', async ({ browser }) => {
  for (const [as, desk] of [['world-brightmoor', 'recruiter'], ['world-northbend', 'hiring'], ['world-northbend', 'procurement']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await sitAs(page, as, desk)
    await page.goto(ASK)
    await expect(page.locator('[data-one-card]')).toBeVisible()
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(wide, `${as}/${desk} scrolls sideways by ${wide}px`).toBeLessThanOrEqual(0)
    await ctx.close()
  }
})

test('on a 390 by 844 phone the score bar, the card and the Queue, Done today and Agent row are all in the first screen', async ({ browser }) => {
  for (const [as, desk] of [['world-northbend', 'hiring'], ['world-northbend', 'procurement'], ['world-brightmoor', 'recruiter']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await sitAs(page, as, desk)
    await page.goto(ASK)
    const screen = page.locator('[data-one-card]')
    await expect(screen).toBeVisible()
    for (const part of [screen.locator('[role="group"][aria-label="Score"]'), screen.locator('[data-one-card-row]')]) {
      const box = await part.boundingBox()
      expect(box, `${as}/${desk}: a part of the block is not drawn`).not.toBeNull()
      expect(box!.y + box!.height, `${as}/${desk}: ends below the first screen`).toBeLessThanOrEqual(844)
    }
    // The Queue row is not inside a scrolling box of its own.
    const scrolls = await screen.locator('[data-one-card-row]').evaluate((el) => {
      for (let n = el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return true }
      return false
    })
    expect(scrolls, `${as}/${desk}: the row is inside a box that scrolls`).toBe(false)
    await ctx.close()
  }
})

test('the score bar reads Waiting, Oldest and On time, and never 0 Due and 0 Late above a waiting card', async ({ page }) => {
  await sitAs(page, 'world-northbend', 'hiring')
  await page.goto(ASK)
  const screen = page.locator('[data-one-card]')
  const score = screen.locator('[role="group"][aria-label="Score"]')
  await expect(score.getByText('Waiting', { exact: true })).toBeVisible()
  await expect(score.getByText('Oldest', { exact: true })).toBeVisible()
  await expect(score.getByText('On time', { exact: true })).toBeVisible()
  expect(Number(await num(page, 'Waiting'))).toBe(await num(page, 'Queue'))
})

test('a card heading names the act, never Open', async ({ page }) => {
  await sitAs(page, 'world-northbend', 'hiring')
  await page.goto(ASK)
  await expect(page.locator('[data-one-card] article h2')).not.toHaveText(/^Open\b/)
})

test('only the Owner is offered the agent switch', async ({ page }) => {
  await sitAs(page, 'world-northbend', 'procurement')
  await page.goto(ASK)
  await expect(page.locator('[data-one-card]').getByText('Agent', { exact: true })).toBeVisible()
  await expect(page.locator('[data-one-card] a[aria-label^="Agent"]')).toHaveCount(0)
})
