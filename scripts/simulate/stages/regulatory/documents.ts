/**
 * Stage: documents. Owned by regulatory. Runs after submit and before
 * the interviews: the papers that change hands when a supplier puts
 * somebody forward, and the screening papers a candidate sends.
 *
 * The founder, 2026-10-20: "Exchange 10000 documents like insurance, W-9,
 * NCA during submissions and screening and background checks." Every
 * paper here is a real small file through the real routes, as the real
 * seats, and is counted once per move: asked for (sent), answered
 * (received), looked at (examined). The background checks — the package
 * out and the provider's verdict back — are counted at the start, in
 * paperwork-and-start, because that is where the law puts them.
 *
 * ── 1. A supplier's first submission to a client ─────────────────────
 *
 * The client's compliance officer asks the supplier for what a supplier
 * owes before its people can be put in front of the client: the W-9,
 * certificates of general liability, workers' compensation and errors
 * and omissions insurance, the certificate of good standing, the signed
 * non-disclosure agreement and non-compete agreement between the two
 * firms, and the master service agreement where none stands between
 * them. The supplier answers each as itself — a file uploaded, or an
 * agreement signed with the signed copy attached — and the compliance
 * officer opens it and examines it: accepted with the dates and the
 * edition printed on it (an agreement countersigned; a certificate
 * recorded on the supplier's standing), or sent back with the reason and
 * answered again. Once per client and supplier, however many people the
 * supplier puts forward: the fastest way to be ignored is to ask a
 * supplier for the certificate it sent last week.
 *
 * ── 2. Screening: what a candidate owes, and what moves ──────────────
 *
 * The founder's list for screening named the résumé, ID, the I-9 from a
 * passport or a green card, education documents, and the consent and
 * identifiers for a background check. It is run through the rule table
 * (`compile` in lib/document-stages, US) before anybody asks for
 * anything, and the table moves four of them to the award: an identity
 * document before an offer is document abuse, the I-9 is completed after
 * the offer is accepted, most states and cities bar a criminal check
 * before a conditional offer, and a date of birth or a Social Security
 * number before an offer invites an age claim. Nothing is dropped: the
 * questions that may be asked now are asked instead (are you authorized
 * to work here, and will you need sponsorship; is there anything that
 * would stop you passing a background check), and the documents are
 * collected at the start. So at screening the supplier's HR asks the
 * candidate for the résumé, the degree certificate and the two
 * questions; the candidate answers from their own seat; HR examines.
 *
 * ── The rules, held on purpose ───────────────────────────────────────
 *
 *   - a worker cannot send a background check report — it is not hers
 *   - a paper nobody asked for cannot be put on file (a request drafted
 *     and never sent)
 *   - a supplier cannot open another supplier's paper
 *   - the AP clerk examines nothing
 *   - a certificate is not accepted without the date it runs out, and a
 *     W-9 not without its edition
 *   - nobody examines their own paper
 */
import type { Actor, Res } from '../../actors'
import { defineStage, type Ctx, type SubmissionFact } from '../../stage'
import { compile, type Wish } from '@/lib/document-stages'
import { kb, papers, pdf, photo, sendFile, type PaperFile } from './paper-files'
import { interviewNda, readOnboarding, registerFirms, registerWorkers, shortlist } from './registration'
import { expectAt, tally, type DocStage } from './stage-tally'

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + n * DAY)

function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** The founder's screening list, as a business would type it: all of it at application. */
export const SCREENING_WISHES: Wish[] = [
  { key: 'RESUME', label: 'Resume', hint: 'The current one.', required: true, wantedAt: 'APPLICATION' },
  { key: 'DEGREE', label: 'Degree certificate and transcripts', hint: 'Education documents.', required: false, wantedAt: 'APPLICATION' },
  { key: 'RIGHT_TO_WORK', label: 'ID', hint: 'A passport or a permanent resident card.', required: true, wantedAt: 'APPLICATION' },
  { key: 'I9_EVERIFY', label: 'I-9', hint: 'Completed from the passport or the card.', required: true, wantedAt: 'APPLICATION' },
  { key: 'BACKGROUND_CHECK', label: 'Background check consent', hint: 'The signed authorization.', required: true, wantedAt: 'APPLICATION' },
  { key: 'DOB_SSN', label: 'Background check identifiers', hint: 'Date of birth and Social Security number.', required: true, wantedAt: 'APPLICATION' },
]

