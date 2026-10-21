/**
 * Stage: paperwork-and-start. Owned by regulatory.
 *
 * Every awarded placement that has not started is walked to its first
 * day, the way the trade does it, through the real routes as the right
 * seats:
 *
 *   1. The client's compliance officer reads the line's required set
 *      (`GET /api/documents/requirements`, the one door through
 *      lib/document-requirements), and the supplier's HR asks for the
 *      papers (`POST /api/compliance/clearance`), which reads the same
 *      set and says what blocks.
 *   2. The worker opens her own paperwork page and sends what is hers
 *      to send — the I-9 and anything else the line asks of her — from
 *      her own seat (`/api/me/papers`, then `/api/documents/:id/upload`).
 *      For a background check she gives her signed authorization
 *      (`/api/documents/:id/sign`), never the report.
 *   3. HR examines what she showed and records the I-9 with its edition
 *      and the document behind it; the compliance officer records the
 *      screening company's verdict verbatim, with its name, reference
 *      and date (`POST /api/compliance/verifications`).
 *   4. Whoever starts placements at the supplier activates it
 *      (`POST /api/contracts/:id/activate`).
 *
 * The rules, proved as refusals the stage expects:
 *   - nobody starts without an I-9 (BLOCK, in a sentence)
 *   - a lapsed certificate blocks (a supplier's good standing)
 *   - a missing background check warns, takes a reason and proceeds
 *   - work authorization cannot be waived
 *   - a stranger to the contract cannot activate it
 *   - the AP clerk cannot start anybody
 *   - a worker cannot send a background check report
 *
 * A share of placements hit each refusal and then learn: the I-9 is
 * filed, the renewed certificate sent, the reason written. Activated
 * contracts go into `ctx.world.contracts` for the money stations.
 *
 * Placements come from `ctx.world` (contracts and awards made by the
 * stations before this one) and, always, from the seeded world's
 * contracts that were awarded and never started.
 */
import type { Actor, Res } from '../../actors'
import { defineStage, type Ctx } from '../../stage'
import { kb, papers, pdf, photo, sendFile } from './paper-files'
import { standingLeftForTheStart } from './documents'

const DAY = 86_400_000
/** The I-9 edition USCIS published on January 20, 2025, printed at the foot of every page. */
const I9_EDITION = '01/20/25'
const NOT_STARTED = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] as const

interface Placement {
  id: string
  personId: string
  personName: string
  personEmail: string
  supplier: { id: string; slug: string; name: string }
  client: { id: string; slug: string; name: string }
  role: string | null
  startDate: Date
  endDate: Date | null
  /** Where the placement came from: an earlier station, or the seed. */
  from: 'world' | 'seed'
}

/** What happened to one placement, for the closing sentence. */
interface Walk {
  id: string
  started: boolean
  /** The rules this placement ran into, and learned from. */
  hit: string[]
  /** Started past a warning, with the reason written down. */
  warnedThrough: boolean
  stoppedBecause?: string
}

/** The scenarios a placement can be dealt, by its position in the run. */
type Scenario = 'EAGER' | 'BACKGROUND_NOT_BACK' | 'BY_THE_BOOK'

function scenarioFor(i: number): Scenario {
  // About a third of placements are started before the I-9 is in and
  // learn; about a third start with the background check still out, past
  // the warning with a reason; the rest are papered first and start clean.
  return (['EAGER', 'BACKGROUND_NOT_BACK', 'BY_THE_BOOK'] as const)[i % 3]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + n * DAY)

/** A stable small number from an id, so a person's passport date is the same on every run. */
function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export default defineStage({
  name: 'paperwork-and-start',
  domain: 'REGULATORY',
  async run(ctx) {
    const placements = await findPlacements(ctx)
    if (placements.length === 0) {
      return { closed: 0, of: 0, says: 'No awarded placement in this world is waiting to start.' }
    }
    ctx.log(
      `${placements.length} placements waiting to start: ` +
        `${placements.filter((p) => p.from === 'world').length} from earlier stations, ` +
        `${placements.filter((p) => p.from === 'seed').length} from the seed`
    )

    const walks: Walk[] = []
    const consentTemplate = new Map<string, Promise<string | null>>()

    // ── The rules, each proved once, in order, before the crowd ──────
    //
    // Serial, because two of them touch the supplier's own standing and a
    // lapsed certificate on file for one placement is a refusal for every
    // other placement at that supplier until the renewal lands.
    // On somebody who holds a seat of her own, so her half of each rule is
    // hers to be refused rather than the door's.
    const seated = (p: Placement) => ctx.cast.seats.some((x) => x.email === p.personEmail)
    const first = placements.find(seated) ?? placements[0]
    await proveTheRulesOnce(ctx, first)

    // A lapsed certificate blocks: on another supplier, before any of its
    // placements start.
    // On a supplier whose current certificate is not already on file: the
    // documents station may have received one at the first submission, and
    // a current certificate rightly answers last year's (learned from the
    // run of 2026-10-21, where it did and the rule read as not holding).
    const current = new Set(
      (
        await ctx.read.verification.findMany({
          where: { type: 'GOOD_STANDING', status: 'CLEAR', expiresAt: { gt: new Date() }, companyId: { in: [...new Set(placements.map((p) => p.supplier.id))] } },
          select: { companyId: true },
        })
      ).map((v) => v.companyId)
    )
    const lapsedAt =
      placements.find((p) => standingLeftForTheStart.has(p.supplier.id) && !current.has(p.supplier.id) && p.id !== first.id) ??
      placements.find((p) => seated(p) && p.supplier.id !== first.supplier.id && !current.has(p.supplier.id)) ??
      placements.find((p) => p.id !== first.id && !current.has(p.supplier.id)) ??
      null
    if (!lapsedAt) ctx.log('every supplier here already has a current certificate of good standing on file, so the lapsed one is not proved this run')
    const standing = lapsedAt ? await lapsedStanding(ctx, lapsedAt) : false

    // ── Every placement, at most the run's width at once ────────────
    const results = await ctx.parallel(placements, async (p, i) => {
      const walk = await walkOne(ctx, p, scenarioFor(i), consentTemplate, i)
      if (p.id === lapsedAt?.id && standing) walk.hit.unshift('a lapsed certificate of good standing')
      return walk
    })
    for (const r of results) {
      if (r.ok) walks.push(r.value)
      else ctx.log(`a placement stopped the walk: ${r.error}`)
    }

    const started = walks.filter((w) => w.started)
    const learned = walks.filter((w) => w.hit.length > 0 && w.started)
    const warned = walks.filter((w) => w.warnedThrough)
    const stuck = walks.filter((w) => !w.started)
    const stuckWhy = [...new Set(stuck.map((w) => w.stoppedBecause ?? 'it did not start'))]

    return {
      closed: started.length,
      of: placements.length,
      says:
        `${started.length} of ${placements.length} placements started. ` +
        `${learned.length} were refused first and learned (filed the I-9, sent a current certificate), ` +
        `${warned.length} started past a warning with the reason on the record.` +
        (stuck.length ? ` ${stuck.length} did not start: ${stuckWhy.slice(0, 3).join('; ')}.` : '') +
        ` Papers this run, both stations: ${papers.total.toLocaleString('en-US')} document moves, ${papers.files.toLocaleString('en-US')} files, ` +
        `${kb(papers.bytes)} stored, ${papers.sentBack} sent back and answered again. By kind: ${papers.says()}.`,
    }
  },
})

