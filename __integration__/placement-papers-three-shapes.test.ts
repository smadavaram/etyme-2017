import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as placement } from '@/app/api/placements/[id]/route'
import { POST as docsPOST } from '@/app/api/documents/route'
import { POST as sendPOST } from '@/app/api/documents/[id]/send/route'
import { askedWords, examinedWords, receivedWords } from '@/app/dashboard/placements/[id]/papers-table'

/**
 * Record 117, step 2 (demand half): the papers on a contract line, read
 * through the placement route on the seeded world, across three shapes of
 * line and the seats that read them.
 *
 *   a customer line that is a firm's own W2   Samuel at Halcyon, for its own customer
 *   the firm's own W2 buy side                the same line, read by Halcyon
 *   a supplier's person, one rung down        Priya at Tecwyn, sold up to
 *                                             Computer Systems, who sells
 *                                             her to Harlow Health
 *
 * The rule under the third: a client never learns its supplier's
 * supplier's name, and the papers the sub-vendor asked for do not carry it.
 */
const HALCYON = 'world-halcyon@demo.etyme.local'
const CORNING = 'world-corning@demo.etyme.local'
const NIKE = 'world-nike@demo.etyme.local'
const TECWYN = 'world-tecwyn@demo.etyme.local'
const CS = 'world-computer-systems@demo.etyme.local'
const HARLOW = 'world-harlow-health@demo.etyme.local'

let samuelLine = ''
let tecwynLine = ''
let csToHarlow = ''
let tecwynName = ''
let tecwynId = ''
let halcyonName = ''

const open = async (seat: string, id: string) => {
  as(seat)
  return json(await placement(req('GET', `/api/placements/${id}`), { params: Promise.resolve({ id }) }))
}
const slug = (s: string) => prisma.company.findFirstOrThrow({ where: { slug: s }, select: { id: true, name: true } })

beforeAll(async () => {
  await freshWorld()
  const [halcyon, corning, tecwyn, cs, harlow] = await Promise.all(['world-halcyon', 'world-corning', 'world-tecwyn', 'world-computer-systems', 'world-harlow-health'].map(slug))
  halcyonName = halcyon.name
  tecwynName = tecwyn.name
  tecwynId = tecwyn.id
  samuelLine = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: halcyon.id, clientCompanyId: corning.id, person: { name: 'Samuel Adeyinka' } }, select: { id: true } })).id
  tecwynLine = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: tecwyn.id, clientCompanyId: cs.id, person: { name: 'Priya Ramesh' } }, select: { id: true } })).id
  csToHarlow = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: cs.id, clientCompanyId: harlow.id, person: { name: 'Priya Ramesh' } }, select: { id: true } })).id
}, 600_000)

/** The first paper this seat is offered the Ask door for, on this line. */
async function askDoor(seat: string, line: string) {
  const r = await open(seat, line)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  const doors = r.body.data.checklist.paperDoors as Record<string, { doors: { kind: string; documentTypeKey?: string; paperLabel?: string; personId?: string; contractId?: string }[] }>
  const hit = Object.entries(doors).flatMap(([key, d]) => d.doors.filter((x) => x.kind === 'ASK').map((door) => ({ key, door })))[0]
  expect(hit, `an Ask door on ${line} for ${seat}`).toBeDefined()
  return hit!
}

/** Ask with exactly the fields the table's door sends, then send it, as the dialog does. */
async function askAndSend(seat: string, door: { documentTypeKey?: string; paperLabel?: string; personId?: string; contractId?: string }) {
  as(seat)
  const made = await json(await docsPOST(req('POST', '/api/documents', {
    type: 'ask', documentTypeKey: door.documentTypeKey, paperLabel: door.paperLabel, personId: door.personId, contractId: door.contractId,
  })))
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const id = made.body.data.instance.id as string
  const sent = await json(await sendPOST(req('POST', `/api/documents/${id}/send`, {}), { params: Promise.resolve({ id }) } as never))
  expect(sent.status, JSON.stringify(sent.body)).toBe(200)
  return id
}

const item = (body: any, key: string) => body.data.checklist.items.find((i: any) => i.key === key)