// ── What a supplier owes a client ───────────────────────────────────────

interface SupplierPaper {
  /** The template name, which is the type's own label so it reads back to its type. */
  name: string
  sign: boolean
  /** What the examiner gives on an accept. */
  accept: (seed: number) => Record<string, string>
  /** Only where no agreement stands between the two firms. */
  onlyWithoutMsa?: boolean
}

const INSURERS = ['The Hartford', 'Travelers', 'Chubb', 'Liberty Mutual', 'Nationwide', 'CNA']
const insurer = (seed: number) => INSURERS[seed % INSURERS.length]

const SUPPLIER_PAPERS: SupplierPaper[] = [
  { name: 'W-9', sign: false, accept: () => ({ edition: 'Rev. March 2024' }) },
  {
    name: 'Certificate of general liability insurance', sign: false,
    accept: (s) => ({ issuer: insurer(s), reference: `GL-${100000 + (s % 900000)}`, validFrom: iso(plusDays(-40 - (s % 60))), expiresAt: iso(plusDays(300 - (s % 60))) }),
  },
  {
    name: 'Certificate of workers’ compensation', sign: false,
    accept: (s) => ({ issuer: insurer(s + 1), reference: `WC-${100000 + (s % 900000)}`, validFrom: iso(plusDays(-30 - (s % 50))), expiresAt: iso(plusDays(320 - (s % 50))) }),
  },
  {
    name: 'Errors and omissions insurance', sign: false,
    accept: (s) => ({ issuer: insurer(s + 2), reference: `EO-${100000 + (s % 900000)}`, validFrom: iso(plusDays(-60 - (s % 40))), expiresAt: iso(plusDays(290 - (s % 40))) }),
  },
  {
    name: 'Certificate of good standing', sign: false,
    accept: (s) => ({ issuer: 'Secretary of State', reference: `GS-${s % 100000}`, validFrom: iso(plusDays(-10 - (s % 20))), expiresAt: iso(plusDays(350 - (s % 20))) }),
  },
  { name: 'Non-disclosure agreement', sign: true, accept: () => ({ validFrom: iso(plusDays(0)), expiresAt: iso(plusDays(3 * 365)) }) },
  { name: 'Non-compete agreement', sign: true, accept: () => ({ validFrom: iso(plusDays(0)), expiresAt: iso(plusDays(365)) }) },
  { name: 'Master service agreement', sign: true, onlyWithoutMsa: true, accept: () => ({ validFrom: iso(plusDays(0)), expiresAt: iso(plusDays(3 * 365)) }) },
]

/** What the candidate owes at screening, after the rule table has moved what it moves. */
const SCREENING_FILES = [
  { name: 'Resume', key: 'RESUME' },
  { name: 'Degree certificate and transcripts', key: 'DEGREE' },
]

/**
 * Suppliers whose certificate of good standing is left to the start on
 * purpose, so paperwork-and-start can prove that a lapsed one blocks: a
 * supplier that sent a current certificate here rightly answers last
 * year's (learned from the run of 2026-10-21).
 */
export const standingLeftForTheStart = new Set<string>()

interface Pair {
  client: { id: string; slug: string; name: string }
  supplier: { id: string; slug: string; name: string }
  hasMsa: boolean
}

interface Screening {
  supplier: { id: string; slug: string; name: string }
  person: { id: string; name: string; email: string }
}

/** One paper's walk, for the closing sentence. */
interface Walked {
  ok: boolean
  sentBack: boolean
  why?: string
}

