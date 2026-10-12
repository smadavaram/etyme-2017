import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { NextRequest } from 'next/server'

/**
 * Door 1 of the job twin: the Etyme bot in Microsoft Teams.
 *
 * The founder's rule for this prototype is one test file, for what can
 * lose money or break trust. Four sentences were asked for; three more
 * stand beside them because each is a way the door could be trusted
 * wrongly — a forged post, a card nobody can act on, a nudge every
 * night.
 */

vi.mock('@/lib/alerts', () => ({ reportError: vi.fn(async () => undefined) }))

import { answerCardAction, DOOR, type ActionDeps } from '@/lib/teams/actions'
import { decideApproval } from '@/lib/twin/ledger'
import {
  invoiceApprovalCard, tenureAlertCard, digestCard, digestHeading, readCardAction,
  type InvoiceApprovalFacts, type TenureAlertFacts,
} from '@/lib/teams/cards'
import { addressesOf, chooseSeat, NOBODY_HAS_THIS_EMAIL, type BoundPerson, type Seat } from '@/lib/teams/binding'
import { teamsBotEdge } from '@/lib/teams/readiness'
import { checkToken, BOT_FRAMEWORK_ISSUER, type SigningKey } from '@/lib/teams/auth'
import { toSay } from '@/lib/teams/digest'
import { POST } from '@/app/api/teams/messages/route'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const dana: BoundPerson = {
  personId: 'person_dana', personName: 'Dana Whitfield', email: 'dana@northbend.example',
  contextId: 'ctx_dana', companyId: 'co_northbend', companyName: 'Northbend Athletic', companyKind: 'CLIENT',
  roleName: 'AP Clerk', permissions: ['payments.record', 'invoices.read'],
}

const receipt: InvoiceApprovalFacts = {
  approvalId: 'appr_000001',
  number: 'INV-2026-0412',
  supplierName: 'Pinnacle Staffing',
  contractors: ['Helena Marsh'],
  periodStart: '2026-09-27',
  periodEnd: '2026-10-03',
  amountMinor: 520000,
  currency: 'USD',
  dueAt: '2026-10-20T00:00:00.000Z',
  variances: ['Helena Marsh: 41.5 h billed, 40 h accepted (+3.75%)'],
  ruleCited: 'Billed hours are within 0.5% of the 40 hours Northbend Athletic accepted for Sep 27 – Oct 3.',
  rationale: 'Pinnacle Staffing’s invoice receipt matches the signed hours and the contract rate, so it can be approved for payment.',
}

const risk: TenureAlertFacts = {
  twinActionId: 'act_000001', personName: 'Tobias Lindqvist', tier: 'WARN_60', daysToLimit: 60,
  limitOn: '2026-12-11', daysOnSite: 487, capMonths: 18, suppliers: ['Pinnacle Staffing', 'Veritan Talent'],
  ruleCited: 'Time limit 18 months; 487 days on site across two suppliers; the limit is reached Dec 11, 2026.',
  rationale: 'Tobias Lindqvist reaches the time limit in 60 days. Plan the handover or the break now.',
  escalateApprovalId: null, link: 'https://app.etyme.example/dashboard/people/p_tobias',
}

type Card = { body: any[]; actions?: any[] }
const allText = (node: unknown): string => JSON.stringify(node)