// ── Finding the placements ──────────────────────────────────────────────

async function findPlacements(ctx: Ctx): Promise<Placement[]> {
  const ids = new Set<string>()
  for (const c of ctx.world.contracts) if (c.side === 'SELL') ids.add(c.id)

  // An award names the sell line it wrote, where the award station said so;
  // otherwise its submission, and the line is the sell line for that
  // person on that job.
  for (const a of ctx.world.awards) {
    const line = a.extra?.sellContractId
    if (typeof line === 'string' && line) ids.add(line)
  }
  const awarded = ctx.world.awards.filter((a) => !a.extra?.sellContractId).map((a) => a.submissionId)
  if (awarded.length) {
    const subs = await ctx.read.submission.findMany({
      where: { id: { in: awarded } },
      select: { requirementId: true, personId: true },
    })
    if (subs.length) {
      const lines = await ctx.read.sellContract.findMany({
        where: { OR: subs.map((s) => ({ requirementId: s.requirementId, personId: s.personId })) },
        select: { id: true },
      })
      for (const l of lines) ids.add(l.id)
    }
  }

  const select = {
    id: true, personId: true, startDate: true, endDate: true, createdAt: true,
    person: { select: { name: true, primaryEmail: true } },
    company: { select: { id: true, slug: true, name: true } },
    clientCompany: { select: { id: true, slug: true, name: true } },
    requirement: { select: { title: true } },
  } as const
  const rows = await ctx.read.sellContract.findMany({
    where: {
      state: { in: [...NOT_STARTED] },
      OR: [{ id: { in: [...ids] } }, { company: { slug: { startsWith: 'world-' } } }],
    },
    select,
    orderBy: { createdAt: 'asc' },
  })

  const out: Placement[] = rows
    .filter((r) => r.person.primaryEmail)
    .map((r) => ({
      id: r.id,
      personId: r.personId,
      personName: r.person.name,
      personEmail: r.person.primaryEmail!,
      supplier: r.company,
      client: r.clientCompany,
      role: r.requirement?.title ?? null,
      startDate: r.startDate,
      endDate: r.endDate,
      from: ids.has(r.id) ? ('world' as const) : ('seed' as const),
    }))
  // What the run made first, then the seed's.
  out.sort((a, b) => (a.from === b.from ? 0 : a.from === 'world' ? -1 : 1))
  return out.slice(0, Math.max(ctx.options.placements, 1))
}

// ── Who sits where ──────────────────────────────────────────────────────

/** The first seat at a firm that holds one of these roles, or null. */
function firstSeat(ctx: Ctx, slug: string, keys: string[]): Actor | null {
  for (const k of keys) {
    const a = ctx.cast.at(slug, k as never)
    if (a) return a
  }
  return null
}

/** HR, then whoever keeps the firm's people, then the owner: the seat that examines papers. */
const paperworkSeat = (ctx: Ctx, slug: string) => firstSeat(ctx, slug, ['hr', 'compliance', 'recruiter', 'resourcing', 'owner'])
/** The compliance officer, then HR, then the owner: the seat that records a screening company's verdict. */
const verdictSeat = (ctx: Ctx, slug: string) => firstSeat(ctx, slug, ['compliance', 'hr', 'recruiter', 'owner'])
/** Whoever starts placements: the contract manager, the resource manager, the owner. */
const startSeat = (ctx: Ctx, slug: string) => firstSeat(ctx, slug, ['contracts', 'resourcing', 'owner'])
/** At the client: the compliance officer, then the program manager, then the owner. */
const clientComplianceSeat = (ctx: Ctx, slug: string) => firstSeat(ctx, slug, ['compliance', 'programme', 'owner'])

function workerOf(ctx: Ctx, p: Placement): Actor | null {
  try {
    return ctx.cast.worker(p.personEmail)
  } catch (e: any) {
    ctx.log(`${p.personName} has no seat this run can take: ${String(e?.message ?? e)}`)
    return null
  }
}

// ── The rules, once each ────────────────────────────────────────────────

