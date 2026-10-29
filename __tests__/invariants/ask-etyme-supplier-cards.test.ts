/**
 * Ask Etyme at a firm that sells people (CLAUDE.md, "Tapin gets agents,
 * not a website", step 2, 2026-10-29). The architect put three acts in the
 * supplier's role contract; this file holds how each is said:
 *
 *   bench.put_forward     a card: who, to which job, for whom, the match's
 *                         why on tap, the band, a rate box; Yes and Not now
 *   papers.ask_for_start  a line under "Since you last looked": who was
 *                         asked for what, for which start; where the set
 *                         was never confirmed, the gate's sentence once
 *   bench.coming_free     one line of names, Our bench linked
 *
 * The record's reads are faked, so a test is about what the chat says and
 * not about a seed. The route's sentences are imported from the
 * performers, never retyped, so the card and the route cannot drift.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DB = {
  approvals: [] as any[],
  notices: [] as any[],
  twinActions: [] as any[],
  refused: null as any,
  lines: [] as any[],
}
const GATE = { now: { ok: false, says: '', step: 'PAPERS' } as any }

vi.mock('@/lib/db', () => ({
  prisma: {
    twinApproval: { findMany: vi.fn(async () => DB.approvals) },
    notification: { findMany: vi.fn(async () => DB.notices), count: vi.fn(async () => DB.notices.length) },
    twinAction: {
      findMany: vi.fn(async (args: any) => DB.twinActions.filter((a) => a.action === args.where.action)),
      findFirst: vi.fn(async () => DB.refused),
    },
    sellContract: {
      findMany: vi.fn(async () => DB.lines),
      findUnique: vi.fn(async ({ where }: any) => DB.lines.find((l) => l.id === where.id) ?? null),
    },
    person: { findMany: vi.fn(async () => []) },
    context: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
    roleContract: { findFirst: vi.fn(async () => null) },
    invoice: { findMany: vi.fn(async () => []) },
    vendorBill: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@/lib/alerts', () => ({ reportError: vi.fn(async () => undefined) }))
vi.mock('@/lib/access-log', () => ({ logBulkAccess: () => undefined, recordAccess: async () => undefined }))
vi.mock('@/lib/setup-gates', async () => {
  const rules = await vi.importActual<typeof import('@/lib/setup-gate-rules')>('@/lib/setup-gate-rules')
  return { ...rules, mayChasePaper: async () => GATE.now }
})
vi.mock('@/lib/document-stages/chase-gate', () => ({ workerPartyAt: async () => 'WORKERS_W2' }))

import { NEEDS_RATE, PUT_FORWARD_SIGNED_IN, comingFreeTitle } from '@/lib/twin/supplier-performers'
import { ownerOnlyException } from '@/lib/twin/ledger'
import { TWIN_ACTS } from '@/lib/autonomy'
import { STEP_PLACE, setNotConfirmed } from '@/lib/setup-gate-rules'
import { putForwardCard, digestHeading } from '@/lib/teams/cards'
import {
  today, sinceSays, putForwardFromPayload, putForwardPress, putForwardQuestion, putForwardScoreSays, putForwardWhyRows,
  putForwardBandSays, rateCentsFrom, startAskedSays, comingFreeLine, papersGateLine,
  PAPERS_STEP_TEXT, SETUP_HREF, OUR_BENCH_HREF, START_ASKS_HREF, COMING_FREE, START_PAPERS,
  type Readers, type NoticeLine,
} from '@/app/api/conversations/twin/ask'

const NOW = new Date('2026-10-29T14:00:00Z')

// Tapin's question, as the nightly run writes it (lib/twin/supplier-run).
const MATCH = {
  personId: 'p-felix', personName: 'Felix Brenner', jobTitle: 'Java Developer', clientName: 'Northbend Athletic',
  matchId: 'm-1', score: 84, confidence: 'HIGH',
  factors: [
    { label: 'Skills', value: 90, weight: 0.45, detail: 'Java, Spring and Kafka on the job; all three on the profile' },
    { label: 'Availability', value: 100, weight: 0.15 },
  ],
  basis: 'Skills on the profile against the job’s required skills',
  unknowns: 'No reference on file',
  bandMinCents: 7000, bandMaxCents: 8500,
}
const putRow = (over: Record<string, unknown> = {}) => ({
  id: 'appr-put', needsPermission: 'submissions.create', selfApprovalReason: null,
  requestedAt: new Date('2026-10-29T06:00:00Z'),
  twinAction: {
    id: 'entry-put', action: 'bench.put_forward', entityType: 'Requirement', entityId: 'req-java',
    ruleCited: 'Match 84 of 100, high confidence: Skills on the profile against the job’s required skills',
    rationale: 'Felix Brenner is on Tapin’s bench, and Northbend Athletic sent Java Developer to Tapin.',
    authorityPersonId: 'p-owner', payload: MATCH, companyId: 'c-tapin', twinKind: 'SUPPLIER',
    actorType: 'TWIN', actorId: 'twin-supplier', onAuthorityOfRole: 'Owner', authorityPerson: { name: 'Sharath' },
    ...over,
  },
})
const seat = (id: string, permissions: string[], kind = 'VENDOR') => ({
  person: { id, name: id }, company: { id: 'c-tapin', name: 'Tapin', kind }, permissions,
}) as any
const RECRUITER = ['submissions.create', 'consultants.write', 'bench.read']
const OWNER = ['*']

function readers(over: Partial<Readers> = {}): Readers {
  return {
    waiting: async () => [],
    othersWaiting: async () => [],
    limits: async () => ({ ok: false as const, says: 'The time limit is the client’s to read.' }),
    told: async () => ({ told: [], stale: [] }),
    spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }),
    ...over,
  } as unknown as Readers
}

describe('Ask Etyme at a firm that sells people: the three acts, said', () => {
  it('a recruiter’s greeting offers a bench person for a job as a card with the why and a rate field, and a yes without a rate is refused in the route’s sentence', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    DB.approvals = [putRow()]
    const items = await readersFor(seat('p-recruiter', RECRUITER), 'c-tapin').waiting()
    expect(items).toHaveLength(1)
    const [item] = items
    expect(item.title).toBe('Felix Brenner for Java Developer')
    const f = item.putForward!
    expect(putForwardQuestion(f)).toBe('Put Felix Brenner forward for Java Developer at Northbend Athletic?')
    // The why, never a bare number: the score with its confidence, and on tap every factor, the basis and the unknowns.
    expect(putForwardScoreSays(f.why!)).toBe('Match 84 of 100, high confidence.')
    expect(putForwardWhyRows(f.why!)).toEqual([
      { label: 'Skills', value: '90 of 100, 45% of the match. Java, Spring and Kafka on the job; all three on the profile.' },
      { label: 'Availability', value: '100 of 100, 15% of the match' },
      { label: 'Based on', value: 'Skills on the profile against the job’s required skills' },
      { label: 'Not known', value: 'No reference on file' },
    ])
    expect(putForwardBandSays(f)).toBe('The job was sent at $70.00 an hour to $85.00 an hour.')
    // A score with no reasons beside it is dropped, never shown alone.
    expect(putForwardFromPayload({ ...MATCH, factors: [] }, { needsRate: NEEDS_RATE, signedIn: PUT_FORWARD_SIGNED_IN })!.why).toBeNull()
    expect(putForwardFromPayload({ ...MATCH, basis: '' }, { needsRate: NEEDS_RATE, signedIn: PUT_FORWARD_SIGNED_IN })!.why).toBeNull()

    // The route's own sentences ride on the card, word for word.
    expect(f.needsRate).toBe(NEEDS_RATE)
    expect(f.signedIn).toBe(PUT_FORWARD_SIGNED_IN)
    // A yes with the box blank, or with something that is not a rate, is refused in that sentence and nothing is sent.
    expect(putForwardPress(item, '')).toEqual({ ok: false, says: NEEDS_RATE })
    expect(putForwardPress(item, 'about ninety')).toEqual({ ok: false, says: NEEDS_RATE })
    // A rate goes to the one approval route as the recruiter typed it, in cents an hour.
    const yes = putForwardPress(item, '$85.50')
    if (!yes.ok) throw new Error('refused')
    expect(yes.request.url).toBe('/api/twin/approvals/appr-put')
    expect(JSON.parse(yes.request.init.body)).toEqual({ decision: 'APPROVED', surface: 'WEB', answer: { rateCents: 8550 } })
    expect(rateCentsFrom('1,200')).toBe(120000)
    expect(rateCentsFrom('85/hr')).toBe(8500)
    expect(rateCentsFrom('0')).toBeNull()

    // The greeting leads with it, in the words of putting forward, and the mark's count holds it.
    const hello = await today(readers({ waiting: async () => items }), { now: NOW, greeting: true, needs: async () => 1, party: 'FIRM' })
    if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
    expect(hello.recommend?.says).toBe('Put Felix Brenner forward for Java Developer at Northbend Athletic: enter your rate and say yes, or not now.')
    expect(hello.says).toBe('One thing needs you. It is a person from your bench to put forward; enter your rate and say yes below, or not now. Checked just now.')
    for (const line of [hello.recommend!.says, hello.says, putForwardQuestion(f), putForwardBandSays(f)]) {
      expect(line).not.toMatch(/\bdesk\b|program office|twin/i)
    }

    // The card on the web draws the rate box and presses through putForwardPress; Not now changes nothing.
    const ui = readFileSync(join(process.cwd(), 'src/app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    const card = ui.slice(ui.indexOf('function PutForwardCard('), ui.indexOf('function QueueCardView('))
    expect(card).toMatch(/Your rate, an hour/)
    expect(card).toMatch(/putForwardPress\(item, rate\)/)
    expect(card).toMatch(/onLater\(item\)/)
    expect(ui).toMatch(/if \(item\.putForward\) return <PutForwardCard/)

    // In Teams there is no yes: the card says the route's own sentence and opens Ask Etyme.
    const teams = putForwardCard({
      approvalId: 'appr-put', question: putForwardQuestion(f), scoreSays: putForwardScoreSays(f.why!), whyRows: putForwardWhyRows(f.why!),
      bandSays: putForwardBandSays(f), signedIn: f.signedIn, link: 'https://etyme2040.vercel.app/dashboard/conversations',
      ruleCited: 'r', rationale: 'w',
    }) as any
    const json = JSON.stringify(teams)
    expect(json).toContain(JSON.stringify(PUT_FORWARD_SIGNED_IN).slice(1, -1))
    expect(json).not.toContain('Action.Submit')
    expect(teams.actions.map((a: any) => a.title)).toEqual(['Open Ask Etyme', 'Why?'])
    expect(digestHeading(0, 0, 0, { putForward: 2 })).toBe('2 people from your bench to put forward')
  })

  it('the Owner never says yes to putting somebody forward where another seat may', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    DB.approvals = [putRow()]
    // Ask Etyme acts on the Owner's authority, so the Owner is never asked; a recruiter is.
    expect(await readersFor(seat('p-owner', OWNER), 'c-tapin').waiting()).toEqual([])
    expect((await readersFor(seat('p-recruiter', RECRUITER), 'c-tapin').waiting()).map((i) => i.approvalId)).toEqual(['appr-put'])
    // A seat that does not put people forward is not asked either.
    expect(await readersFor(seat('p-ar', ['invoices.issue', 'invoices.read']), 'c-tapin').waiting()).toEqual([])
    // The owner-only exception is the bill's alone, and the act needs a seat that submits.
    expect(ownerOnlyException('bench.put_forward')).toBeNull()
    expect(TWIN_ACTS['bench.put_forward'].approverNeeds).toBe('submissions.create')
  })

  it('a start-papers ask reads as who was asked for what, and a refused ask names Setup → Papers you require', async () => {
    // The sentence: who, what, which start.
    expect(startAskedSays({ personName: 'Maria Lee', papers: ['I-9', 'Background check consent'], jobTitle: 'Java Developer', clientName: 'Northbend Athletic' }))
      .toBe('Ask Etyme asked Maria Lee for I-9 and Background check consent, for the Java Developer start at Northbend Athletic.')

    // HR's notice from the clearance ask, where Ask Etyme made the ask, is said in those words with the name opening the asks.
    const told = new Date('2026-10-29T06:00:05Z')
    DB.notices = [{ id: 'n-hr', type: 'CONTRACT', title: 'Maria Lee needs paperwork before starting', body: null, entityId: 'sc-maria', data: {}, createdAt: told }]
    DB.twinActions = [{ action: START_PAPERS, entityId: 'sc-maria', ts: new Date('2026-10-29T06:00:00Z'), payload: { personId: 'p-maria', personName: 'Maria Lee', asks: ['I9'] } }]
    DB.lines = [{ id: 'sc-maria', personId: 'p-maria', person: { name: 'Maria Lee' }, requirement: { title: 'Java Developer' }, clientCompany: { name: 'Northbend Athletic' } }]
    const { unreadNotices } = await import('@/app/api/conversations/twin/notices')
    const { shown } = await unreadNotices({ person: { id: 'p-hr' }, company: { id: 'c-tapin' } } as any)
    expect(shown[0].title).toMatch(/^Ask Etyme asked Maria Lee for .+, for the Java Developer start at Northbend Athletic$/)
    expect(shown[0].href).toBe(START_ASKS_HREF)
    const said = sinceSays(shown, 0, { now: NOW })
    expect(said[1].says).toBe(`${shown[0].title}.`)
    expect(said[1].links).toEqual([{ text: 'Maria Lee', href: START_ASKS_HREF }])
    // A notice of an ask a person made by hand, with no entry of Ask Etyme's beside it, keeps its own title.
    DB.twinActions = []
    expect((await unreadNotices({ person: { id: 'p-hr' }, company: { id: 'c-tapin' } } as any)).shown[0].title).toBe('Maria Lee needs paperwork before starting')

    // Refused because the set was never confirmed: the gate's own sentence, once, linking the step.
    expect(PAPERS_STEP_TEXT).toBe(STEP_PLACE.PAPERS)
    const gate = setNotConfirmed('WORKERS_W2')
    expect(papersGateLine(gate)).toEqual({ says: gate, links: [{ text: 'Setup → Papers you require', href: SETUP_HREF }] })
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    DB.refused = { entityId: 'sc-maria', payload: { said: gate } }
    GATE.now = { ok: false, says: gate, step: 'PAPERS' }
    expect(await readersFor(seat('p-hr', RECRUITER), 'c-tapin').papersGate!()).toBe(gate)
    // Confirmed since the night it was refused: nobody is told to do it again.
    GATE.now = { ok: true }
    expect(await readersFor(seat('p-hr', RECRUITER), 'c-tapin').papersGate!()).toBeNull()
    // A refusal that is not the gate's (the person already started) is not a setup line.
    GATE.now = { ok: false, says: gate, step: 'PAPERS' }
    DB.refused = { entityId: 'sc-maria', payload: { said: 'Maria Lee has already started or the line has ended, so there is no start to ask papers for.' } }
    expect(await readersFor(seat('p-hr', RECRUITER), 'c-tapin').papersGate!()).toBeNull()
    DB.refused = null

    // In the greeting: one line, outside the count, never the headline.
    const hello = await today(readers({ papersGate: async () => gate }), { now: NOW, greeting: true, needs: async () => 0, party: 'FIRM' })
    if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
    expect(hello.says).toMatch(/^Nothing needs you today/)
    expect(hello.more!.filter((l) => l.says === gate)).toHaveLength(1)
    DB.notices = []
    DB.lines = []
  })

  it('coming free is one line of names, never counted in the mark', async () => {
    const coming = [{ personId: 'p-felix', name: 'Felix Brenner', days: 18, client: 'Northbend Athletic' }]
    const idle = [{ personId: 'p-karthik', name: 'Karthik Menon', days: 21 }]
    const title = comingFreeTitle(coming, idle)
    expect(title).toBe('Felix Brenner comes off a project in 18 days; Karthik Menon has waited on the bench 21 days')
    expect(comingFreeLine(title)).toEqual({ says: `${title}. See Our bench.`, links: [{ text: 'Our bench', href: OUR_BENCH_HREF }] })

    // The notice is re-titled from the ledger entry it follows, so a title cut at 120 characters is said whole.
    const sent = new Date('2026-10-26T06:00:02Z')
    DB.notices = [
      { id: 'n-free', type: 'SYSTEM', title: title.slice(0, 40), body: null, entityId: 'c-tapin', data: { twinAction: COMING_FREE }, createdAt: sent },
      { id: 'n-free-old', type: 'SYSTEM', title: 'Ravi comes off a project in 25 days', body: null, entityId: 'c-tapin', data: { twinAction: COMING_FREE }, createdAt: new Date('2026-10-19T06:00:02Z') },
    ]
    DB.twinActions = [
      { action: COMING_FREE, companyId: 'c-tapin', ts: new Date('2026-10-26T06:00:00Z'), payload: { comingFree: coming, idle } },
      { action: COMING_FREE, companyId: 'c-tapin', ts: new Date('2026-10-19T06:00:00Z'), payload: { comingFree: [{ personId: 'p-ravi', name: 'Ravi', days: 25 }], idle: [] } },
    ]
    const { unreadNotices } = await import('@/app/api/conversations/twin/notices')
    const { shown } = await unreadNotices({ person: { id: 'p-recruiter' }, company: { id: 'c-tapin' } } as any)
    expect(shown[0]).toMatchObject({ title, href: OUR_BENCH_HREF, act: COMING_FREE })

    // Two weeks unread is one line, the newest; both notices are still marked read, because both were shown.
    const lines = sinceSays(shown, 0, { now: NOW })
    expect(lines.filter((l) => /comes off a project/.test(l.says))).toEqual([comingFreeLine(title)])
    expect(shown.map((n) => n.id)).toEqual(['n-free', 'n-free-old'])

    // Never counted: with nothing to decide, the greeting says so, and the line sits under "Since you last looked".
    const hello = await today(readers(), { now: NOW, greeting: true, needs: async () => 0, notices: { shown, older: 0 }, party: 'FIRM' })
    if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
    expect(hello.says).toMatch(/^Nothing needs you today/)
    expect(hello.items).toEqual([])
    expect(hello.more!.some((l) => l.says === comingFreeLine(title).says)).toBe(true)
    // The act asks nobody, so the mark, which counts only questions a seat may decide, never holds it.
    expect(TWIN_ACTS['bench.coming_free'].alone).toBe('TOLD')
    DB.notices = []
    DB.twinActions = []
  })

  it('a client’s greeting never carries a supplier’s cards', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    // Even a put-forward question sitting on a client's own rows is not drawn for a client's seat.
    DB.approvals = [putRow()]
    const client = (id: string) => seat(id, ['*', 'submissions.create'], 'CLIENT')
    expect(await readersFor(client('p-hiring'), 'c-tapin').waiting()).toEqual([])
    // Nor the start-papers line: setup of a supplier's paper sets is the supplier's.
    DB.refused = { entityId: 'sc-maria', payload: { said: setNotConfirmed('WORKERS_W2') } }
    expect(await readersFor(client('p-hiring'), 'c-tapin').papersGate!()).toBeNull()
    DB.refused = null
    // The three acts belong to the supplier's role contract only.
    for (const act of ['bench.put_forward', 'papers.ask_for_start', 'bench.coming_free']) {
      expect(TWIN_ACTS[act].kinds).toEqual(['SUPPLIER'])
    }
    DB.approvals = []
  })
})