describe('the Etyme bot in Teams', () => {
  it('a card action never writes state itself; it calls the one approval route with the bound person as decider', async () => {
    const decide = vi.fn(async () => ({ ok: true as const, outcome: 'PERFORMED' as const, entryId: 'entry_1' }))
    const deps: ActionDeps = { decide, why: vi.fn() }

    const said = await answerCardAction({ etyme: 'twin.approval', approvalId: 'appr_000001', decision: 'APPROVED' }, dana, deps)

    expect(decide).toHaveBeenCalledTimes(1)
    expect(decide).toHaveBeenCalledWith({
      approvalId: 'appr_000001', decision: 'APPROVED', reason: null, surface: 'TEAMS',
      decider: {
        personId: 'person_dana', personName: 'Dana Whitfield', companyId: 'co_northbend',
        companyKind: 'CLIENT', companyName: 'Northbend Athletic', permissions: ['payments.record', 'invoices.read'],
      },
    })
    expect(said.says).toMatch(/^Approved\. It is recorded in the twin’s ledger under your name/)

    // The door the bot uses is the function the web's route uses.
    expect(DOOR.decide).toBe(decideApproval)
    expect(code(read('src/app/api/twin/approvals/[id]/route.ts'))).toContain('decideApproval(')

    // A no without a reason never reaches the door.
    decide.mockClear()
    const noReason = await answerCardAction({ etyme: 'twin.approval', approvalId: 'appr_000001', decision: 'REJECTED' }, dana, deps)
    expect(decide).not.toHaveBeenCalled()
    expect(noReason.says).toBe('Say why before rejecting, so the twin and whoever reads the ledger know. Nothing changed.')

    // What the door refuses, the bot says, word for word.
    decide.mockResolvedValueOnce({ ok: false, status: 403, says: 'Somebody has already answered this.' } as any)
    expect((await answerCardAction({ etyme: 'twin.approval', approvalId: 'appr_000001', decision: 'APPROVED' }, dana, deps)).says)
      .toBe('Somebody has already answered this.')

    // The card-action file has no database client, and nothing on the bot's path writes a twin row.
    const actions = code(read('src/lib/teams/actions.ts'))
    expect(actions).not.toMatch(/@\/lib\/db|prisma\./)
    for (const f of ['src/lib/teams/actions.ts', 'src/lib/teams/bot.ts', 'src/lib/teams/cards.ts', 'src/app/api/teams/messages/route.ts']) {
      expect(code(read(f)), f).not.toMatch(/twinApproval\.(create|update|updateMany|upsert|delete)|twinAction\.(create|update|upsert|delete)|\.\$transaction/)
    }
    // A button carries data back to the bot; it never names a route to call.
    for (const a of (invoiceApprovalCard(receipt) as Card).actions!) {
      expect(['Action.Submit', 'Action.ShowCard']).toContain(a.type)
      expect(allText(a)).not.toContain('/api/')
    }
  })

  it('an approval card carries the amount, supplier, contractor, period, variance and the rule, and Why? answers with the ledger’s own words', async () => {
    const card = invoiceApprovalCard(receipt) as Card
    const text = allText(card.body)
    expect(card.body[0].text).toBe('Invoice receipt INV-2026-0412 from Pinnacle Staffing needs your approval')
    const facts = Object.fromEntries(card.body[1].facts.map((f: any) => [f.title, f.value]))
    expect(facts).toMatchObject({
      Amount: '$5,200.00',
      Supplier: 'Pinnacle Staffing',
      Contractor: 'Helena Marsh',
      Period: 'Sep 27 – Oct 3, 2026',
    })
    expect(text).toContain('Helena Marsh: 41.5 h billed, 40 h accepted (+3.75%)')
    expect(text).toContain(`Rule: ${receipt.ruleCited}`)
    expect(card.actions!.map((a) => a.title)).toEqual(['Approve', 'Reject', 'Why?'])

    // Approve and Reject send the one question and the answer, nothing else.
    expect(readCardAction(card.actions![0].data)).toEqual({ etyme: 'twin.approval', approvalId: 'appr_000001', decision: 'APPROVED' })
    const reject = card.actions![1].card
    expect(reject.body.find((b: any) => b.type === 'Input.Text')).toMatchObject({ id: 'reason', isRequired: true })
    expect(readCardAction({ ...reject.actions[0].data, reason: 'Hours not agreed' }))
      .toEqual({ etyme: 'twin.approval', approvalId: 'appr_000001', decision: 'REJECTED', reason: 'Hours not agreed' })

    // Why? is the ledger entry's rule and rationale, verbatim.
    const why = card.actions![2].card.body.map((b: any) => b.text)
    expect(why).toContain(receipt.ruleCited)
    expect(why).toContain(receipt.rationale)

    // And asked as a question, the bot answers with the same words, from the reader's company only.
    const whyOf = vi.fn(async () => ({ ruleCited: receipt.ruleCited, rationale: receipt.rationale }))
    const said = await answerCardAction({ etyme: 'twin.why', approvalId: 'appr_000001' }, dana, { decide: vi.fn(), why: whyOf })
    expect(whyOf).toHaveBeenCalledWith('appr_000001', 'co_northbend')
    expect(said.says).toBe(`The rule: ${receipt.ruleCited}\n\nWhy: ${receipt.rationale}`)

    // Where the record carries no total, the card says so rather than showing a number.
    const blank = invoiceApprovalCard({ ...receipt, amountMinor: null, variances: [] }) as Card
    expect(blank.body[1].facts[0]).toEqual({ title: 'Amount', value: 'Not on the invoice receipt' })
    expect(allText(blank.body)).toContain('None. The hours and the rate agree with what was accepted and the contract.')
  })

  describe('with no bot keys', () => {
    const saved = { ...process.env }
    beforeEach(() => {
      delete process.env.MICROSOFT_APP_ID
      delete process.env.MICROSOFT_APP_PASSWORD
      delete process.env.MICROSOFT_APP_TENANT_ID
    })
    afterEach(() => { process.env = { ...saved } })

    it('with no bot keys every post is refused in a sentence and /ready says so', async () => {
      const res = await POST(new NextRequest('https://etyme.example/api/teams/messages', {
        method: 'POST', body: JSON.stringify({ type: 'message', text: 'approve everything' }),
        headers: { 'content-type': 'application/json' },
      }))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error.code).toBe('TEAMS_BOT_OFF')
      expect(body.error.message).toBe(
        'The Etyme bot for Teams is switched off on this deployment, so nothing sent here is read. ' +
        'Set MICROSOFT_APP_ID, MICROSOFT_APP_PASSWORD, MICROSOFT_APP_TENANT_ID in the deployment’s settings to turn it on (docs/teams-setup.md).'
      )

      const edge = teamsBotEdge({ missingKeys: ['MICROSOFT_APP_ID', 'MICROSOFT_APP_PASSWORD', 'MICROSOFT_APP_TENANT_ID'], bound: 0, answeredInTeams: 0, digestsDelivered: 0 })
      expect(edge.state).toBe('MISSING')
      expect(edge.says).toMatch(/^The Teams bot is switched off: MICROSOFT_APP_ID, MICROSOFT_APP_PASSWORD, MICROSOFT_APP_TENANT_ID are not set/)
      // Set up is not proven: a person must answer the twin from Teams, or the bot deliver a digest.
      expect(teamsBotEdge({ missingKeys: [], bound: 3, answeredInTeams: 0, digestsDelivered: 0 }).state).toBe('SET')
      expect(teamsBotEdge({ missingKeys: [], bound: 3, answeredInTeams: 1, digestsDelivered: 0 }).state).toBe('PROVEN')
    })
  })

  it('a Teams identity nobody at Etyme holds is refused in a sentence', () => {
    const nobody = chooseSeat({ userPrincipalName: 'stranger@northbend.example' }, null, [])
    expect(nobody).toEqual({ ok: false, code: 'NOBODY', says: NOBODY_HAS_THIS_EMAIL })
    expect(NOBODY_HAS_THIS_EMAIL).toBe('Nobody at Etyme has this email. Ask your company’s owner for a seat.')

    const person = { id: 'person_dana', name: 'Dana Whitfield', primaryEmail: 'dana@northbend.example' }
    const seat = (s: Partial<Seat>): Seat => ({
      contextId: 'ctx', type: 'EMPLOYEE', companyId: 'co_northbend', companyName: 'Northbend Athletic', companyKind: 'CLIENT',
      companyDomain: 'northbend.example', roleName: 'AP Clerk', permissions: ['payments.record'], ...s,
    })

    // A consultant is reached by email, never in Teams.
    const consultant = chooseSeat({ userPrincipalName: person.primaryEmail }, person, [seat({ type: 'CONSULTANT' })])
    expect(consultant).toMatchObject({ ok: false, code: 'CONSULTANT' })
    // A seat that has ended binds nothing.
    expect(chooseSeat({ userPrincipalName: person.primaryEmail }, person, [])).toMatchObject({ ok: false, code: 'NO_SEAT' })
    // An account Teams gives no sign-in address for is refused, and a mail
    // address on another domain than the sign-in name is never used to match.
    expect(chooseSeat({ userPrincipalName: 'not-an-address', email: undefined }, null, [])).toMatchObject({ ok: false, code: 'NO_ADDRESS' })
    expect(addressesOf({ userPrincipalName: 'dana@northbend.example', email: 'ceo@maren.example' })).toEqual(['dana@northbend.example'])

    // Two seats: the company on the account's domain wins, with that seat's permissions and nothing more.
    const bound = chooseSeat({ userPrincipalName: person.primaryEmail }, person, [
      seat({ contextId: 'ctx_msp', companyId: 'co_maren', companyName: 'Maren MSP', companyDomain: 'maren.example', permissions: ['*'] }),
      seat({ contextId: 'ctx_dana' }),
    ])
    expect(bound).toMatchObject({ ok: true, bound: { contextId: 'ctx_dana', companyId: 'co_northbend', permissions: ['payments.record'] } })
  })

  it('a post not signed by the Bot Framework for this bot is refused, and nothing in it is read', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string }
    const keys: SigningKey[] = [{ kid: 'k1', kty: 'RSA', n: jwk.n, e: jwk.e, endorsements: ['msteams'] }]
    const now = new Date('2026-10-12T12:00:00Z')
    const t = Math.floor(now.getTime() / 1000)
    const token = (claims: Record<string, unknown>, key: KeyObject = privateKey, kid = 'k1') => {
      const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url')
      const c = Buffer.from(JSON.stringify(claims)).toString('base64url')
      return `Bearer ${h}.${c}.${sign('RSA-SHA256', Buffer.from(`${h}.${c}`), key).toString('base64url')}`
    }
    const good = { iss: BOT_FRAMEWORK_ISSUER, aud: 'app-id-ours', exp: t + 3600, nbf: t - 60, serviceurl: 'https://smba.trafficmanager.net/amer/' }
    const expect_ = { appId: 'app-id-ours', serviceUrl: 'https://smba.trafficmanager.net/amer/', channelId: 'msteams', now }

    expect(checkToken(token(good), keys, expect_).ok).toBe(true)
    expect(checkToken(null, keys, expect_).ok).toBe(false)
    expect(checkToken(token({ ...good, aud: 'somebody-elses-bot' }), keys, expect_).ok).toBe(false)
    expect(checkToken(token({ ...good, iss: 'https://evil.example' }), keys, expect_).ok).toBe(false)
    expect(checkToken(token(good), keys, { ...expect_, serviceUrl: 'https://evil.example/' }).ok).toBe(false)
    expect(checkToken(token(good), keys, { ...expect_, channelId: 'slack' }).ok).toBe(false)
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    expect(checkToken(token(good, other), keys, expect_).ok).toBe(false)
    const late = checkToken(token({ ...good, exp: t - 3600 }), keys, expect_)
    expect(late).toEqual({ ok: false, says: 'This request from Teams carried an expired token, so nothing in it was read.' })
  })

  it('a time-limit card names the contractor, the days left and the supplier, and offers Acknowledge and Escalate', async () => {
    const card = tenureAlertCard(risk) as Card
    expect(card.body[0].text).toBe('Tobias Lindqvist is 60 days from the time limit')
    const facts = Object.fromEntries(card.body[1].facts.map((f: any) => [f.title, f.value]))
    expect(facts).toMatchObject({ Contractor: 'Tobias Lindqvist', 'Days left': '60', Supplier: 'Pinnacle Staffing and Veritan Talent' })
    expect(card.actions!.map((a) => a.title)).toEqual(['Acknowledge', 'Escalate'])
    // With no question from the twin to answer, Escalate opens the person in Etyme rather than doing anything.
    expect(card.actions![1]).toMatchObject({ type: 'Action.OpenUrl', url: risk.link })
    // Where the reader may answer the twin's question, Escalate is that answer, through the same door.
    const asked = tenureAlertCard({ ...risk, escalateApprovalId: 'appr_000009' }) as Card
    expect(readCardAction(asked.actions![1].data)).toEqual({ etyme: 'twin.approval', approvalId: 'appr_000009', decision: 'APPROVED' })
    // Acknowledge changes nothing on the record, and says so.
    const ack = await answerCardAction(readCardAction(card.actions![0].data)!, dana, { decide: vi.fn(), why: vi.fn() })
    expect(ack.says).toBe('Noted. Nothing on the record changed. You will hear about Tobias Lindqvist again only at the next warning.')
  })

  it('the digest says each thing when it appears and once more just before it is due, and is never sent empty', () => {
    expect(digestHeading(3, 1)).toBe('3 invoice receipts need approval · 1 time-limit risk')
    expect(digestHeading(1, 0)).toBe('1 invoice receipt needs approval')
    expect(digestHeading(0, 0)).toBeNull()
    expect(digestCard([], [])).toBeNull()

    const card = digestCard([receipt], [risk]) as Card
    expect(card.body[0].text).toBe('1 invoice receipt needs approval · 1 time-limit risk')
    const sets = card.body.flatMap((b: any) => (b.items ?? []).filter((i: any) => i.type === 'ActionSet'))
    expect(sets.map((s: any) => s.actions.map((a: any) => a.title))).toEqual([['Approve', 'Reject', 'Why?'], ['Acknowledge', 'Escalate']])

    const item = { keys: { key: 'invoice:a', lastCall: 'invoice:a:due' } }
    let due = false
    const said = new Set<string>()
    const night = () => { const out = toSay([item], said, () => due); out.forEach((o) => o.keys.forEach((k) => said.add(k))); return out.length }
    expect(night()).toBe(1) // it appears
    expect(night()).toBe(0) // the next night, nothing
    expect(night()).toBe(0)
    due = true
    expect(night()).toBe(1) // two days from due, once more
    expect(night()).toBe(0) // and never again
  })
})