async function proveTheRulesOnce(ctx: Ctx, p: Placement): Promise<void> {
  await agreeHerTerms(ctx, p)
  const clientSeat = clientComplianceSeat(ctx, p.client.slug)
  if (clientSeat) {
    // The line's set, read where the activation reads it.
    await clientSeat.get(`/api/documents/requirements?sellContractId=${p.id}`)
    // Work authorization cannot be waived, however urgent the start.
    await ctx.expectRefusal(
      clientSeat,
      (a) =>
        a.post('/api/documents/requirements', {
          sellContractId: p.id,
          documentTypeKey: 'I9_EVERIFY',
          waivedReason: 'The start is on Monday and the client asked us to go ahead.',
        }),
      'cannot be waived'
    )
    // The client does not complete the employer's I-9.
    await ctx.expectRefusal(
      clientSeat,
      (a) =>
        a.post('/api/compliance/verifications', {
          contractId: p.id, about: 'PERSON', type: 'I9_EVERIFY', formEdition: I9_EDITION,
          evidence: [{ type: 'PASSPORT', expiresAt: iso(plusDays(1800)) }],
        }),
      'the firm that employs or places them'
    )
  }

  // The AP clerk cannot start anybody: paying for the work is not running it.
  const clerk = firstSeat(ctx, p.supplier.slug, ['ap', 'payroll', 'ar', 'finance']) ?? firstSeat(ctx, p.client.slug, ['ap'])
  if (clerk) {
    await ctx.expectRefusal(clerk, (a) => a.post(`/api/contracts/${p.id}/activate`, { action: 'activate' }), /is done by|is not part of your role/)
    // Nor record a check on anybody's papers.
    await ctx.expectRefusal(
      clerk,
      (a) =>
        a.post('/api/compliance/verifications', {
          contractId: p.id, about: 'PERSON', type: 'BACKGROUND_CHECK', provider: 'Sterling', reference: 'X',
          renderedOn: iso(plusDays(-1)), outcome: 'CLEAR', providerSays: 'No records found.',
        }),
      clerk.company?.slug === p.supplier.slug ? 'compliance officer' : 'firm that employs or places them'
    )
  }

  // A stranger to the contract cannot start it.
  const stranger = ctx.cast.where(
    (s) => s.company?.kind === 'VENDOR' && s.key.endsWith('/owner') && s.company.slug !== p.supplier.slug && s.company.slug !== p.client.slug
  )[0]
  if (stranger) {
    await ctx.expectRefusal(stranger, (a) => a.post(`/api/contracts/${p.id}/activate`, { action: 'activate' }), 'is not a party to this contract')
  }

  // The worker cannot send a background check report: it is not hers to have.
  const worker = workerOf(ctx, p)
  if (worker) {
    await ctx.expectRefusal(worker, (a) => a.post('/api/me/papers', { documentTypeKey: 'BACKGROUND_CHECK' }), 'is not a document you hold')
  }
}

/**
 * A lapsed certificate blocks.
 *
 * The client asks the supplier for its certificate of good standing; the
 * supplier sends the one it has on file — last year's, run out five
 * weeks ago — and the client's compliance officer records exactly what
 * arrived. The start is refused on it. The client asks again, the
 * supplier sends the renewal, the client records that, and the start may
 * go ahead.
 */
async function lapsedStanding(ctx: Ctx, p: Placement): Promise<boolean> {
  const supplierOwner = ctx.cast.at(p.supplier.slug, 'owner')
  const clientSeat = clientComplianceSeat(ctx, p.client.slug)
  const starter = startSeat(ctx, p.supplier.slug)
  if (!supplierOwner || !clientSeat || !starter) return false
  await agreeHerTerms(ctx, p)

  const issuer = 'Secretary of State'
  const lapsedFrom = plusDays(-400)
  const lapsedTo = plusDays(-35)
  await askAndSend(ctx, clientSeat, supplierOwner, p, `good-standing-${iso(lapsedFrom)}.pdf`)
  const recorded = await clientSeat.post('/api/compliance/verifications', {
    contractId: p.id, about: 'FIRM', type: 'GOOD_STANDING', issuer,
    reference: `GS-${hashOf(p.supplier.id) % 100000}`, validFrom: iso(lapsedFrom), expiresAt: iso(lapsedTo),
  })
  if (!recorded.ok) return false
  papers.count('Certificate of good standing', 'examined')

  await ctx.expectRefusal(starter, (a) => a.post(`/api/contracts/${p.id}/activate`, { action: 'activate' }), /good standing/i)

  // The supplier learns: it asks the state for a current one and sends it.
  const renewedFrom = plusDays(-3)
  const renewedTo = plusDays(362)
  await askAndSend(ctx, clientSeat, supplierOwner, p, `good-standing-${iso(renewedFrom)}.pdf`)
  const renewed = await clientSeat.post('/api/compliance/verifications', {
    contractId: p.id, about: 'FIRM', type: 'GOOD_STANDING', issuer,
    reference: `GS-${hashOf(p.supplier.id) % 100000}-R`, validFrom: iso(renewedFrom), expiresAt: iso(renewedTo),
  })
  if (renewed.ok) papers.count('Certificate of good standing', 'examined')
  return true
}

/** The client asks the supplier for its certificate; the supplier sends it as itself. */
async function askAndSend(
  ctx: Ctx,
  clientSeat: Actor,
  supplierOwner: Actor,
  p: Placement,
  fileName: string,
  name = 'Certificate of good standing'
): Promise<void> {
  const list = await clientSeat.get('/api/documents?view=templates')
  let templateId = ((list.json?.data?.templates ?? []) as { id: string; name: string }[]).find((t) => t.name === name)?.id
  if (!templateId) {
    const made = await clientSeat.post('/api/documents', { name, audience: 'VENDOR', needsSignature: false })
    templateId = made.json?.data?.template?.id
  }
  if (!templateId) return
  const ask = await clientSeat.post('/api/documents', { type: 'instance', templateId, subjectType: 'COMPANY', subjectId: p.supplier.id })
  const id = ask.json?.data?.instance?.id as string | undefined
  if (!id) return
  const sent = await clientSeat.post(`/api/documents/${id}/send`, {})
  if (sent.ok) papers.count(name, 'sent')
  const file = pdf(fileName, name, [`Holder: ${p.supplier.name}`, `Requested by: ${p.client.name}`, `Date: ${iso(new Date())}`])
  const up = await sendFile(ctx, supplierOwner, `/api/documents/${id}/upload`, file)
  if (up.ok) {
    papers.count(name, 'received')
    papers.stored(file)
  }
}

// ── One placement, award to first day ───────────────────────────────────