export default defineStage({
  name: 'documents',
  domain: 'REGULATORY',
  async run(ctx) {
    // ── 1. Onboarding: each company's set, read (the setting is not built) ──
    const onboarding = await readOnboarding(ctx)
    for (const l of onboarding) ctx.log(l)
    // ── 2. Company registration through the firm's own link ─────────────
    const firms = await registerFirms(ctx)
    ctx.log(`${firms.closed} of ${firms.of} firms registered through their own link and four approvals`)
    // ── 3. Worker registration from her own page ───────────────────────
    const workers = await registerWorkers(ctx, Math.max(12, Math.ceil(ctx.options.placements / 3)))
    ctx.log(`${workers.closed} of ${workers.of} workers registered from their own page`)

    const subs = ctx.world.submissions
    if (subs.length === 0) return { closed: 0, of: 0, says: 'Nobody was put forward this run, so no papers changed hands at submission.' }
    const before = papers.total
    const bytesBefore = papers.bytes

    const { pairs, screenings } = await whoOwesWhat(ctx, subs)
    if (pairs.length > 1) standingLeftForTheStart.add(pairs[pairs.length - 1].supplier.id)
    const plan = compile(SCREENING_WISHES, 'US')
    ctx.log(
      `${pairs.length} first submissions from a supplier to a client, ${screenings.length} candidates to screen; ` +
        `the rule table moved ${plan.moved.map((m) => m.label).join(', ')} to the award`
    )

    // ── The rules, once each, before the crowd ────────────────────────
    await proveTheRules(ctx, pairs, screenings)

    // ── 1. Supplier papers ──────────────────────────────────────────
    const pairWalks = await ctx.parallel(pairs, (p, i) => supplierPapers(ctx, p, i))
    // ── 2. Screening ────────────────────────────────────────────────
    const screenWalks = await ctx.parallel(screenings, (s, i) => screen(ctx, s, i))

    // ── 4. Shortlisting: a license for a licensed job ──────────────────
    const licensed = await shortlist(ctx, subs)
    // ── 5. Before the interview: the client's non-disclosure agreement ──
    const ndas = await interviewNda(ctx, subs)
    ctx.log(`${licensed.closed} of ${licensed.of} licenses; ${ndas.closed} of ${ndas.of} client NDAs (${ndas.clients.join(', ') || 'no client requires one'})`)
    tally.note('interview', ndas.clients.length ? `Required by ${ndas.clients.join(', ')}` : 'No client’s orders require one this run')

    const flat = (xs: typeof pairWalks) => xs.flatMap((r) => (r.ok ? r.value : [{ ok: false, sentBack: false, why: r.error }]))
    const supplierDone = flat(pairWalks)
    const screenDone = flat(screenWalks)
    const all = [...supplierDone, ...screenDone]
    const closed = all.filter((w) => w.ok).length
    const sentBack = all.filter((w) => w.sentBack).length
    const why = [...new Set(all.filter((w) => !w.ok).map((w) => w.why ?? 'it did not close'))].slice(0, 3)
    const moved = plan.moved
      .map((m) => `${m.label}${m.insteadAsk ? ' (asked as a question now)' : ''}`)
      .join(', ')
    return {
      closed,
      of: all.length,
      says:
        `${(papers.total - before).toLocaleString('en-US')} document moves: ${closed} of ${all.length} papers asked, answered and examined — ` +
        `${supplierDone.filter((w) => w.ok).length} from ${pairs.length} suppliers to their clients at the first submission, ` +
        `${screenDone.filter((w) => w.ok).length} from ${screenings.length} candidates at screening; ${sentBack} sent back with a reason and answered again. ` +
        `${kb(papers.bytes - bytesBefore)} of files stored by this station. ` +
        `Moved to the award by the rule table, not dropped: ${moved}.` +
        (why.length ? ` Not closed: ${why.join('; ')}.` : '') +
        ` Registration: ${firms.closed} of ${firms.of} firms through their own link and four approvals; ${workers.closed} of ${workers.of} workers from their own page. ` +
        `Shortlisting: ${licensed.closed} of ${licensed.of} professional licenses. Interview: ${ndas.closed} of ${ndas.of} client non-disclosure agreements signed and countersigned.` +
        (firms.why.length ? ` Firms not registered: ${firms.why.join('; ')}.` : '') +
        ` By kind: ${papers.says()}.`,
    }
  },
})

/** Which stage of the trade a paper of this station belongs to. */
export function stageOfKind(kind: string): DocStage {
  if (SCREENING_FILES.some((f) => f.name === kind)) return 'worker registration'
  if (QUESTIONS.some((q) => q.name === kind)) return 'shortlisting'
  return 'company registration'
}

// ── Who owes what ───────────────────────────────────────────────────────

