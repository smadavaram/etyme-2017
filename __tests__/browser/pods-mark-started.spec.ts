import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/**
 * Project teams (record 120): the supplier presses "Mark started" on a
 * planned deliverable on the seeded world, and the test proves it three
 * ways: the sentence, the record on reload, and the row (set once).
 *
 * The sale is written by `sellPod` itself, in the test's own database, so
 * the screen is pressed over a real sold project. Plugin tables are never
 * seeded, so the test builds its own world.
 */
const url = process.env.ONE_CARD_DB!
process.env.DATABASE_URL = url
const db = new PrismaClient({ datasourceUrl: url })
const s: Record<string, string> = {}

async function sitAs(page: Page, as: string, desk: string) {
  const res = await page.request.post('/api/demo', { data: { as, desk } })
  expect(res.ok(), `the demo seat ${as}/${desk} opened`).toBe(true)
}

test.beforeAll(async () => {
  const { sellPod } = await import('@/lib/money/pod-sale')
  const seller = await db.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  const client = await db.company.findUniqueOrThrow({ where: { slug: 'world-northbend' }, select: { id: true } })
  await db.company.update({ where: { id: seller.id }, data: { pluginsOn: ['PODS'] } })
  const acceptor = await db.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran', contexts: { some: { companyId: client.id, revokedAt: null } } }, select: { id: true } })
  const person = await db.person.create({ data: { name: 'Ines Marlowe', primaryEmail: 'ines.started@seed.etyme.invalid' } })
  await db.context.create({ data: { personId: person.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
  const pod = await db.pod.create({
    data: { companyId: seller.id, name: 'Started team', pricing: 'RATE_CARD', currency: 'USD', roles: { create: [{ title: 'Engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: person.id } } }] } },
    select: { id: true },
  })
  const r = await db.$transaction((tx) => sellPod(tx as never, {
    podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: acceptor.id, decidedBy: acceptor.id,
    projectName: 'Started build', kind: 'MILESTONE', priceCents: 1_000_000, currency: 'USD',
    deliverables: [{ name: 'Stage one of started build', amountCents: 1_000_000, dueOn: null }],
  }))
  if (!r.ok) throw new Error(JSON.stringify(r))
  s.project = r.podProjectId
})

test.afterAll(async () => { await db.$disconnect() })

test('the supplier presses Mark started, and the sentence, the record on reload and the row all agree', async ({ page }) => {
  await sitAs(page, 'world-brightmoor', 'account')
  await page.goto('/dashboard/pods')
  const project = page.getByLabel('Project Started build')
  await expect(project).toBeVisible()
  await expect(project).toContainText('planned')
  const before = await db.podDeliverable.findFirstOrThrow({ where: { podProjectId: s.project } })
  expect(before.startedAt).toBeNull()

  await project.getByRole('button', { name: 'Mark started' }).click()

  // 1. The sentence.
  await expect(page.getByRole('status')).toContainText('Stage one of started build is marked started.')
  // 2. The record, on reload: in progress, and no button left to press.
  await page.reload()
  const again = page.getByLabel('Project Started build')
  await expect(again).toContainText('in progress')
  await expect(again.getByRole('button', { name: 'Mark started' })).toHaveCount(0)
  // 3. The row: set once.
  const row = await db.podDeliverable.findFirstOrThrow({ where: { podProjectId: s.project } })
  expect(row.startedAt).not.toBeNull()
})