async function walkOne(
  ctx: Ctx,
  p: Placement,
  scenario: Scenario,
  consentTemplate: Map<string, Promise<string | null>>,
  index = 0
): Promise<Walk> {
  const walk: Walk = { id: p.id, started: false, hit: [], warnedThrough: false }
  const hr = paperworkSeat(ctx, p.supplier.slug)
  const compliance = verdictSeat(ctx, p.supplier.slug)
  const starter = startSeat(ctx, p.supplier.slug)
  const worker = workerOf(ctx, p)
  if (!hr || !compliance || !starter) {
    walk.stoppedBecause = `${p.supplier.name} seats nobody who can paper or start a placement`
    return walk
  }

  // Her terms first: nobody starts on terms nobody agreed, and it is her
  // move, from her own page, where the award left it waiting.
  if (await agreeHerTerms(ctx, p)) walk.hit.push('terms not yet agreed')
  const award = ctx.world.awards.find((a) => a.extra?.sellContractId === p.id)
  if (award && award.extra?.termsOnRecord === false) {
    // She could not agree them: the door refuses a person with no seat at
    // all. Nothing on paper changes that, so the walk stops here and says so.
    const page = worker ? await worker.get('/api/me/papers') : null
    if (!page || page.status === 403) {
      walk.stoppedBecause =
        `${p.personName} holds no seat, so cannot agree the terms or send any papers` +
        (page?.sentence ? ` (“${page.sentence.split('. ')[0]}.”)` : '')
      return walk
    }
  }

  // What the line requires, and what blocks, said to HR before anybody presses start.
  const asked = await hr.post('/api/compliance/clearance', { contractId: p.id })
  const askedOfPerson = ((asked.json?.data?.askedOfPerson ?? []) as { label?: string }[]).map((a) => String(a.label ?? ''))
  // The firm's own cover, where the clearance says it is not in order:
  // HR reads it here and the certificate is sent before anybody presses start.
  const ourCover = ((asked.json?.data?.ourCover ?? []) as { label?: string; says?: string }[])
    .map((c) => `${c.label ?? ''} ${c.says ?? ''}`)
    .join(' ')
  if (certificatesNamed(ourCover).length) await currentCertificate(ctx, p, ourCover)
  // And the firm's own papers the line asks for: the non-disclosure
  // agreement is the firm's to raise and the person's to sign.
  const oursToProduce = ((asked.json?.data?.oursToProduce ?? []) as { label?: string }[]).map((a) => String(a.label ?? ''))
  let ndaUpFront = false
  if (worker && oursToProduce.some((l) => /non-disclosure/i.test(l))) ndaUpFront = await ndaSigned(ctx, hr, worker, p, ndaTemplate)

  // What is already on the person's file, as HR would see it on the placement.
  const held = await ctx.read.verification.findMany({
    where: { personId: p.personId, status: { in: ['CLEAR', 'CONDITIONAL'] } },
    select: { type: true, expiresAt: true },
  })
  const holds = (type: string) => held.some((v) => v.type === type && (!v.expiresAt || v.expiresAt.getTime() > Date.now()))
  const hasI9 = holds('I9_EVERIFY')
  const hasBackground = holds('BACKGROUND_CHECK')

  // EAGER: the start is pressed before the I-9 is in, and refused.
  if (scenario === 'EAGER' && !hasI9) {
    const res = await ctx.expectRefusal(starter, (a) => a.post(`/api/contracts/${p.id}/activate`, { action: 'activate' }), 'I-9')
    if (res.status === 403) walk.hit.push('no I-9 on file')
  }

  // The worker sends what is hers to send, from her own page.
  if (worker) await workerSendsHerPapers(ctx, worker, p, hr)

  // HR examines what she showed and completes the I-9.
  if (!hasI9 && (await recordI9(hr, p, held)).ok) papers.count('I-9 and E-Verify', 'examined')
  // A license, where the line asks for one and none is in date.
  if (askedOfPerson.some((l) => /license/i.test(l)) && !holds('PROFESSIONAL_LICENSE')) {
    await hr.post('/api/compliance/verifications', {
      contractId: p.id, about: 'PERSON', type: 'PROFESSIONAL_LICENSE', issuer: 'State Board of Nursing',
      licenseNumber: `RN-${100000 + (hashOf(p.personId) % 900000)}`, licenseState: 'OR',
      validFrom: iso(plusDays(-200)), expiresAt: iso(plusDays(530)),
    })
  }

  // The background check: authorization from her, the order out, the verdict back.
  let backgroundReviewed: string | null = null
  if (!hasBackground) {
    const consentId = worker ? await consentSigned(ctx, hr, worker, p, consentTemplate) : null
    // The details it is run against, on a form she fills, and the package
    // out to the screening company: recorded as ordered, with the day.
    if (worker) await identifiersSent(ctx, hr, worker, p)
    const provider = PROVIDERS[hashOf(p.id) % PROVIDERS.length]
    const reference = `${provider.slice(0, 3).toUpperCase()}-${hashOf(p.id) % 1_000_000}`
    const ordered = await compliance.post('/api/compliance/verifications', {
      contractId: p.id, about: 'PERSON', type: 'BACKGROUND_CHECK', provider, reference,
      renderedOn: iso(plusDays(-3)), outcome: 'ORDERED', consentDocumentId: consentId ?? undefined,
    })
    if (ordered.ok) papers.count('Background check package', 'sent')
    if (scenario !== 'BACKGROUND_NOT_BACK') {
      const outcome = index % 10 === 3 ? 'FLAGGED' : index % 20 === 9 ? 'CONDITIONAL' : 'CLEAR'
      const verdict = await compliance.post('/api/compliance/verifications', {
        contractId: p.id, about: 'PERSON', type: 'BACKGROUND_CHECK', provider, reference,
        renderedOn: iso(plusDays(-1)), outcome, providerSays: PROVIDER_SAYS[outcome],
        consentDocumentId: consentId ?? undefined,
      })
      if (verdict.ok) papers.count('Background check verdict', 'verdict')
      const verificationId = verdict.json?.data?.id as string | undefined
      if (outcome === 'FLAGGED' && verificationId) {
        const after = await adverseSteps(ctx, compliance, p, verificationId, provider, index)
        walk.hit.push(`${provider} flagged the background check`)
        if (after === 'HELD') {
          walk.stoppedBecause = `on hold: ${provider} flagged the background check, ${p.personName} has the pre-adverse action notice and the wait is not over`
          return walk
        }
        backgroundReviewed = `${provider} flagged the background check; ${p.personName} answered within the wait and ${p.supplier.name} decided it does not change the decision. The report and the reason are on file.`
      }
    }
  }

  // Start. A warning is read, the reason written, and the start goes ahead;
  // a refusal is read and learned from where the fix is ours to make.
  //
  // Where the background check is still out, the first press is expected
  // to warn rather than refuse: a missing check is contractual, not law.
  const activate = (a: Actor) => a.post(`/api/contracts/${p.id}/activate`, { action: 'activate' })
  // Every press made while the background check is still out is expected
  // to warn about it, the first and any after something else was learned.
  const backgroundOut = (scenario === 'BACKGROUND_NOT_BACK' && !hasBackground) || backgroundReviewed !== null
  const press = (): Promise<Res> => (backgroundOut ? ctx.expectRefusal(starter, activate, /background check/i) : activate(starter))
  let res: Res = await press()
  const standingAsked = new Set<string>()
  const ndaAsked = new Set<string>()
  for (let attempt = 0; attempt < 5 && !res.ok; attempt++) {
    const code = res.json?.error?.code as string | undefined
    const certificateFirst =
      code === 'DOCUMENTS_WARN' &&
      ((/certificate|insurance|good standing/i.test(res.sentence ?? '') && !standingAsked.has(p.id)) ||
        (/non-disclosure/i.test(res.sentence ?? '') && !!worker && !ndaAsked.has(p.id) && !ndaUpFront))
    if ((code === 'DOCUMENTS_WARN' || code === 'GOVERNANCE_WARN') && !certificateFirst) {
      const chasing = ((res.json?.error?.chasing ?? []) as { label?: string }[]).map((c) => c.label).filter(Boolean)
      const background = /background/i.test(res.sentence ?? '') || chasing.some((c) => /background/i.test(String(c)))
      if (background) walk.hit.push('background check not back')
      walk.warnedThrough = true
      const reason =
        code === 'GOVERNANCE_WARN'
          ? `Reviewed the client's warning with the hiring manager; the placement goes ahead and the warning stays on the record.`
          : background && backgroundReviewed
            ? backgroundReviewed
            : background
            ? `The background check is not back and in date today. The client agreed the start; it is chased until the report is on file.`
            : `Still outstanding: ${chasing.join(', ') || 'papers listed on the placement'}. The start goes ahead and they are chased.`
      res = await starter.post(`/api/contracts/${p.id}/activate`, { action: 'activate', overrideReason: reason })
      continue
    }
    if (code === 'DOCUMENTS_WARN' && /non-disclosure/i.test(res.sentence ?? '') && worker && !ndaAsked.has(p.id) && !ndaUpFront) {
      // Learn: the firm's own non-disclosure agreement is the firm's to
      // send. HR raises it, she signs it from her own page, then the start.
      ndaAsked.add(p.id)
      if (await ndaSigned(ctx, hr, worker, p, ndaTemplate)) {
        walk.hit.push('non-disclosure agreement not signed')
        res = await press()
        continue
      }
    }
    if (code === 'TERMS_PENDING') {
      // Learn: she agrees the terms from her own page, then the start.
      if (!(await agreeHerTerms(ctx, p, true))) break
      walk.hit.push('terms not yet agreed')
      res = await press()
      continue
    }
    if (code === 'DOCUMENTS_WARN' && /certificate|insurance|good standing/i.test(res.sentence ?? '') && !standingAsked.has(p.id)) {
      // Learn: the client asks the supplier for the certificate its order
      // requires, the supplier sends a current one, the client records it.
      standingAsked.add(p.id)
      if (await currentCertificate(ctx, p, res.sentence ?? '')) {
        walk.hit.push('a certificate not yet collected')
        res = await press()
        continue
      }
    }
    if (code === 'DOCUMENTS_BLOCK' && /I-9|work authori/i.test(res.sentence ?? '')) {
      // Learn: the I-9 again, from the worker's documents.
      walk.hit.push('no I-9 on file')
      await recordI9(hr, p, held)
      res = await press()
      continue
    }
    break
  }

  if (res.ok) {
    walk.started = true
    await intoTheWorld(ctx, p, starter.key)
  } else {
    walk.stoppedBecause = res.sentence ?? `the start answered ${res.status}`
  }
  return walk
}