async function whoOwesWhat(ctx: Ctx, subs: SubmissionFact[]): Promise<{ pairs: Pair[]; screenings: Screening[] }> {
  const jobs = new Map(ctx.world.jobs.map((j) => [j.id, j]))
  const company = (slug: string) => ctx.world.companies[slug]
  const pairKeys = new Map<string, Pair>()
  const screenKeys = new Map<string, { supplierSlug: string; personId: string }>()
  for (const s of subs) {
    const job = jobs.get(s.jobId)
    const client = job ? company(job.clientSlug) : null
    const supplier = company(s.supplierSlug)
    if (!client || !supplier) continue
    const k = `${client.slug}|${supplier.slug}`
    if (!pairKeys.has(k)) {
      pairKeys.set(k, {
        client: { id: client.id, slug: client.slug, name: client.name },
        supplier: { id: supplier.id, slug: supplier.slug, name: supplier.name },
        hasMsa: false,
      })
    }
    screenKeys.set(`${supplier.slug}|${s.personId}`, { supplierSlug: supplier.slug, personId: s.personId })
  }
  const pairs = [...pairKeys.values()]
  if (pairs.length) {
    const msas = await ctx.read.masterAgreement.findMany({
      where: { endedAt: null, OR: pairs.map((p) => ({ clientId: p.client.id, vendorId: p.supplier.id })) },
      select: { clientId: true, vendorId: true },
    })
    for (const p of pairs) p.hasMsa = msas.some((m) => m.clientId === p.client.id && m.vendorId === p.supplier.id)
  }
  const people = await ctx.read.person.findMany({
    where: { id: { in: [...new Set([...screenKeys.values()].map((s) => s.personId))] } },
    select: { id: true, name: true, primaryEmail: true },
  })
  const byId = new Map(people.map((p) => [p.id, p]))
  const screenings: Screening[] = []
  for (const s of screenKeys.values()) {
    const p = byId.get(s.personId)
    const sup = company(s.supplierSlug)
    if (!p?.primaryEmail || !sup) continue
    screenings.push({ supplier: { id: sup.id, slug: sup.slug, name: sup.name }, person: { id: p.id, name: p.name, email: p.primaryEmail } })
  }
  return { pairs, screenings }
}

// ── Seats ───────────────────────────────────────────────────────────────

function firstSeat(ctx: Ctx, slug: string, keys: string[]): Actor | null {
  for (const k of keys) {
    const a = ctx.cast.at(slug, k as never)
    if (a) return a
  }
  return null
}
/** At the client: the compliance officer, then the program manager, then the owner. */
const clientPaperSeat = (ctx: Ctx, slug: string) => firstSeat(ctx, slug, ['compliance', 'programme', 'owner'])
/** At the supplier, answering for the firm: whoever keeps its papers, else the owner. */
const supplierAnswerSeat = (ctx: Ctx, slug: string) => firstSeat(ctx, slug, ['hr', 'compliance', 'contracts', 'owner'])
/** At the supplier, asking a candidate: HR, then whoever keeps the firm's people. */
const supplierHrSeat = (ctx: Ctx, slug: string) => firstSeat(ctx, slug, ['hr', 'compliance', 'recruiter', 'resourcing', 'owner'])

function workerOf(ctx: Ctx, email: string): Actor | null {
  try {
    return ctx.cast.worker(email)
  } catch {
    return null
  }
}

// ── Templates, once per firm ────────────────────────────────────────────

const templates = new Map<string, Promise<string | null>>()

/** Papers the rule proofs already walked to the end, by client, supplier and name, so nobody is asked twice. */
const doneByRules = new Set<string>()

function templateAt(asker: Actor, name: string, audience: 'VENDOR' | 'CANDIDATE', needsSignature: boolean): Promise<string | null> {
  const key = `${asker.company?.id}|${name}|${needsSignature}`
  let t = templates.get(key)
  if (!t) {
    t = (async () => {
      const list = await asker.get('/api/documents?view=templates')
      const found = ((list.json?.data?.templates ?? []) as { id: string; name: string; needsSignature?: boolean }[]).find(
        (x) => x.name === name && (x.needsSignature ?? false) === needsSignature
      )
      if (found) return found.id
      const made = await asker.post('/api/documents', { name, audience, needsSignature })
      return (made.json?.data?.template?.id as string | undefined) ?? null
    })()
    templates.set(key, t)
  }
  return t
}

/** A request raised and sent: the asking firm's move, and the one that tells them. */
async function ask(asker: Actor, templateId: string, subjectType: 'COMPANY' | 'PERSON', subjectId: string, kind: string): Promise<string | null> {
  const made = await asker.post('/api/documents', { type: 'instance', templateId, subjectType, subjectId })
  const id = made.json?.data?.instance?.id as string | undefined
  if (!id) return null
  const sent = await asker.post(`/api/documents/${id}/send`, {})
  if (!sent.ok) return null
  papers.count(kind, 'sent')
  tally.asked(stageOfKind(kind))
  return id
}