describe('the papers on a customer line, which is a firm’s own W2', () => {
  let key = ''
  let instanceId = ''

  it('before anybody is asked, every paper carries the four facts as empty, never as a guess', async () => {
    const { key: k } = await askDoor(HALCYON, samuelLine)
    key = k
    const r = await open(HALCYON, samuelLine)
    const it = item(r.body, key)
    expect(it).toMatchObject({ asked: null, received: null, examined: null })
    expect(askedWords(it)).toBe('—')
  })

  it('the Ask door the table draws is accepted by the route with the fields the table sends, and keeps the line it was asked on', async () => {
    const { key: k, door } = await askDoor(HALCYON, samuelLine)
    key = k
    instanceId = await askAndSend(HALCYON, door)
    const kept = await prisma.docInstance.findUniqueOrThrow({ where: { id: instanceId }, select: { sellContractId: true } })
    expect(kept.sellContractId).toBe(samuelLine)
  })

  it('the firm’s own seat reads that it asked, by its own name, and the Ask door stays beside the paper to ask again', async () => {
    const r = await open(HALCYON, samuelLine)
    expect(item(r.body, key).asked).toMatchObject({ via: 'PAPER', firmName: halcyonName })
    expect(askedWords(item(r.body, key))).toContain(halcyonName)
    expect(r.body.data.checklist.paperDoors[key].doors.some((d: any) => d.kind === 'ASK')).toBe(true)
  })

  it('a paper that arrived and nobody examined reads Arrived, not examined, to the firm and to its client', async () => {
    await prisma.docInstance.update({ where: { id: instanceId }, data: { status: 'UPLOADED', signedAt: new Date(), fileName: 'arrived.pdf' } })
    for (const seat of [HALCYON, CORNING]) {
      const r = await open(seat, samuelLine)
      expect(r.status, seat).toBe(200)
      const it = item(r.body, key)
      expect(it.examined.state, seat).toBe('NOT_EXAMINED')
      expect(examinedWords(it), seat).toBe('Arrived, not examined')
      expect(receivedWords(it), seat).toContain('arrived.pdf')
    }
  })

  it('the client reads the seller it pays by name, because the seller is the rung it pays', async () => {
    const r = await open(CORNING, samuelLine)
    expect(item(r.body, key).asked.firmName).toBe(halcyonName)
  })

  it('a seat with no part in the line is refused and reads no paper facts at all', async () => {
    const r = await open(NIKE, samuelLine)
    expect(r.status).not.toBe(200)
    expect(JSON.stringify(r.body)).not.toContain('arrived.pdf')
    expect(JSON.stringify(r.body)).not.toContain('"asked"')
  })
})

describe('the papers on a supplier’s person, one rung below the client', () => {
  let key = ''

  it('the sub-vendor asks for a paper on its own line and reads it as asked, by its own name', async () => {
    const hit = await askDoor(TECWYN, tecwynLine)
    key = hit.key
    await askAndSend(TECWYN, hit.door)
    const r = await open(TECWYN, tecwynLine)
    expect(item(r.body, key).asked).toMatchObject({ via: 'PAPER', firmName: tecwynName })
  })

  it('the prime that buys her reads that its sub-vendor asked, by name', async () => {
    const r = await open(CS, tecwynLine)
    expect(r.status).toBe(200)
    expect(item(r.body, key).asked.firmName).toBe(tecwynName)
  })

  it('the client above the prime never learns the sub-vendor’s name from what was asked, and the line carries no trace of it in the papers', async () => {
    const r = await open(HARLOW, csToHarlow)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const items = JSON.stringify(r.body.data.checklist.items)
    expect(items).not.toContain(tecwynName)
    expect(items).not.toContain(tecwynId)
    const asked = item(r.body, key).asked
    // The ask is shown to her, with the firm withheld.
    expect(asked).not.toBeNull()
    expect(asked.firmName).toBeNull()
    expect(asked.firmId).toBeNull()
    expect(askedWords(item(r.body, key))).not.toContain('supplier’s supplier')
  })

  it('the examiner at a withheld firm is withheld with it', async () => {
    const r = await open(HARLOW, csToHarlow)
    const e = item(r.body, key).examined
    if (e && e.firmId === null) expect(e.by).toBeNull()
  })

  it('a seat that is a stranger to the sub-vendor’s line is refused and reads no facts', async () => {
    const r = await open(NIKE, tecwynLine)
    expect(r.status).not.toBe(200)
    expect(JSON.stringify(r.body)).not.toContain(tecwynName)
  })
})

describe('a screening verdict a sub-vendor ordered never carries its name to the client above the prime', () => {
  const said = `${'Tecwyn'} Screening reports clear`
  let screenKey = ''

  it('a client reading the prime’s line has no trace of the sub-vendor’s name or id in the checklist, the compliance list or the facts', async () => {
    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: csToHarlow }, select: { personId: true } })
    const row = await prisma.verification.create({
      data: {
        personId: line.personId, uploadedById: line.personId, type: 'DRUG_SCREENING', status: 'CLEAR', provider: `${tecwynName} Screening`, referenceId: 'R-4471',
        verifiedAt: new Date(), orderedByCompanyId: tecwynId, result: { providerSays: said },
      },
      select: { type: true },
    })
    screenKey = row.type
    const r = await open(HARLOW, csToHarlow)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const everywhere = JSON.stringify([r.body.data.checklist, r.body.data.compliance])
    expect(everywhere).not.toContain(tecwynName)
    expect(everywhere).not.toContain(tecwynId)
    expect(everywhere.toLowerCase()).not.toContain('tecwyn')
  })

  it('the prime and the sub-vendor still read the screening company and its word', async () => {
    for (const seat of [CS, TECWYN]) {
      const r = await open(seat, seat === CS ? csToHarlow : tecwynLine)
      expect(r.status, seat).toBe(200)
      expect(JSON.stringify(r.body.data.compliance.person), seat).toContain(`${tecwynName} Screening`)
    }
    const r = await open(CS, csToHarlow)
    expect(item(r.body, screenKey)?.verdict?.provider).toContain(tecwynName)
  })
})