/**
 * The worker opens her own paperwork page and sends each paper that is
 * hers to send.
 *
 * Two passes, the way the page works: she opens a request for each item
 * she owes, and the page then shows each one as a paper with its own
 * button — Sign where it needs her signature, Upload where it needs a
 * file — and she presses that one.
 */
async function workerSendsHerPapers(ctx: Ctx, worker: Actor, p: Placement, hr: Actor): Promise<void> {
  type Row = { id?: string; kind?: string; documentTypeKey?: string; openAskAt?: string | null; todo?: string | null; name?: string; received?: boolean; needsSignature?: boolean }
  const page = await worker.get('/api/me/papers')
  const papersOnPage = (page.json?.data?.papers ?? []) as Row[]
  const owed = papersOnPage.filter((x) => x.kind === 'OUTSTANDING' && x.documentTypeKey && x.openAskAt && !x.received)
  const opened: { askId: string; key: string; name: string }[] = []
  for (const item of owed) {
    const res = await worker.post('/api/me/papers', { documentTypeKey: item.documentTypeKey })
    const askId = res.json?.data?.askId as string | undefined
    if (res.ok && askId) {
      opened.push({ askId, key: String(item.documentTypeKey), name: item.name ?? String(item.documentTypeKey) })
      // The line asked; opening the request is the ask reaching her.
      papers.count(KIND_OF[String(item.documentTypeKey)] ?? item.name ?? String(item.documentTypeKey), 'sent')
    }
  }
  if (opened.length === 0) return

  const again = await worker.get('/api/me/papers')
  const rows = (again.json?.data?.papers ?? []) as Row[]
  const passportRunsOut = plusDays(900 + (hashOf(p.personId) % 2400))
  for (const o of opened) {
    const kind = KIND_OF[o.key] ?? o.name
    const row = rows.find((r) => r.id === o.askId && r.kind === 'DOCUMENT') ?? rows.find((r) => r.id === o.askId)
    if (row && (row.todo === null || row.todo === undefined) && row.kind !== 'OUTSTANDING') continue
    const slug = p.personName.replace(/\s+/g, '-').toLowerCase()
    // What she sends is what the paper is: a photograph of the identity
    // document she chose, the I-9 with her Section 1, a signed agreement.
    const file =
      o.key === 'RIGHT_TO_WORK'
        ? photo(`${slug}-${hashOf(p.personId) % 3 === 0 ? 'permanent-resident-card' : 'passport'}.png`)
        : pdf(`${slug}-${o.key.toLowerCase()}.pdf`, o.name, [
            `Name: ${p.personName}`,
            o.key === 'I9_EVERIFY' ? `Section 1 completed and signed on ${iso(new Date())}. Document shown for Section 2: passport.` : `Signed by ${p.personName} on ${iso(new Date())}.`,
            `For: ${p.supplier.name}`,
          ])
    const sign = !!(row?.needsSignature || row?.todo === 'sign')
    let sent = await sendFile(ctx, worker, `/api/documents/${o.askId}/${sign ? 'sign' : 'upload'}`, file, {
      ...(sign ? { attests: 'true' } : {}),
      ...(o.key === 'I9_EVERIFY' ? { note: 'Section 1 completed and signed; passport shown for Section 2.' } : {}),
    })
    // Learn: told the paper needs her signature, she signs it.
    if (sent.json?.error?.code === 'NEEDS_SIGNATURE') {
      sent = await sendFile(ctx, worker, `/api/documents/${o.askId}/sign`, file, { attests: 'true' })
    }
    if (!sent.ok) continue
    papers.count(kind, 'received')
    papers.stored(file)
    // HR looks at what she sent. The I-9 is examined where it is completed
    // (recorded with its edition and the document behind it), not here.
    if (o.key === 'I9_EVERIFY') continue
    // Learned from the first run: a paper of a kind that runs out is
    // accepted with the date printed on it, a license as much as an ID.
    const body: Record<string, unknown> =
      o.key === 'RIGHT_TO_WORK'
        ? { verdict: 'ACCEPT', expiresAt: iso(passportRunsOut) }
        : o.key === 'PROFESSIONAL_LICENSE'
          ? { verdict: 'ACCEPT', expiresAt: iso(plusDays(530)) }
        : o.key === 'NDA'
          ? { verdict: 'ACCEPT', validFrom: iso(new Date()), expiresAt: iso(plusDays(3 * 365)) }
          : { verdict: 'ACCEPT' }
    await hr.get(`/api/documents/${o.askId}/file`)
    const looked = await hr.post(`/api/documents/${o.askId}/examine`, body)
    if (looked.ok) papers.count(kind, 'examined')
  }
}