/** The answer, as a file: uploaded, or signed with the signed copy attached. */
async function answer(ctx: Ctx, who: Actor, id: string, file: PaperFile, sign: boolean, kind: string, note?: string): Promise<Res> {
  const res = await sendFile(ctx, who, `/api/documents/${id}/${sign ? 'sign' : 'upload'}`, file, {
    ...(sign ? { attests: 'true' } : {}),
    ...(note ? { note } : {}),
  })
  if (res.ok) {
    papers.count(kind, 'received')
    papers.stored(file)
    tally.answered(stageOfKind(kind))
  }
  return res
}

/** The asking firm opens what arrived (where a file was sent) and examines it. */
async function examine(examiner: Actor, id: string, body: Record<string, unknown>, kind: string, hasFile = true): Promise<Res> {
  if (hasFile) await examiner.get(`/api/documents/${id}/file`)
  const res = await examiner.post(`/api/documents/${id}/examine`, body)
  if (res.ok && body.verdict === 'SEND_BACK') tally.sentBack(stageOfKind(kind))
  else if (res.ok) {
    papers.count(kind, 'examined')
    tally.examined(stageOfKind(kind))
  }
  return res
}

// ── 1. A supplier's papers, at its first submission to a client ─────────

async function supplierPapers(ctx: Ctx, p: Pair, i: number): Promise<Walked[]> {
  const asker = clientPaperSeat(ctx, p.client.slug)
  const answerer = supplierAnswerSeat(ctx, p.supplier.slug)
  if (!asker || !answerer) {
    return [{ ok: false, sentBack: false, why: `${!asker ? p.client.name : p.supplier.name} seats nobody who keeps its papers` }]
  }
  const out: Walked[] = []
  const seed = hashOf(p.client.id + p.supplier.id)
  for (const paper of SUPPLIER_PAPERS) {
    if (paper.onlyWithoutMsa && p.hasMsa) continue
    if (doneByRules.has(`${p.client.id}|${p.supplier.id}|${paper.name}`)) continue
    if (paper.name === 'Certificate of good standing' && standingLeftForTheStart.has(p.supplier.id)) continue
    const walked: Walked = { ok: false, sentBack: false }
    out.push(walked)
    const templateId = await templateAt(asker, paper.name, 'VENDOR', paper.sign)
    if (!templateId) { walked.why = `${p.client.name} could not add ${paper.name} to its library`; continue }
    const id = await ask(asker, templateId, 'COMPANY', p.supplier.id, paper.name)
    if (!id) { walked.why = `${p.client.name} could not ask for ${paper.name}`; continue }
    const fileOf = (n: number) =>
      pdf(`${p.supplier.slug}-${paper.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${n ? `-${n}` : ''}.pdf`, paper.name, [
        `Holder: ${p.supplier.name}`,
        `Requested by: ${p.client.name}`,
        ...(paper.sign ? [`Signed for ${p.supplier.name} by ${answerer.name}`] : []),
        `Date: ${iso(new Date())}`,
      ])
    let res = await answer(ctx, answerer, id, fileOf(0), paper.sign, paper.name)
    if (!res.ok) { walked.why = res.sentence ?? `the answer came back ${res.status}`; continue }

    // One supplier in nine sends a general liability certificate naming
    // somebody else as certificate holder; one in thirteen an unsigned W-9.
    const wrong =
      (paper.name.startsWith('Certificate of general') && i % 9 === 4) ||
      (paper.name === 'W-9' && i % 13 === 6)
    if (wrong) {
      const back = await examine(asker, id, {
        verdict: 'SEND_BACK',
        reason: paper.name === 'W-9'
          ? 'The W-9 is not signed in Part II. Sign and date it, then send it again.'
          : `The certificate names another company as certificate holder. It must name ${p.client.name}.`,
      }, paper.name)
      if (back.ok) {
        walked.sentBack = true
        papers.sentBack++
        res = await answer(ctx, answerer, id, fileOf(1), paper.sign, paper.name)
        if (!res.ok) { walked.why = res.sentence ?? 'the second answer did not arrive'; continue }
      }
    }
    const ok = await examine(asker, id, { verdict: 'ACCEPT', ...paper.accept(seed) }, paper.name)
    walked.ok = ok.ok
    if (!ok.ok) walked.why = ok.sentence ?? `the examination came back ${ok.status}`
  }
  return out
}

