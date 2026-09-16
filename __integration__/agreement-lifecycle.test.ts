import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as listAgreements } from '@/app/api/program/agreements/route'
import { PATCH as amend } from '@/app/api/program/agreements/[id]/route'
import { POST as sign } from '@/app/api/program/agreements/[id]/sign/route'
import { POST as end } from '@/app/api/program/agreements/[id]/end/route'
import { GET as history } from '@/app/api/program/agreements/[id]/history/route'
import { GET as termWatch } from '@/app/api/cron/agreement-terms/route'

/**
 * A master agreement, from the day it is recorded to the day somebody
 * tears it up.
 *
 * It used to carry one date somebody typed. It could not run out, could
 * not be ended, had no signer behind the signature, and its terms were
 * overwritten in place — so "what were the payment days on 3 March" had
 * no answer, which is the only question that matters in a dispute.
 */

const D = '@demo.etyme.local'
const PINNACLE = `world-pinnacle${D}`
const NIKE_AP = `world-nike-ap${D}`
const RECRUITER = 'desk.without.rates@seed.etyme.invalid'

const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}
const day = (n: number) => new Date(Date.now() + n * 86_400_000)

describe('a master agreement gets a term, a signature and a trail', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    for (const slug of ['world-nike', 'world-pinnacle']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
    }

    const msa = await prisma.masterAgreement.findFirstOrThrow({
      where: { vendorId: co['world-pinnacle'], clientId: co['world-nike'] },
      select: { id: true, paymentTerms: true, createdAt: true },
    })
    it_.msa = msa.id
    it_.originalPaymentTerms = msa.paymentTerms

    // A seat at the same firm that does not hold the price desk. Built
    // here rather than found, so the test says out loud what it is
    // testing: a recruiter, not a contract manager.
    const role = await prisma.role.create({
      data: {
        companyId: co['world-pinnacle'],
        name: 'Recruiter (no rates) — test',
        permissions: ['consultants.read', 'requirements.read', 'submissions.create'],
      },
    })
    const person = await prisma.person.create({
      data: { name: 'Sam Okafor', primaryEmail: RECRUITER },
    })
    await prisma.context.create({
      data: {
        personId: person.id,
        companyId: co['world-pinnacle'],
        roleId: role.id,
        type: 'EMPLOYEE',
        side: 'SELL',
        grantReason: 'Recruiting desk',
      },
    })
  }, 240_000)

  // ── The permission ──────────────────────────────────────────────────

  it('a recruiter cannot change the payment days or the margin floor, and is told who can', async () => {
    as(RECRUITER)
    const r = await call(amend, 'PATCH', `/api/program/agreements/${it_.msa}`, it_.msa, {
      paymentTerms: 60,
    })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('contracting desk')
    expect(r.body.error.message).toContain('contract manager')
    const unchanged = await prisma.masterAgreement.findUniqueOrThrow({ where: { id: it_.msa } })
    expect(unchanged.paymentTerms).toBe(it_.originalPaymentTerms)
  })

  it('a client reading the supplier’s agreement is told whose terms they are, and cannot change them', async () => {
    as(NIKE_AP)
    const r = await call(amend, 'PATCH', `/api/program/agreements/${it_.msa}`, it_.msa, {
      paymentTerms: 60,
    })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('Pinnacle')
  })

  // ── The amendment trail ─────────────────────────────────────────────

  it('changing the payment days records what they were before, who changed them and why', async () => {
    as(PINNACLE)
    const r = await call(amend, 'PATCH', `/api/program/agreements/${it_.msa}`, it_.msa, {
      paymentTerms: it_.originalPaymentTerms + 15,
      reason: 'Agreed with Nike procurement at the Q3 review.',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.changed).toEqual(['payment days'])
    expect(r.body.data.amendment).toBe(2)

    const versions = await prisma.masterAgreementVersion.findMany({
      where: { agreementId: it_.msa },
      orderBy: { version: 'asc' },
    })
    // Version 1 is what it said before anybody touched it, backfilled and
    // honest about being reconstructed.
    expect(versions[0].version).toBe(1)
    expect(versions[0].action).toBe('RECORDED')
    expect(versions[0].paymentTerms).toBe(it_.originalPaymentTerms)
    expect(versions[0].reason).toContain('Reconstructed')
    expect(versions[1].paymentTerms).toBe(it_.originalPaymentTerms + 15)
    expect(versions[1].reason).toContain('Q3 review')
    expect(versions[1].changedById).not.toBeNull()
  })

  it('an amendment writes an automation log naming what moved and why', async () => {
    const log = await prisma.automationLog.findFirst({
      where: { companyId: co['world-pinnacle'], action: 'AGREEMENT_AMENDED' },
      orderBy: { at: 'desc' },
    })
    expect(log?.summary).toContain('payment days')
    expect(log?.reason).toContain('Q3 review')
    expect(log?.reversible).toBe(true)
  })

  it('re-saving the same payment days is refused rather than written to the trail as an amendment', async () => {
    as(PINNACLE)
    const r = await call(amend, 'PATCH', `/api/program/agreements/${it_.msa}`, it_.msa, {
      paymentTerms: it_.originalPaymentTerms + 15,
    })
    expect(r.status).toBe(400)
    expect(r.body.error.message).toContain('already the terms on file')
    expect(await prisma.masterAgreementVersion.count({ where: { agreementId: it_.msa } })).toBe(2)
  })

  it('a signature can no longer be typed in as a bare date — the refusal says to record who signed', async () => {
    as(PINNACLE)
    const r = await call(amend, 'PATCH', `/api/program/agreements/${it_.msa}`, it_.msa, {
      signedAt: new Date().toISOString(),
    })
    expect(r.status).toBe(400)
    expect(r.body.error.message).toContain('who signed, on which side, with what title')
  })

  // ── The term ────────────────────────────────────────────────────────

  it('recording the term says in a sentence when the agreement runs out and how many days that is', async () => {
    as(PINNACLE)
    const r = await call(amend, 'PATCH', `/api/program/agreements/${it_.msa}`, it_.msa, {
      effectiveDate: day(-700).toISOString(),
      expiresAt: day(25).toISOString(),
      renewalKind: 'FIXED',
      noticeDays: 30,
      reason: 'Taken from the executed copy.',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.changed).toContain('the day it runs out')
    expect(r.body.data.daysToExpiry).toBe(25)
    expect(r.body.data.termSays).toContain('25 days')
    expect(r.body.data.termSays).toContain('30 days notice')
  })

  it('recording the executed document keeps the file and its name on the agreement, not in somebody’s email', async () => {
    as(PINNACLE)
    const r = await call(amend, 'PATCH', `/api/program/agreements/${it_.msa}`, it_.msa, {
      executedFileName: 'Nike-Pinnacle-MSA-executed.pdf',
      executedFileUrl: 'https://files.etyme.test/nike-pinnacle-msa.pdf',
      executedFileHash: 'a'.repeat(64),
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.executedDocument.fileName).toBe('Nike-Pinnacle-MSA-executed.pdf')
    const v = await prisma.masterAgreementVersion.findFirstOrThrow({
      where: { agreementId: it_.msa },
      orderBy: { version: 'desc' },
    })
    expect(v.action).toBe('DOCUMENT_ATTACHED')
  })

  it('a link that is not a link is refused, and the refusal says what a link looks like', async () => {
    as(PINNACLE)
    const r = await call(amend, 'PATCH', `/api/program/agreements/${it_.msa}`, it_.msa, {
      executedFileName: 'scan.pdf',
      executedFileUrl: 'the shared drive',
    })
    expect(r.status).toBe(400)
    expect(r.body.error.message).toContain('https://')
  })

  // ── Signing ─────────────────────────────────────────────────────────

  it('one signature does not execute an agreement — it says which side still owes a counter-signature', async () => {
    as(PINNACLE)
    const r = await call(sign, 'POST', `/api/program/agreements/${it_.msa}/sign`, it_.msa, {
      party: 'VENDOR',
      signerName: 'Dana Roth',
      signerTitle: 'VP, Delivery',
      signedAt: day(-40).toISOString(),
      method: 'WET_INK',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.fullyExecutedAt).toBeNull()
    expect(r.body.data.signingSays).toContain('waiting on the client')
    const row = await prisma.masterAgreement.findUniqueOrThrow({ where: { id: it_.msa } })
    expect(row.signedAt).toBeNull()
  })

  it('the same side cannot sign twice, and the refusal says to amend rather than sign again', async () => {
    as(PINNACLE)
    const r = await call(sign, 'POST', `/api/program/agreements/${it_.msa}/sign`, it_.msa, {
      party: 'VENDOR',
      signerName: 'Somebody Else',
      signerTitle: 'CFO',
      signedAt: day(-1).toISOString(),
    })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('already signed')
  })

  it('a signature with no title is refused, because whether the signer had authority is the first thing anybody asks', async () => {
    as(PINNACLE)
    const r = await call(sign, 'POST', `/api/program/agreements/${it_.msa}/sign`, it_.msa, {
      party: 'CLIENT',
      signerName: 'Marcus Webb',
      signerTitle: '',
      signedAt: day(-30).toISOString(),
    })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('authority')
  })

  it('the counter-signature executes the agreement, dated the later of the two, and says nothing here verified it', async () => {
    as(PINNACLE)
    const r = await call(sign, 'POST', `/api/program/agreements/${it_.msa}/sign`, it_.msa, {
      party: 'CLIENT',
      signerName: 'Marcus Webb',
      signerTitle: 'Director, Indirect Procurement',
      signedAt: day(-30).toISOString(),
      method: 'COUNTERPART',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.fullyExecutedAt).not.toBeNull()
    expect(r.body.data.signingSays).toBe('Signed by both sides.')
    expect(r.body.data.says).toContain('nothing here verified it')

    const row = await prisma.masterAgreement.findUniqueOrThrow({ where: { id: it_.msa } })
    // The later of the two — supplier at day -40, client at day -30.
    expect(Math.round((Date.now() - row.signedAt!.getTime()) / 86_400_000)).toBe(30)

    const log = await prisma.automationLog.findFirst({
      where: { companyId: co['world-pinnacle'], action: 'AGREEMENT_SIGNED' },
      orderBy: { at: 'desc' },
    })
    expect(log?.summary).toContain('Marcus Webb')
    expect(log?.summary).toContain('Director, Indirect Procurement')
  })

  // ── What were the terms on a day ────────────────────────────────────

  it('the history answers what the payment days were before they were changed, and what they are now', async () => {
    as(PINNACLE)
    const before = await prisma.masterAgreementVersion.findFirstOrThrow({
      where: { agreementId: it_.msa, version: 1 },
      select: { changedAt: true },
    })
    const r = await call(
      history,
      'GET',
      `/api/program/agreements/${it_.msa}/history?on=${before.changedAt.toISOString()}`,
      it_.msa
    )
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.asOf.found).toBe(true)
    expect(r.body.data.asOf.terms.paymentTermsDays).toBe(it_.originalPaymentTerms)

    const now = await call(
      history,
      'GET',
      `/api/program/agreements/${it_.msa}/history?on=${new Date().toISOString()}`,
      it_.msa
    )
    expect(now.body.data.asOf.terms.paymentTermsDays).toBe(it_.originalPaymentTerms + 15)
    expect(now.body.data.amendments[0].version).toBeGreaterThan(1)
    expect(now.body.data.signatures).toHaveLength(2)
  })

  it('asking what the terms were before the agreement existed returns nothing rather than today’s terms', async () => {
    as(PINNACLE)
    const r = await call(
      history,
      'GET',
      `/api/program/agreements/${it_.msa}/history?on=2001-01-01`,
      it_.msa
    )
    expect(r.body.data.asOf.found).toBe(false)
    expect(r.body.data.asOf.terms).toBeNull()
    expect(r.body.data.asOf.says).toContain('no record before')
  })

  it('a client reading the history sees the payment days and never the supplier’s margin floor', async () => {
    await prisma.masterAgreement.update({ where: { id: it_.msa }, data: { minMarginPct: 22 } })
    as(NIKE_AP)
    const r = await call(history, 'GET', `/api/program/agreements/${it_.msa}/history`, it_.msa)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.role).toBe('CLIENT')
    for (const a of r.body.data.amendments) expect(a.terms.minMarginPct).toBeNull()

    as(PINNACLE)
    const mine = await call(history, 'GET', `/api/program/agreements/${it_.msa}/history`, it_.msa)
    expect(mine.body.data.role).toBe('VENDOR')
  })

  // ── The nightly watch ───────────────────────────────────────────────

  it('the nightly job marks an agreement running out and tells the contracting desk at thirty days', async () => {
    process.env.CRON_SECRET = 'agreement-test'
    const r = await json(
      await termWatch(
        req('GET', '/api/cron/agreement-terms', undefined, { authorization: 'Bearer agreement-test' })
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const row = await prisma.masterAgreement.findUniqueOrThrow({ where: { id: it_.msa } })
    expect(row.status).toBe('EXPIRING')

    const note = await prisma.notification.findFirst({
      where: { entityId: it_.msa, type: 'CONTRACT' },
      orderBy: { createdAt: 'desc' },
    })
    expect(note?.title).toContain('runs out in')
    expect(note?.body).toContain('Start the renewal')
    expect((note?.data as any)?.milestone).toBe(30)

    const log = await prisma.automationLog.findFirst({
      where: { companyId: co['world-pinnacle'], action: 'AGREEMENT_TERM_WATCH' },
      orderBy: { at: 'desc' },
    })
    expect(log?.reason).toContain('Nightly scan')
  })

  it('running the nightly job again does not say the same thing twice', async () => {
    const before = await prisma.notification.count({ where: { entityId: it_.msa, type: 'CONTRACT' } })
    await termWatch(
      req('GET', '/api/cron/agreement-terms', undefined, { authorization: 'Bearer agreement-test' })
    )
    const after = await prisma.notification.count({ where: { entityId: it_.msa, type: 'CONTRACT' } })
    expect(after).toBe(before)
  })

  it('an agreement that renews itself rolls its end date on instead of lapsing, and the trail says it did', async () => {
    const rolling = await prisma.masterAgreement.create({
      data: {
        vendorId: co['world-pinnacle'],
        clientId: co['world-nike'],
        paymentTerms: 30,
        expiresAt: day(-2),
        renewalKind: 'AUTO_RENEW',
        renewalMonths: 12,
        status: 'ACTIVE',
        versions: {
          create: {
            version: 1,
            paymentTerms: 30,
            paymentTermsFrom: 'PERIOD_END',
            currency: 'USD',
            renewalKind: 'AUTO_RENEW',
            renewalMonths: 12,
            status: 'ACTIVE',
            expiresAt: day(-2),
            action: 'RECORDED',
            changed: [],
          },
        },
      },
    })

    await termWatch(
      req('GET', '/api/cron/agreement-terms', undefined, { authorization: 'Bearer agreement-test' })
    )

    const after = await prisma.masterAgreementVersion.findFirstOrThrow({
      where: { agreementId: rolling.id },
      orderBy: { version: 'desc' },
    })
    expect(after.action).toBe('RENEWED')
    const row = await prisma.masterAgreement.findUniqueOrThrow({ where: { id: rolling.id } })
    expect(row.status).not.toBe('EXPIRED')
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now())
  })

  // ── Ending one ──────────────────────────────────────────────────────

  it('ending an agreement without saying why is refused', async () => {
    as(PINNACLE)
    const r = await call(end, 'POST', `/api/program/agreements/${it_.msa}/end`, it_.msa, {})
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('Say why')
  })

  it('a recruiter cannot end an agreement either', async () => {
    as(RECRUITER)
    const r = await call(end, 'POST', `/api/program/agreements/${it_.msa}/end`, it_.msa, {
      reason: 'No longer needed',
    })
    expect(r.status).toBe(403)
  })

  it('ending an agreement with people still working under it says how many, and lets their contracts run on', async () => {
    as(PINNACLE)
    const r = await call(end, 'POST', `/api/program/agreements/${it_.msa}/end`, it_.msa, {
      reason: 'Replaced by the 2027 master agreement signed last week.',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.status).toBe('TERMINATED')
    expect(r.body.data.stillWorking).toBeGreaterThan(0)
    expect(r.body.data.says).toContain('their contracts run on')

    const log = await prisma.automationLog.findFirst({
      where: { companyId: co['world-pinnacle'], action: 'AGREEMENT_ENDED' },
      orderBy: { at: 'desc' },
    })
    expect(log?.reason).toContain('2027 master agreement')
    expect(log?.reversible).toBe(false)
  })

  it('the terms of an agreement that was ended can no longer be changed', async () => {
    as(PINNACLE)
    const r = await call(amend, 'PATCH', `/api/program/agreements/${it_.msa}`, it_.msa, {
      paymentTerms: 90,
    })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('Record a new agreement')
  })

  it('an agreement that was ended cannot be ended twice, and the calendar never revives it', async () => {
    as(PINNACLE)
    const again = await call(end, 'POST', `/api/program/agreements/${it_.msa}/end`, it_.msa, {
      reason: 'Trying again',
    })
    expect(again.status).toBe(409)

    await termWatch(
      req('GET', '/api/cron/agreement-terms', undefined, { authorization: 'Bearer agreement-test' })
    )
    const row = await prisma.masterAgreement.findUniqueOrThrow({ where: { id: it_.msa } })
    expect(row.status).toBe('TERMINATED')
  })

  it('the agreements screen shows an ended agreement as ended, with people still working under it as the worst thing on the row', async () => {
    as(PINNACLE)
    const r = await json(await listAgreements(req('GET', '/api/program/agreements')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = r.body.data.agreements.find((a: any) => a.id === it_.msa)
    expect(row.status).toBe('TERMINATED')
    expect(row.findings[0].code).toBe('MSA_ENDED')
    expect(row.signing.signatures).toHaveLength(2)
    expect(row.executedDocument.fileName).toBe('Nike-Pinnacle-MSA-executed.pdf')
    expect(r.body.data.summary.ended).toBeGreaterThan(0)
  })

  it('reading the agreements screen leaves an access log for the people it names', async () => {
    // The trail is written without holding the response up, so give it a moment.
    let log = null
    for (let i = 0; i < 20 && !log; i++) {
      log = await prisma.accessLog.findFirst({
        where: { actorCompanyId: co['world-pinnacle'], action: 'CONTRACT_VIEW' },
        orderBy: { at: 'desc' },
      })
      if (!log) await new Promise((r) => setTimeout(r, 100))
    }
    expect(log?.reason).toContain('agreements screen')
  })

  it('an award with no agreement in place records one marked as never papered, rather than refusing the placement', async () => {
    // The award path fabricates a master agreement so the money chain can
    // start. It is now written DRAFT, so a placeholder never reads as an
    // agreement somebody negotiated.
    const drafted = await prisma.masterAgreement.create({
      data: { vendorId: co['world-pinnacle'], clientId: co['world-nike'], status: 'DRAFT', signedAt: null },
    })
    const row = await prisma.masterAgreement.findUniqueOrThrow({ where: { id: drafted.id } })
    expect(row.status).toBe('DRAFT')
    expect(row.signedAt).toBeNull()

    as(PINNACLE)
    const r = await json(await listAgreements(req('GET', '/api/program/agreements')))
    const shown = r.body.data.agreements.find((a: any) => a.id === drafted.id)
    expect(shown.statusSays).toContain('Nobody has papered it')
    expect(shown.findings.map((f: any) => f.code)).toContain('MSA_NO_TERM')
  })
})