/** The kind each owed paper is counted under. */
const KIND_OF: Record<string, string> = {
  RIGHT_TO_WORK: 'ID (passport or permanent resident card)',
  I9_EVERIFY: 'I-9 and E-Verify',
  NDA: 'Non-disclosure agreement (worker)',
}

/** The screening companies the firms order from. */
const PROVIDERS = ['Sterling', 'HireRight', 'First Advantage', 'Checkr']

/** What a provider writes, copied as written. */
const PROVIDER_SAYS: Record<string, string> = {
  CLEAR: 'County criminal, federal criminal and national sex offender registry searches complete. No records found.',
  CONDITIONAL: 'Searches complete. Employment verification for one prior employer could not be completed; all other components clear.',
  FLAGGED: 'County criminal search returned one record requiring review. A copy of the record is included with this report.',
}

/**
 * The details a background check is run against, on a form she fills
 * from her own seat after the offer: her date of birth and her Social
 * Security number. Asked here and not at screening, because the rule
 * table puts them after the offer. HR looks at the form and accepts it.
 */
async function identifiersSent(ctx: Ctx, hr: Actor, worker: Actor, p: Placement): Promise<void> {
  const name = 'Background check details'
  let tpl = detailsTemplate.get(p.supplier.slug)
  if (!tpl) {
    tpl = (async () => {
      const list = await hr.get('/api/documents?view=templates')
      const found = ((list.json?.data?.templates ?? []) as { id: string; name: string; needsSignature?: boolean }[]).find((t) => t.name === name && !t.needsSignature)
      if (found) return found.id
      const made = await hr.post('/api/documents', { name, audience: 'CANDIDATE', needsSignature: false })
      return (made.json?.data?.template?.id as string | undefined) ?? null
    })()
    detailsTemplate.set(p.supplier.slug, tpl)
  }
  const templateId = await tpl
  if (!templateId) return
  const made = await hr.post('/api/documents', { type: 'instance', templateId, subjectType: 'PERSON', subjectId: p.personId })
  const id = made.json?.data?.instance?.id as string | undefined
  if (!id) return
  if (!(await hr.post(`/api/documents/${id}/send`, {})).ok) return
  papers.count(name, 'sent')
  const file = pdf(`${p.personName.replace(/\s+/g, '-').toLowerCase()}-background-details.pdf`, name, [
    `Name: ${p.personName}`,
    'Date of birth and Social Security number: given on the form, shown here only by their last four digits.',
    `SSN ending ${String(1000 + (hashOf(p.personId) % 9000))}`,
    'Addresses for the last seven years: listed.',
  ])
  const up = await sendFile(ctx, worker, `/api/documents/${id}/upload`, file)
  if (!up.ok) return
  papers.count(name, 'received')
  papers.stored(file)
  const looked = await hr.post(`/api/documents/${id}/examine`, { verdict: 'ACCEPT' })
  if (looked.ok) papers.count(name, 'examined')
}

const detailsTemplate = new Map<string, Promise<string | null>>()
const noticeTemplate = new Map<string, Promise<string | null>>()

/**
 * After a flagged report: the steps that stay with the firm that ordered
 * it. The pre-adverse action notice goes to the person with a copy of the
 * report and the summary of rights attached; the final notice is refused
 * until the wait is over (the run has no clock, so it always is refused);
 * and for half of them the person answers within the wait and the firm
 * decides the report does not change the decision. The other half stay
 * on hold, which is the honest state on the day the notice went.
 */