// ── 2. Screening ────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    name: 'Work authorization — the question',
    answer: (n: number) =>
      n % 6 === 0
        ? 'Authorized to work in the US now; will need sponsorship to continue past my current authorization.'
        : 'Authorized to work in the US; no sponsorship needed now or in the future.',
  },
  {
    name: 'Background check — the question',
    answer: () => 'Nothing I know of would prevent me passing a background check for this kind of work.',
  },
]

async function screen(ctx: Ctx, s: Screening, i: number): Promise<Walked[]> {
  const hr = supplierHrSeat(ctx, s.supplier.slug)
  const worker = workerOf(ctx, s.person.email)
  if (!hr || !worker) {
    return [{ ok: false, sentBack: false, why: !hr ? `${s.supplier.name} seats nobody in HR` : `${s.person.name} holds no seat of their own` }]
  }
  const out: Walked[] = []
  for (const f of SCREENING_FILES) {
    const walked: Walked = { ok: false, sentBack: false }
    out.push(walked)
    const templateId = await templateAt(hr, f.name, 'CANDIDATE', false)
    const id = templateId ? await ask(hr, templateId, 'PERSON', s.person.id, f.name) : null
    if (!id) { walked.why = `${s.supplier.name} could not ask for the ${f.name.toLowerCase()}`; continue }
    const fileOf = (n: number) =>
      pdf(`${s.person.name.replace(/\s+/g, '-').toLowerCase()}-${f.key.toLowerCase()}${n ? `-${n}` : ''}.pdf`, f.name, [
        `Name: ${s.person.name}`,
        f.key === 'RESUME' ? 'Summary: experience, skills and the last three engagements.' : 'Bachelor of Science, conferred; transcript attached.',
        `Sent to: ${s.supplier.name}`,
      ])
    let res = await answer(ctx, worker, id, fileOf(0), false, f.name)
    if (!res.ok) { walked.why = res.sentence ?? `the upload came back ${res.status}`; continue }
    if (f.key === 'RESUME' && i % 15 === 7) {
      const back = await examine(hr, id, { verdict: 'SEND_BACK', reason: 'The resume is password-protected and cannot be opened. Send it without the password.' }, f.name)
      if (back.ok) {
        walked.sentBack = true
        papers.sentBack++
        res = await answer(ctx, worker, id, fileOf(1), false, f.name)
        if (!res.ok) { walked.why = res.sentence ?? 'the second upload did not arrive'; continue }
      }
    }
    const ok = await examine(hr, id, { verdict: 'ACCEPT' }, f.name)
    walked.ok = ok.ok
    if (!ok.ok) walked.why = ok.sentence ?? `the examination came back ${ok.status}`
  }
  // The questions that stand in for the documents the rule table moved.
  for (const q of QUESTIONS) {
    const walked: Walked = { ok: false, sentBack: false }
    out.push(walked)
    const templateId = await templateAt(hr, q.name, 'CANDIDATE', true)
    const id = templateId ? await ask(hr, templateId, 'PERSON', s.person.id, q.name) : null
    if (!id) { walked.why = `${s.supplier.name} could not ask the question`; continue }
    const signed = await worker.post(`/api/documents/${id}/sign`, { attests: true, note: q.answer(hashOf(s.person.id)) })
    if (!signed.ok) { walked.why = signed.sentence ?? `the answer came back ${signed.status}`; continue }
    papers.count(q.name, 'received')
    tally.answered('shortlisting')
    // An answer signed with no file: read on the paper, nothing to open.
    const ok = await examine(hr, id, { verdict: 'ACCEPT' }, q.name, false)
    walked.ok = ok.ok
    if (!ok.ok) walked.why = ok.sentence ?? `the examination came back ${ok.status}`
  }
  return out
}

// ── The rules, once each ────────────────────────────────────────────────

