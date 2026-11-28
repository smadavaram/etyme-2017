import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'
import { documentsToChase, documentFindings, type LapsingDocument } from '@/lib/document-request'

/**
 * The nightly chase on the seeded world, before and after a firm's set
 * for one party is taken away.
 *
 * Every seeded firm confirmed its sets as the shipped defaults
 * (`lib/seed-setup`), so on the world as seeded the gate holds nothing
 * back. Take one firm's answer away and the night stops asking for that
 * party's papers on its behalf, and says so.
 */

const key = (d: LapsingDocument) => `${d.kind}:${d.id}:${d.tellCompanyId}`

describe('the night chases a party only where its company confirmed what it requires of it', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 900_000)

  it('a confirmed set chases exactly what it lists', async () => {
    const now = day(200)
    const gated = await documentsToChase(now)
    const open = await documentsToChase(now, { ungated: true })
    expect(open.lapsing.length + open.lapsed.length, 'the world has something running out').toBeGreaterThan(0)
    expect(gated.withheld, 'every seeded firm confirmed its sets').toEqual([])
    expect([...gated.lapsing, ...gated.lapsed].map(key).sort()).toEqual([...open.lapsing, ...open.lapsed].map(key).sort())
  })

  it('no paper is chased for a party whose set was never confirmed, and the night says so', async () => {
    const now = day(200)
    const before = await documentsToChase(now)
    const target = [...before.lapsed, ...before.lapsing].find((d) => d.tellCompanyId && d.party)
    expect(target, 'a chase made on a company’s behalf for a known party').toBeTruthy()
    const companyId = target!.tellCompanyId!
    const party = target!.party!

    await prisma.documentRequirement.deleteMany({ where: { companyId, party } })

    const after = await documentsToChase(now)
    const stillChased = [...after.lapsed, ...after.lapsing].filter((d) => d.tellCompanyId === companyId && d.party === party)
    expect(stillChased, 'nothing is chased for that party on that company’s behalf').toEqual([])

    const held = (after.withheld ?? []).find((w) => w.companyId === companyId && w.party === party)
    expect(held, 'what was held back is returned, never dropped').toBeTruthy()
    expect(held!.says).toMatch(/until you confirm what you require of them, under Setup → Papers you require\.$/)
    expect(held!.documents).toContain(target!.document)

    // Other parties and other firms are untouched.
    const others = (d: LapsingDocument) => !(d.tellCompanyId === companyId && d.party === party)
    expect([...after.lapsed, ...after.lapsing].map(key).sort()).toEqual(
      [...before.lapsed, ...before.lapsing].filter(others).map(key).sort()
    )

    // The night's findings say it, to that company, in the sentence.
    const findings = await documentFindings(now)
    const said = findings.filter((f) => f.kind === 'PAPER_CHASE_WITHHELD' && f.companyId === companyId)
    expect(said.map((f) => f.headline)).toContain(held!.says)
    expect(said[0].detail).toContain(target!.document)
  })
})