async function adverseSteps(ctx: Ctx, seat: Actor, p: Placement, verificationId: string, provider: string, index: number): Promise<'NOT_TAKEN' | 'HELD'> {
  const name = 'Pre-adverse action notice'
  let tpl = noticeTemplate.get(p.supplier.slug)
  if (!tpl) {
    tpl = (async () => {
      const list = await seat.get('/api/documents?view=templates')
      const found = ((list.json?.data?.templates ?? []) as { id: string; name: string }[]).find((t) => t.name === name)
      if (found) return found.id
      const made = await seat.post('/api/documents', { name, audience: 'CANDIDATE', needsSignature: false })
      return (made.json?.data?.template?.id as string | undefined) ?? null
    })()
    noticeTemplate.set(p.supplier.slug, tpl)
  }
  const templateId = await tpl
  if (!templateId) return 'HELD'
  const made = await seat.post('/api/documents', { type: 'instance', templateId, subjectType: 'PERSON', subjectId: p.personId })
  const noticeId = made.json?.data?.instance?.id as string | undefined
  if (!noticeId) return 'HELD'
  if (!(await seat.post(`/api/documents/${noticeId}/send`, {})).ok) return 'HELD'
  // The copy of the report and the summary of rights, attached by the firm.
  const copy = pdf(`${p.personName.replace(/\s+/g, '-').toLowerCase()}-report-copy.pdf`, `${name} — copy of the ${provider} report`, [
    `To: ${p.personName}`,
    `${provider} reported on the background check you authorized. A copy of the report is attached.`,
    'A Summary of Your Rights Under the Fair Credit Reporting Act is attached.',
    `You may dispute the report with ${provider} directly. Nothing has been decided.`,
  ])
  const attached = await sendFile(ctx, seat, `/api/documents/${noticeId}/upload`, copy)
  if (!attached.ok) return 'HELD'
  papers.count(name, 'sent')
  papers.stored(copy)
  const pre = await seat.post('/api/compliance/adverse-action', { verificationId, contractId: p.id, step: 'PRE_NOTICE', noticeDocumentId: noticeId })
  if (!pre.ok) {
    ctx.log(`${p.personName}: the pre-adverse action notice was refused: ${pre.sentence}`)
    return 'HELD'
  }
  // The final notice before the wait is over is refused: the rule held on purpose.
  await ctx.expectRefusal(
    seat,
    (a) => a.post('/api/compliance/adverse-action', { verificationId, contractId: p.id, step: 'FINAL', reason: 'The record is relevant to the job.' }),
    'has until'
  )
  // Every other flagged report stays on hold (the tenth, thirtieth… placement).
  if (Math.floor(index / 10) % 2 === 0) return 'HELD'
  const decided = await seat.post('/api/compliance/adverse-action', {
    verificationId, contractId: p.id, step: 'NOT_TAKEN',
    reason: `${p.personName} answered within the wait with the court's record showing the charge was dismissed. It does not bear on this job.`,
  })
  if (decided.ok) papers.count('Background check verdict', 'examined')
  return decided.ok ? 'NOT_TAKEN' : 'HELD'
}

/** HR records the I-9 it completed, from the passport the worker showed. */
async function recordI9(hr: Actor, p: Placement, held: { type: string; expiresAt: Date | null }[]): Promise<Res> {
  // The passport on her file where there is one, else the one in front of
  // HR: a date printed on it, stable for this person across runs.
  const onFile = held.find((v) => v.type === 'PASSPORT' && v.expiresAt && v.expiresAt.getTime() > Date.now())
  const passportRunsOut = onFile?.expiresAt ?? plusDays(900 + (hashOf(p.personId) % 2400))
  return hr.post('/api/compliance/verifications', {
    contractId: p.id, about: 'PERSON', type: 'I9_EVERIFY', formEdition: I9_EDITION,
    evidence: [{ type: 'PASSPORT', issuer: 'U.S. Department of State', expiresAt: iso(passportRunsOut) }],
  })
}

/**
 * The person's signed authorization for the background check.
 *
 * HR raises the authorization from the firm's own template, sends it,
 * and the worker signs it from her own page. That is what she gives: her
 * permission, never the report.
 */
async function consentSigned(
  ctx: Ctx,
  hr: Actor,
  worker: Actor,
  p: Placement,
  templates: Map<string, Promise<string | null>>
): Promise<string | null> {
  let tpl = templates.get(p.supplier.slug)
  if (!tpl) {
    tpl = (async () => {
      const name = 'Background check authorization'
      const list = await hr.get('/api/documents?view=templates')
      const found = ((list.json?.data?.templates ?? []) as { id: string; name: string }[]).find((t) => t.name === name)
      if (found) return found.id
      const made = await hr.post('/api/documents', { name, audience: 'CANDIDATE', needsSignature: true })
      return (made.json?.data?.template?.id as string | undefined) ?? null
    })()
    templates.set(p.supplier.slug, tpl)
  }
  const templateId = await tpl
  if (!templateId) return null
  const made = await hr.post('/api/documents', { type: 'instance', templateId, subjectType: 'PERSON', subjectId: p.personId })
  const id = made.json?.data?.instance?.id as string | undefined
  if (!id) return null
  if ((await hr.post(`/api/documents/${id}/send`, {})).ok) papers.count('Background check authorization', 'sent')
  // Her signature, with the signed disclosure and authorization attached:
  // a standalone form, as the law asks for it.
  const file = pdf(`${p.personName.replace(/\s+/g, '-').toLowerCase()}-background-authorization.pdf`, 'Disclosure and authorization', [
    `${p.supplier.name} may order a consumer report about ${p.personName} for employment purposes.`,
    `Signed by ${p.personName} on ${iso(new Date())}.`,
  ])
  const signed = await sendFile(ctx, worker, `/api/documents/${id}/sign`, file, { attests: 'true' })
  if (!signed.ok) ctx.log(`${p.personName} could not sign the background check authorization: ${signed.sentence}`)
  else {
    papers.count('Background check authorization', 'received')
    papers.stored(file)
  }
  return signed.ok ? id : null
}

/** The started placement, both lines, for the money stations. */
async function intoTheWorld(ctx: Ctx, p: Placement, by: string): Promise<void> {
  const line = await ctx.read.sellContract.findUnique({
    where: { id: p.id },
    select: {
      state: true, workOrderId: true,
      buyLinks: {
        select: {
          buyContract: {
            select: {
              id: true, state: true, workOrderId: true,
              company: { select: { slug: true } },
              vendorCompany: { select: { slug: true } },
            },
          },
        },
      },
    },
  })
  const extra = { state: line?.state ?? 'IN_PROGRESS', startedBy: by, startDate: iso(p.startDate), endDate: p.endDate ? iso(p.endDate) : null }
  const have = ctx.world.contracts.find((c) => c.id === p.id)
  if (have) have.extra = { ...(have.extra ?? {}), ...extra }
  else {
    ctx.world.contracts.push({
      id: p.id, by, side: 'SELL', personId: p.personId, sellerSlug: p.supplier.slug, buyerSlug: p.client.slug,
      orderId: line?.workOrderId ?? undefined, extra,
    })
  }
  for (const l of line?.buyLinks ?? []) {
    const b = l.buyContract
    const buyExtra = { state: b.state, startedBy: by, sellContractId: p.id }
    const had = ctx.world.contracts.find((c) => c.id === b.id)
    if (had) had.extra = { ...(had.extra ?? {}), ...buyExtra }
    else {
      ctx.world.contracts.push({
        id: b.id, by, side: 'BUY', personId: p.personId,
        // The firm paid on a buy line is the vendor below, or the person on payroll.
        sellerSlug: b.vendorCompany?.slug ?? p.personEmail, buyerSlug: b.company.slug,
        orderId: b.workOrderId ?? undefined, extra: buyExtra,
      })
    }
  }
}