async function proveTheRules(ctx: Ctx, pairs: Pair[], screenings: Screening[]): Promise<void> {
  const s = screenings.find((x) => workerOf(ctx, x.person.email) && supplierHrSeat(ctx, x.supplier.slug))
  if (s) {
    const hr = supplierHrSeat(ctx, s.supplier.slug)!
    const worker = workerOf(ctx, s.person.email)!
    // A worker cannot send a background check report: it is not hers to have.
    await expectAt(ctx, 'shortlisting', worker, (a) => a.post('/api/me/papers', { documentTypeKey: 'BACKGROUND_CHECK' }), 'is not a document you hold', { rule: 'a worker cannot send a background report' })
    // A paper nobody asked for cannot be put on file.
    const t = await templateAt(hr, 'Resume', 'CANDIDATE', false)
    if (t) {
      const draft = await hr.post('/api/documents', { type: 'instance', templateId: t, subjectType: 'PERSON', subjectId: s.person.id })
      const id = draft.json?.data?.instance?.id as string | undefined
      if (id) {
        await expectAt(ctx, 'worker registration', worker, (a) => sendFile(ctx, a, `/api/documents/${id}/upload`, pdf('unasked.pdf', 'Resume', [s.person.name])), 'has not asked you', { rule: 'a paper nobody asked for cannot go on file' })
      }
    }
  }

  const p = pairs.find((x) => clientPaperSeat(ctx, x.client.slug) && supplierAnswerSeat(ctx, x.supplier.slug))
  if (!p) return
  const asker = clientPaperSeat(ctx, p.client.slug)!
  const answerer = supplierAnswerSeat(ctx, p.supplier.slug)!
  const certT = await templateAt(asker, 'Certificate of general liability insurance', 'VENDOR', false)
  const w9T = await templateAt(asker, 'W-9', 'VENDOR', false)
  if (!certT || !w9T) return
  const cert = await ask(asker, certT, 'COMPANY', p.supplier.id, 'Certificate of general liability insurance')
  const w9 = await ask(asker, w9T, 'COMPANY', p.supplier.id, 'W-9')
  if (!cert || !w9) return
  await answer(ctx, answerer, cert, pdf(`${p.supplier.slug}-gl-rules.pdf`, 'Certificate of general liability insurance', [p.supplier.name]), false, 'Certificate of general liability insurance')
  await answer(ctx, answerer, w9, pdf(`${p.supplier.slug}-w9-rules.pdf`, 'W-9', [p.supplier.name]), false, 'W-9')

  // Nobody examines their own paper.
  await expectAt(ctx, 'company registration', answerer, (a) => a.post(`/api/documents/${cert}/examine`, { verdict: 'ACCEPT' }), /Nobody examines their own paper|not here/, { rule: 'nobody examines their own paper' })
  // A certificate is not accepted without the day it runs out; a W-9 not without its edition.
  await expectAt(ctx, 'company registration', asker, (a) => a.post(`/api/documents/${cert}/examine`, { verdict: 'ACCEPT', validFrom: iso(plusDays(-10)) }), 'runs out', { best: true, rule: 'a certificate needs the day it runs out' })
  await expectAt(ctx, 'company registration', asker, (a) => a.post(`/api/documents/${w9}/examine`, { verdict: 'ACCEPT' }), 'edition', { rule: 'a W-9 needs its edition' })
  // The AP clerk examines nothing.
  const clerk = ctx.cast.at(p.client.slug, 'ap')
  if (clerk) await expectAt(ctx, 'company registration', clerk, (a) => a.post(`/api/documents/${cert}/examine`, { verdict: 'ACCEPT', validFrom: iso(plusDays(-10)), expiresAt: iso(plusDays(300)), issuer: 'Chubb' }), 'is not part of your seat', { rule: 'the AP clerk examines nothing' })
  // A supplier cannot open another supplier's paper.
  const other = pairs.find((x) => x.supplier.slug !== p.supplier.slug)
  const stranger = other ? supplierAnswerSeat(ctx, other.supplier.slug) : null
  if (stranger) await expectAt(ctx, 'company registration', stranger, (a) => a.get(`/api/documents/${cert}/file`), 'not here', { rule: 'a supplier cannot open another supplier’s paper' })

  // Then the real examination, as it should have been done.
  const seed = hashOf(p.client.id + p.supplier.id)
  const okCert = await examine(asker, cert, { verdict: 'ACCEPT', ...SUPPLIER_PAPERS[1].accept(seed) }, 'Certificate of general liability insurance')
  const okW9 = await examine(asker, w9, { verdict: 'ACCEPT', edition: 'Rev. March 2024' }, 'W-9')
  if (okCert.ok) doneByRules.add(`${p.client.id}|${p.supplier.id}|Certificate of general liability insurance`)
  if (okW9.ok) doneByRules.add(`${p.client.id}|${p.supplier.id}|W-9`)
  if (!okCert.ok || !okW9.ok) ctx.log(`the rule papers did not close: ${okCert.sentence ?? ''} ${okW9.sentence ?? ''}`)
}