/**
 * The person agrees the terms the firm stated, from her own page, where
 * the award left them waiting on her. True where she agreed now.
 *
 * Read off the award the station before made; for a seeded placement
 * with no award fact, only when the start has said so (`known`), and
 * then the submission is found the way the placement page finds it.
 */
async function agreeHerTerms(ctx: Ctx, p: Placement, known = false): Promise<boolean> {
  const award = ctx.world.awards.find((a) => a.extra?.sellContractId === p.id)
  if (award && award.extra?.termsOnRecord === true && !known) return false
  if (!award && !known) return false
  let submissionId = award?.submissionId ?? null
  if (!submissionId) {
    const line = await ctx.read.sellContract.findUnique({ where: { id: p.id }, select: { requirementId: true } })
    if (!line?.requirementId) return false
    const sub = await ctx.read.submission.findFirst({
      where: { requirementId: line.requirementId, personId: p.personId },
      select: { id: true },
    })
    submissionId = sub?.id ?? null
  }
  const worker = workerOf(ctx, p)
  if (!submissionId || !worker) return false
  const yes = await worker.post(`/api/submissions/${submissionId}/terms`, { action: 'agree' })
  if (yes.ok && award) award.extra = { ...(award.extra ?? {}), termsOnRecord: yes.json?.data?.onRecord === true }
  return yes.ok
}

/** One ask per supplier per kind of certificate, however many placements need it. */
const certificateAsks = new Map<string, Promise<boolean>>()

/** The kinds of certificate a sentence names. */
function certificatesNamed(sentence: string): string[] {
  const out: string[] = []
  if (/good standing/i.test(sentence)) out.push('GOOD_STANDING')
  if (/general liability/i.test(sentence)) out.push('INSURANCE_GL')
  if (/workers.? comp/i.test(sentence)) out.push('INSURANCE_WC')
  return out
}

/**
 * Every certificate a warning says is not collected or about to run out:
 * the client asks the supplier, the supplier sends a current one, the
 * client records it. True where at least one was recorded.
 */
async function currentCertificate(ctx: Ctx, p: Placement, sentence: string): Promise<boolean> {
  const results = await Promise.all(certificatesNamed(sentence).map((type) => certificateOnce(ctx, p, type)))
  return results.some(Boolean)
}

function certificateOnce(ctx: Ctx, p: Placement, type: string): Promise<boolean> {
  const key = `${p.supplier.id}:${p.client.id}:${type}`
  let pending = certificateAsks.get(key)
  if (!pending) {
    pending = (async () => {
      const supplierOwner = ctx.cast.at(p.supplier.slug, 'owner')
      const clientSeat = clientComplianceSeat(ctx, p.client.slug)
      if (!supplierOwner || !clientSeat) return false
      const from = plusDays(-20)
      const to = plusDays(345)
      await askAndSend(ctx, clientSeat, supplierOwner, p, `${type.toLowerCase()}-${iso(from)}.pdf`, CERTIFICATE_NAME[type])
      const recorded = await clientSeat.post('/api/compliance/verifications', {
        contractId: p.id, about: 'FIRM', type,
        issuer: type === 'GOOD_STANDING' ? 'Secretary of State' : 'The Hartford',
        reference: `${type === 'GOOD_STANDING' ? 'GS' : 'POL'}-${hashOf(p.supplier.id + type) % 1_000_000}`,
        validFrom: iso(from), expiresAt: iso(to),
      })
      if (recorded.ok) papers.count(CERTIFICATE_NAME[type], 'examined')
      return recorded.ok
    })()
    certificateAsks.set(key, pending)
  }
  return pending
}

const CERTIFICATE_NAME: Record<string, string> = {
  GOOD_STANDING: 'Certificate of good standing',
  INSURANCE_GL: 'Certificate of general liability insurance',
  INSURANCE_WC: 'Certificate of workers’ compensation insurance',
}

/** One non-disclosure template per supplier, shared by every placement there. */
const ndaTemplate = new Map<string, Promise<string | null>>()

/**
 * The firm's own non-disclosure agreement, raised by HR and signed by the
 * person from her own page. True where it is signed.
 */
async function ndaSigned(
  ctx: Ctx,
  hr: Actor,
  worker: Actor,
  p: Placement,
  templates: Map<string, Promise<string | null>>
): Promise<boolean> {
  let tpl = templates.get(p.supplier.slug)
  if (!tpl) {
    tpl = (async () => {
      const name = 'Non-disclosure agreement'
      const list = await hr.get('/api/documents?view=templates')
      const found = ((list.json?.data?.templates ?? []) as { id: string; name: string; needsSignature?: boolean }[]).find(
        (t) => t.name === name && t.needsSignature !== false
      )
      if (found) return found.id
      const made = await hr.post('/api/documents', { name, audience: 'CANDIDATE', needsSignature: true })
      return (made.json?.data?.template?.id as string | undefined) ?? null
    })()
    templates.set(p.supplier.slug, tpl)
  }
  const templateId = await tpl
  if (!templateId) return false
  const made = await hr.post('/api/documents', { type: 'instance', templateId, subjectType: 'SELL_CONTRACT', subjectId: p.id })
  const id = made.json?.data?.instance?.id as string | undefined
  if (!id) return false
  if ((await hr.post(`/api/documents/${id}/send`, {})).ok) papers.count('Non-disclosure agreement (worker)', 'sent')
  const file = pdf(`${p.personName.replace(/\s+/g, '-').toLowerCase()}-nda-signed.pdf`, 'Non-disclosure agreement', [
    `Between ${p.supplier.name} and ${p.personName}.`,
    `Signed by ${p.personName} on ${iso(new Date())}.`,
  ])
  const signed = await sendFile(ctx, worker, `/api/documents/${id}/sign`, file, { attests: 'true' })
  if (!signed.ok) ctx.log(`${p.personName} could not sign the non-disclosure agreement: ${signed.sentence}`)
  else {
    papers.count('Non-disclosure agreement (worker)', 'received')
    papers.stored(file)
  }
  return signed.ok
}
