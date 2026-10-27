/**
 * The papers before anybody is hired, stage by stage, for the documents
 * station. Owned by regulatory.
 *
 * The founder, 2026-10-22: "Can you simulate request of documents at
 * every stage and give me a test script." The documents station already
 * moved the supplier's papers at its first submission and the screening
 * papers. This file adds what was missing before the award, each through
 * the real routes as the real seat:
 *
 *   1. Onboarding. A company setting what it requires has no screen yet
 *      (the company-level set waits on the founder's drawing), so each
 *      company's effective set is READ, per party, through the one door
 *      (`GET /api/documents/requirements`), and the report says plainly
 *      that the setting itself is not built.
 *   2. Company registration. A hiring manager recommends a firm; the firm
 *      sends its W-9, insurance, good standing, references and bank
 *      details through its own link, with no account; the department
 *      lead, Procurement, HR and Finance each verify their own items in
 *      turn, one certificate sent back and sent again.
 *   3. Worker registration. From her own page: the résumé she uploads,
 *      the certification her bench firm asks for, her yes to be marketed.
 *      Never an ID, a visa or an I-94: asking for one before an offer is
 *      refused by the rule table, and she cannot send one nobody asked for.
 *   4. Shortlisting. A professional license for a licensed job; the two
 *      questions that stand in for work authorization and the background
 *      check (asked by the documents station); a background check asked
 *      for before the offer is refused.
 *   5. Interview. The client's non-disclosure agreement, where the
 *      client's own orders require one, signed by the candidate before
 *      anybody meets her and countersigned by the client.
 */
import { expecting, type Actor, type Res } from '../../actors'
import type { Ctx, SubmissionFact } from '../../stage'
import { pdf, sendFile, type PaperFile } from './paper-files'
import { expectAt, tally, type DocStage } from './stage-tally'


const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + n * DAY)
const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// ── Seats ──────────────────────────────────────────────────────────────

export function firstSeat(ctx: Ctx, slug: string, keys: string[]): Actor | null {
  for (const k of keys) {
    const a = ctx.cast.at(slug, k as never)
    if (a) return a
  }
  return null
}
const clientPaperSeat = (ctx: Ctx, slug: string) => firstSeat(ctx, slug, ['compliance', 'programme', 'owner'])
const supplierHrSeat = (ctx: Ctx, slug: string) => firstSeat(ctx, slug, ['hr', 'compliance', 'recruiter', 'resourcing', 'owner'])

export function workerOf(ctx: Ctx, email: string | null | undefined): Actor | null {
  if (!email) return null
  try {
    return ctx.cast.worker(email)
  } catch {
    return null
  }
}

// ── Papers, as every station of regulatory asks them ─────────────────

const templates = new Map<string, Promise<string | null>>()

/** A firm's template for a paper, found by its exact name or made once. */
export function templateOf(asker: Actor, name: string, audience: 'VENDOR' | 'CANDIDATE' | 'CLIENT', needsSignature: boolean): Promise<string | null> {
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

/** A request raised and sent, counted against its stage. Null where it did not go. */
export async function askOf(
  stage: DocStage, asker: Actor, name: string, audience: 'VENDOR' | 'CANDIDATE' | 'CLIENT', needsSignature: boolean,
  subjectType: 'COMPANY' | 'PERSON' | 'SELL_CONTRACT', subjectId: string
): Promise<string | null> {
  const t = await templateOf(asker, name, audience, needsSignature)
  if (!t) return null
  const made = await asker.post('/api/documents', { type: 'instance', templateId: t, subjectType, subjectId })
  const id = made.json?.data?.instance?.id as string | undefined
  if (!id) return null
  if (!(await asker.post(`/api/documents/${id}/send`, {})).ok) return null
  tally.asked(stage)
  return id
}

/** The answer: a file uploaded, or a paper signed with the signed copy attached. */
export async function answerWith(ctx: Ctx, stage: DocStage, who: Actor, id: string, file: PaperFile, sign: boolean, note?: string, fields: Record<string, string> = {}): Promise<Res> {
  const res = await sendFile(ctx, who, `/api/documents/${id}/${sign ? 'sign' : 'upload'}`, file, {
    ...(sign ? { attests: 'true' } : {}),
    ...(note ? { note } : {}),
    ...fields,
  })
  if (res.ok) tally.answered(stage)
  return res
}

/** The asking firm opens what arrived and examines it. */
export async function examineAt(stage: DocStage, examiner: Actor, id: string, body: Record<string, unknown>): Promise<Res> {
  await examiner.get(`/api/documents/${id}/file`)
  const res = await examiner.post(`/api/documents/${id}/examine`, body)
  if (res.ok) {
    if (String(body.verdict) === 'SEND_BACK') tally.sentBack(stage)
    else tally.examined(stage)
  }
  return res
}

/** Ask, answer, examine; one in `backEvery` sent back with a reason first and answered again. True where it closed. */
export async function walkPaper(
  ctx: Ctx, stage: DocStage,
  o: {
    asker: Actor; answerer: Actor; name: string; audience: 'VENDOR' | 'CANDIDATE' | 'CLIENT'; sign: boolean
    subjectType: 'COMPANY' | 'PERSON' | 'SELL_CONTRACT'; subjectId: string
    file: (n: number) => PaperFile; accept: Record<string, unknown>
    sendBack?: string | null; note?: string
    /** Fields sent with the file: a license's number, issuer and expiry. */
    fields?: Record<string, string>
  }
): Promise<{ ok: boolean; id: string | null; why?: string }> {
  const id = await askOf(stage, o.asker, o.name, o.audience, o.sign, o.subjectType, o.subjectId)
  if (!id) return { ok: false, id: null, why: `${o.asker.company?.name ?? 'the firm'} could not ask for the ${o.name.toLowerCase()}` }
  let res = await answerWith(ctx, stage, o.answerer, id, o.file(0), o.sign, o.note, o.fields)
  if (!res.ok) return { ok: false, id, why: res.sentence ?? `the answer came back ${res.status}` }
  if (o.sendBack) {
    const back = await examineAt(stage, o.asker, id, { verdict: 'SEND_BACK', reason: o.sendBack })
    if (back.ok) {
      res = await answerWith(ctx, stage, o.answerer, id, o.file(1), o.sign, o.note, o.fields)
      if (!res.ok) return { ok: false, id, why: res.sentence ?? 'the second answer did not arrive' }
    }
  }
  const ok = await examineAt(stage, o.asker, id, { verdict: 'ACCEPT', ...o.accept })
  return ok.ok ? { ok: true, id } : { ok: false, id, why: ok.sentence ?? `the examination came back ${ok.status}` }
}

// ── 1. Onboarding: each company's set, read ───────────────────────────

const PARTY_WORD: Record<string, string> = { WORKER: 'workers', SUPPLIER: 'suppliers', CUSTOMER: 'customers', US: 'itself' }

/**
 * Each company's effective required set, per party, read through the one
 * door on an order or a line it holds. There is no company-level setting
 * to write: a company's set is the shipped floor plus what its own orders
 * add. Returns the lines for the report.
 */
export async function readOnboarding(ctx: Ctx): Promise<string[]> {
  tally.names('onboarding', 'Each company’s required set, read per party', 'nobody: read, not asked')
  const firms = Object.values(ctx.world.companies).filter((c) => c.kind === 'CLIENT' || c.kind === 'VENDOR')
  const lines: string[] = []
  let read = 0
  const perParty = new Map<string, number[]>()
  for (const f of firms) {
    const seat = f.kind === 'CLIENT' ? clientPaperSeat(ctx, f.slug) : firstSeat(ctx, f.slug, ['hr', 'compliance', 'contracts', 'owner'])
    if (!seat) continue
    // An order it issued, else a line it sells on.
    const order = await ctx.read.workOrder.findFirst({ where: { issuedById: f.id }, select: { id: true }, orderBy: { createdAt: 'asc' } })
    const line = order ? null : await ctx.read.sellContract.findFirst({ where: { companyId: f.id }, select: { id: true }, orderBy: { createdAt: 'asc' } })
    if (!order && !line) continue
    const res = await seat.get(`/api/documents/requirements?${order ? `workOrderId=${order.id}` : `sellContractId=${line!.id}`}`)
    if (!res.ok) continue
    read++
    const items = (res.json?.data?.items ?? []) as { key?: string; documentTypeKey?: string; owedBy?: string; label?: string; waived?: boolean }[]
    const by = new Map<string, string[]>()
    for (const it of items) {
      const party = String(it.owedBy ?? 'US')
      by.set(party, [...(by.get(party) ?? []), String(it.label ?? it.documentTypeKey ?? it.key ?? '?')])
    }
    for (const [party, list] of by) perParty.set(party, [...(perParty.get(party) ?? []), list.length])
    if (lines.length < 6) {
      lines.push(
        `${f.name} (${f.kind === 'CLIENT' ? 'client, its first order' : 'supplier, its first line'}): ` +
          [...by.entries()].map(([p, l]) => `of ${PARTY_WORD[p] ?? p.toLowerCase()} ${l.length} (${l.slice(0, 4).join(', ')}${l.length > 4 ? ', …' : ''})`).join('; ')
      )
    }
  }
  const summary = [...perParty.entries()]
    .map(([p, ns]) => {
      const lo = Math.min(...ns)
      const hi = Math.max(...ns)
      return `of ${PARTY_WORD[p] ?? p.toLowerCase()} ${lo === hi ? lo : `${lo}–${hi}`} item${hi === 1 ? '' : 's'}`
    })
    .join(', ')
  tally.note(
    'onboarding',
    `${read} companies’ sets read through the one door (${summary || 'none'}). The setting itself is not built: no screen lets a company say what it requires; its set is the shipped floor plus what its own orders add`
  )
  return [`Onboarding: ${read} companies’ effective sets read, per party. The company-level setting is not built yet.`, ...lines]
}

// ── 2. Company registration through the supplier's own link ──────────

/** A call through the firm's link: no session, recorded on the run's ledger like any call. */
async function viaLink(ctx: Ctx, key: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Res> {
  const started = new Date()
  const t0 = performance.now()
  let status = 0
  let json: any = null
  let sentence: string | null = null
  let code: string | undefined
  try {
    const res = await fetch(ctx.base + path, {
      method,
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
    status = res.status
    const text = await res.text()
    try { json = text ? JSON.parse(text) : null } catch { json = { raw: text.slice(0, 500) } }
  } catch (e: any) {
    sentence = `The server did not answer: ${String(e?.message ?? e)}`
  }
  const ms = Math.round(performance.now() - t0)
  const ok = status >= 200 && status < 300
  if (!ok && !sentence) {
    sentence = typeof json?.error?.message === 'string' ? json.error.message : null
    code = typeof json?.error?.code === 'string' ? json.error.code : undefined
  }
  ctx.ledger.record({
    at: started.toISOString(), seat: key, method, path: path.split('?')[0], status, ms,
    ...(sentence ? { sentence } : {}), ...(code ? { code } : {}),
    ...(expecting.getStore() ? { expected: true } : {}),
  })
  return { status, json, ms, ok, sentence }
}

/** The link as a seat, so an expected refusal through it is recorded against it. */
function linkSeat(ctx: Ctx, key: string): Actor {
  return {
    key,
    name: key,
    company: null,
    get: (path: string) => viaLink(ctx, key, 'GET', path),
    post: (path: string, body?: unknown) => viaLink(ctx, key, 'POST', path, body),
  } as unknown as Actor
}

const asFile = (f: PaperFile) => ({ fileName: f.name, size: f.bytes.length, type: f.type, content: f.bytes.toString('base64') })

interface Registered { ok: boolean; firm: string; why?: string }

/**
 * One firm, recommended to one client and walked through the four
 * approvals, with its side sent through its own link. `i` decides who
 * is sent back and who meets which rule.
 */
async function registerOne(ctx: Ctx, client: { slug: string; name: string }, i: number): Promise<Registered> {
  const hiring = firstSeat(ctx, client.slug, ['hiring'])
  const procurement = firstSeat(ctx, client.slug, ['procurement'])
  const hr = firstSeat(ctx, client.slug, ['hr'])
  const finance = firstSeat(ctx, client.slug, ['ap', 'finance'])
  const firm = `${client.name.split(' ')[0]} Registration Partner ${i + 1}`
  if (!hiring || !procurement || !hr || !finance) return { ok: false, firm, why: `${client.name} seats nobody at one of the four approvals` }
  const leads = [firstSeat(ctx, client.slug, ['vp']), firstSeat(ctx, client.slug, ['programme'])].filter(Boolean) as Actor[]
  const contact = `ops@${slugOf(firm)}.example`
  const made = await hiring.post('/api/supplier-requests', {
    name: firm, reason: 'Met them at a trade show; they place planners and analysts we cannot find.',
    skills: ['demand planning', 'analytics'], contactEmail: contact, contactName: 'Operations',
  })
  const id = made.json?.data?.request?.id as string | undefined
  const token = String(made.json?.data?.request?.link ?? '').split('/apply/')[1]
  if (!id || !token) return { ok: false, firm, why: made.sentence ?? 'the recommendation was not recorded' }
  const link = linkSeat(ctx, `link/${slugOf(firm)}`)
  const path = `/api/supplier-apply/${token}`
  const page = await link.get(path)
  const asks = (page.json?.data?.asks ?? []) as { key: string; required: boolean }[]
  tally.asked('company registration', asks.length)

  // Nobody signs their own: the hiring manager cannot confirm the firm she recommended.
  if (i === 0) {
    await expectAt(ctx, 'company registration', hiring, (a) => a.patch(`/api/supplier-requests/${id}`, { action: 'approve' }), 'Nobody signs their own', { rule: 'the recommender cannot approve her own firm' })
  }
  // The department lead (or the program manager standing in) confirms the need.
  let led = false
  for (const lead of leads) {
    const r = await lead.patch(`/api/supplier-requests/${id}`, { action: 'approve', note: 'There is a need for planners next quarter.' })
    if (r.ok) { led = true; break }
  }
  if (!led) return { ok: false, firm, why: `nobody at ${client.name} could confirm the need` }

  // The firm's side, through its link.
  const holder = (what: string, n = 0) =>
    pdf(`${slugOf(firm)}-${slugOf(what)}${n ? `-${n}` : ''}.pdf`, what, [`Holder: ${firm} LLC`, `Certificate holder: ${client.name}`, `Date: ${iso(new Date())}`])
  if (i === 1) {
    // A file's name with nothing behind it is not an answer.
    await expectAt(ctx, 'company registration', link, (a) => a.post(path, { docs: [{ key: 'TAX_FORM', fileName: 'w9.pdf', size: 1200 }] }), 'did not arrive with the file itself', { rule: 'a file name with no file is not an answer' })
  }
  const sent = await link.post(path, {
    legalName: `${firm} LLC`, experience: 'Eight years placing planners and analysts across retail and manufacturing.',
    skills: 'demand planning, analytics', address: '100 Main Street, Portland, OR',
    bank: { bankName: 'US Bank', accountName: `${firm} LLC`, last4: String(1000 + (hashOf(firm) % 9000)) },
    references: [{ name: 'Dana Whitfield', company: 'Acme Retail' }, { name: 'Raj Patel', company: 'Beta Foods' }],
    docs: [
      { key: 'TAX_FORM', ...asFile(holder('W-9')) },
      { key: 'INSURANCE', ...asFile(holder('Certificate of insurance')), validFrom: iso(plusDays(-30)), validUntil: iso(plusDays(335)) },
      { key: 'GOOD_STANDING', ...asFile(holder('Certificate of good standing')), validFrom: iso(plusDays(-20)), validUntil: iso(plusDays(345)) },
      { key: 'PROPOSAL', ...asFile(holder('Rate card')) },
    ],
  })
  if (!sent.ok) return { ok: false, firm, why: sent.sentence ?? `the link answered ${sent.status}` }
  const provided = ((sent.json?.data?.asks ?? []) as { state: string }[]).filter((a) => a.state === 'PROVIDED').length
  tally.answered('company registration', provided)

  const mark = (seat: Actor, key: string, state: string, extra: Record<string, unknown> = {}) =>
    seat.patch(`/api/supplier-requests/${id}`, { action: 'mark', key, state, ...extra })
  const held = async (seat: Actor, key: string, extra: Record<string, unknown> = {}) => {
    const r = await mark(seat, key, 'HELD', extra)
    if (r.ok) tally.examined('company registration')
    return r
  }

  // Procurement qualifies the firm.
  await held(procurement, 'EXPERIENCE')
  await held(procurement, 'REFERENCES')
  await mark(procurement, 'DNB_REPORT', 'WAIVED', { note: 'Small private firm; no D&B file. References and bank letter stand in.' })
  const qualified = await procurement.patch(`/api/supplier-requests/${id}`, { action: 'approve', note: 'References confirmed by phone.' })
  if (!qualified.ok) return { ok: false, firm, why: qualified.sentence ?? 'Procurement could not qualify it' }

  // Finance cannot act while the firm is with HR.
  if (i === 0) {
    await expectAt(ctx, 'company registration', finance, (a) => a.patch(`/api/supplier-requests/${id}`, { action: 'mark', key: 'BANK', state: 'HELD' }), 'is with HR now', { rule: 'one approval at a time, each its own items' })
  }
  // HR: one firm in three sends a certificate naming somebody else; HR sends it back, the firm sends it again.
  if (i % 3 === 2) {
    const back = await mark(hr, 'INSURANCE', 'MISSING', { note: `The certificate names another company as certificate holder. It must name ${client.name}.` })
    if (back.ok) {
      tally.sentBack('company registration')
      const again = await link.post(path, {
        docs: [{ key: 'INSURANCE', ...asFile(holder('Certificate of insurance', 1)), validFrom: iso(plusDays(-30)), validUntil: iso(plusDays(335)) }],
      })
      if (again.ok) tally.answered('company registration')
    }
  }
  await held(hr, 'INSURANCE', { validFrom: iso(plusDays(-30)), validUntil: iso(plusDays(335)) })
  await held(hr, 'GOOD_STANDING', { validFrom: iso(plusDays(-20)), validUntil: iso(plusDays(345)) })
  // A screening is on file only as the screening company's result: their
  // name, their reference, their date and their word (lib/attestation).
  await held(hr, 'VENDOR_SCREENING', {
    note: 'Sanctions and litigation screening, as the screening company returned it.',
    evidence: { provider: 'Meridian Risk Screening', reference: `MRS-${String(4400 + i).padStart(5, '0')}`, on: iso(plusDays(-3)), outcome: 'CLEAR' },
  })
  // An agreement is on file only with its signed copy: HR attaches the
  // signed MSA (and the NDA, where this client's orders ask for one),
  // then marks it on file.
  const list = await hr.get('/api/supplier-requests')
  const mine = ((list.json?.data?.requests ?? []) as { id: string; checklist?: { key: string }[] }[]).find((r) => r.id === id)
  const keys = new Set((mine?.checklist ?? []).map((c) => c.key))
  for (const [key, what] of [['AGREEMENT', 'Master service agreement'], ['NDA', 'Non-disclosure agreement']] as const) {
    if (!keys.has(key)) continue
    const signed = holder(`${what}, signed by both firms`)
    const form = new FormData()
    form.set('key', key)
    form.set('file', new Blob([new Uint8Array(signed.bytes)], { type: signed.type }), signed.name)
    const attached = await hr.upload(`/api/supplier-requests/${id}/file`, form)
    if (attached.ok) {
      tally.answered('company registration')
      await held(hr, key, { validFrom: iso(plusDays(0)), validUntil: iso(plusDays(3 * 365)) })
    }
  }
  const cleared = await hr.patch(`/api/supplier-requests/${id}`, { action: 'approve', note: 'Cover current; good standing current; screening clear.' })
  if (!cleared.ok) return { ok: false, firm, why: cleared.sentence ?? 'HR could not clear it' }

  // Finance: the W-9 and the bank details, then the last yes.
  // A W-9 is verified with the edition printed on it.
  await held(finance, 'TAX_FORM', { edition: 'Rev. March 2024' })
  await held(finance, 'BANK')
  const approved = await finance.patch(`/api/supplier-requests/${id}`, { action: 'approve', note: 'Bank details match the W-9 legal name.' })
  if (!approved.ok) return { ok: false, firm, why: approved.sentence ?? 'Finance could not approve it' }
  // The link has done its job once the client has decided.
  if (i === 0) {
    await expectAt(ctx, 'company registration', link, (a) => a.post(path, { legalName: `${firm} LLC` }), 'this link has done its job', { rule: 'a decided firm’s link takes nothing more' })
  }
  return { ok: true, firm }
}

/** Two firms per client, through the four approvals. Returns what closed. */
export async function registerFirms(ctx: Ctx): Promise<{ closed: number; of: number; why: string[] }> {
  tally.names('company registration', 'W-9, certificates of insurance, good standing, references and bank details through the firm’s own link; MSA, NDA and non-compete between the firms at the first submission', 'a supplier joining a client')
  const clients = Object.values(ctx.world.companies).filter(
    (c) => c.kind === 'CLIENT' && ['hiring', 'procurement', 'hr', 'ap'].every((d) => ctx.cast.at(c.slug, d as never))
  )
  const work = clients.flatMap((c) => [0, 1, 2].map((i) => ({ c, i })))
  const out = await ctx.parallel(work, ({ c, i }) => registerOne(ctx, c, i), 3)
  const done = out.map((r) => (r.ok ? r.value : { ok: false, firm: '?', why: r.error }))
  return {
    closed: done.filter((d) => d.ok).length,
    of: done.length,
    why: [...new Set(done.filter((d) => !d.ok).map((d) => `${d.firm}: ${d.why}`))].slice(0, 3),
  }
}

// ── 3. Worker registration, from her own page ─────────────────────────

/** Somebody the firm has not offered work: no line and no employment between them. */
async function notOffered(ctx: Ctx, personId: string, companyId: string): Promise<boolean> {
  const [sell, buy, emp] = await Promise.all([
    ctx.read.sellContract.findFirst({ where: { personId, OR: [{ companyId }, { clientCompanyId: companyId }, { endClientCompanyId: companyId }] }, select: { id: true } }),
    ctx.read.buyContract.findFirst({ where: { candidates: { some: { personId } }, OR: [{ companyId }, { vendorCompanyId: companyId }] }, select: { id: true } }),
    ctx.read.context.findFirst({ where: { personId, companyId, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } }),
  ])
  return !sell && !buy && !emp
}

/** Somebody with no line anywhere: nothing on the record asks her for anything yet. */
async function onNoLine(ctx: Ctx, personId: string): Promise<boolean> {
  const [sell, buy] = await Promise.all([
    ctx.read.sellContract.findFirst({ where: { personId }, select: { id: true } }),
    ctx.read.buyContract.findFirst({ where: { candidates: { some: { personId } } }, select: { id: true } }),
  ])
  return !sell && !buy
}

const CERTS = ['AWS Certified Solutions Architect', 'PMP', 'Certified Scrum Master', 'CPA', 'Six Sigma Green Belt', 'Salesforce Administrator']

export async function registerWorkers(ctx: Ctx, limit: number): Promise<{ closed: number; of: number }> {
  tally.names('worker registration', 'résumé, degree and transcripts, a certification, the yes to be marketed', 'the worker, from her own page')
  const bench = (ctx.world.bench ?? []).filter((b) => b.kind === 'LISTING' && b.email)
  const seen = new Set<string>()
  const people = bench.filter((b) => (seen.has(b.personId) ? false : (seen.add(b.personId), true))).slice(0, limit)
  let closed = 0

  // The rules, once each, on somebody nobody has offered work.
  for (const b of people) {
    const hr = supplierHrSeat(ctx, b.firmSlug)
    const worker = workerOf(ctx, b.email)
    if (!hr || !worker || !(await notOffered(ctx, b.personId, b.firmId))) continue
    // Never an ID before an offer: the rule table refuses it.
    const passport = await templateOf(hr, 'Passport', 'CANDIDATE', false)
    if (passport) {
      await expectAt(
        ctx, 'worker registration', hr,
        (a) => a.post('/api/documents', { type: 'instance', templateId: passport, subjectType: 'PERSON', subjectId: b.personId }),
        'is asked for after an offer', { best: true, rule: 'no ID before an offer' }
      )
    }
    if (await onNoLine(ctx, b.personId)) {
      // Nor can she send an I-94 nobody asked for.
      await expectAt(ctx, 'worker registration', worker, (a) => a.post('/api/me/papers', { documentTypeKey: 'I94' }), 'Nobody is asking you for that', { rule: 'no I-94 that nobody asked for' })
    }
    break
  }

  const results = await ctx.parallel(people, async (b, i) => {
    const worker = workerOf(ctx, b.email)
    const hr = supplierHrSeat(ctx, b.firmSlug)
    if (!worker || !hr) return false
    // Her résumé, uploaded from her own page.
    const cv = pdf(`${slugOf(b.name)}-resume.pdf`, 'Resume', [`Name: ${b.name}`, 'Summary: experience, skills and the last three engagements.'])
    const form = new FormData()
    form.set('label', `Resume ${iso(new Date())}`)
    form.set('file', new Blob([new Uint8Array(cv.bytes)], { type: cv.type }), cv.name)
    tally.asked('worker registration')
    const up = await worker.upload('/api/me/resumes', form)
    if (up.ok) tally.answered('worker registration')
    // A certification, asked by her bench firm and answered from her page.
    const cert = CERTS[hashOf(b.personId) % CERTS.length]
    const walked = await walkPaper(ctx, 'worker registration', {
      asker: hr, answerer: worker, name: 'Professional certification', audience: 'CANDIDATE', sign: false,
      subjectType: 'PERSON', subjectId: b.personId,
      file: (n) => pdf(`${slugOf(b.name)}-certification${n ? `-${n}` : ''}.pdf`, cert, [`Awarded to ${b.name}`, `Credential ${100000 + (hashOf(b.personId + cert) % 900000)}`]),
      accept: { verdict: 'ACCEPT' },
      sendBack: i % 11 === 5 ? 'The certificate is cut off at the credential number. Send the whole page.' : null,
    })
    // Her yes to be marketed, read from her own page; a pending ask answered.
    const mine = await worker.get('/api/me/benches')
    const granted = ((mine.json?.data?.benches ?? []) as unknown[]).length
    const invited = (mine.json?.data?.invited ?? []) as { listingId: string; terms?: unknown }[]
    tally.asked('worker registration', granted + invited.length)
    tally.answered('worker registration', granted)
    for (const inv of invited) {
      const yes = await worker.post(`/api/me/benches/${inv.listingId}/respond`, { said: 'ACCEPT', termsSeen: inv.terms ?? null })
      if (yes.ok) tally.answered('worker registration')
    }
    return up.ok && walked.ok
  })
  closed = results.filter((r) => r.ok && r.value).length
  return { closed, of: people.length }
}

// ── 4. Shortlisting: a license for a licensed job ─────────────────────

const LICENSED = /\b(nurse|rn|lpn|pharmac\w*|therapist|physician|clinical|sonograph\w*|radiolog\w*|engineer of record|cpa|electrician)\b/i

export async function shortlist(ctx: Ctx, subs: SubmissionFact[]): Promise<{ closed: number; of: number }> {
  tally.names('shortlisting', 'a professional license where the job is licensed; the work-authorization and background-check questions', 'the candidate, asked by the firm putting her forward')
  const jobs = new Map(ctx.world.jobs.map((j) => [j.id, j]))
  const licensed = subs.filter((s) => {
    const j = jobs.get(s.jobId)
    const client = j ? ctx.world.companies[j.clientSlug]?.name ?? '' : ''
    return !!j && (LICENSED.test(j.title) || /medical|health|hospital|clinic/i.test(client))
  })
  const seen = new Set<string>()
  const once = licensed.filter((s) => (seen.has(`${s.supplierSlug}|${s.personId}`) ? false : (seen.add(`${s.supplierSlug}|${s.personId}`), true)))

  // A background check before the offer is refused, and the question offered instead.
  for (const s of subs) {
    const hr = supplierHrSeat(ctx, s.supplierSlug)
    const firm = ctx.world.companies[s.supplierSlug]
    if (!hr || !firm || !(await notOffered(ctx, s.personId, firm.id))) continue
    const bg = await templateOf(hr, 'Background check', 'CANDIDATE', false)
    if (bg) {
      await expectAt(
        ctx, 'shortlisting', hr,
        (a) => a.post('/api/documents', { type: 'instance', templateId: bg, subjectType: 'PERSON', subjectId: s.personId }),
        'is asked for after an offer', { best: true, rule: 'no background check before an offer' }
      )
    }
    break
  }

  const people = await ctx.read.person.findMany({ where: { id: { in: once.map((s) => s.personId) } }, select: { id: true, name: true, primaryEmail: true } })
  const byId = new Map(people.map((p) => [p.id, p]))
  const out = await ctx.parallel(once, async (s, i) => {
    const p = byId.get(s.personId)
    const hr = supplierHrSeat(ctx, s.supplierSlug)
    const worker = workerOf(ctx, p?.primaryEmail)
    if (!p || !hr || !worker) return false
    const number = `RN-${100000 + (hashOf(p.id) % 900000)}`
    const walked = await walkPaper(ctx, 'shortlisting', {
      asker: hr, answerer: worker, name: 'Professional license', audience: 'CANDIDATE', sign: false,
      subjectType: 'PERSON', subjectId: p.id,
      file: (n) => pdf(`${slugOf(p.name)}-license${n ? `-${n}` : ''}.pdf`, 'Professional license', [`Licensee: ${p.name}`, `License ${number}`, 'State Board of Nursing']),
      fields: { licenseNumber: number, issuer: 'State Board of Nursing', expiresAt: iso(plusDays(400 + (hashOf(p.id) % 300))) },
      accept: { verdict: 'ACCEPT', expiresAt: iso(plusDays(400 + (hashOf(p.id) % 300))) },
      sendBack: i % 9 === 4 ? 'The license shown is the old card. Send the one with the current renewal date.' : null,
    })
    return walked.ok
  })
  return { closed: out.filter((r) => r.ok && r.value).length, of: once.length }
}

// ── 5. Interview: the client's non-disclosure agreement ───────────────

/** Clients whose own orders require a non-disclosure agreement. */
async function clientsRequiringNda(ctx: Ctx): Promise<Set<string>> {
  const rows = await ctx.read.documentRequirement.findMany({
    where: { documentTypeKey: 'NDA', workOrder: { issuedBy: { kind: 'CLIENT' } } },
    select: { workOrder: { select: { issuedById: true } } },
  })
  return new Set(rows.map((r) => r.workOrder!.issuedById))
}

export async function interviewNda(ctx: Ctx, subs: SubmissionFact[]): Promise<{ closed: number; of: number; clients: string[] }> {
  tally.names('interview', 'the client’s non-disclosure agreement, where the client’s orders require one, signed before anybody meets her', 'the candidate, asked by the client')
  const requiring = await clientsRequiringNda(ctx)
  const jobs = new Map(ctx.world.jobs.map((j) => [j.id, j]))
  const pairs = new Map<string, { clientSlug: string; personId: string }>()
  for (const s of subs) {
    const j = jobs.get(s.jobId)
    const c = j ? ctx.world.companies[j.clientSlug] : null
    if (!c || !requiring.has(c.id)) continue
    pairs.set(`${c.slug}|${s.personId}`, { clientSlug: c.slug, personId: s.personId })
  }
  const list = [...pairs.values()]
  const people = await ctx.read.person.findMany({ where: { id: { in: list.map((x) => x.personId) } }, select: { id: true, name: true, primaryEmail: true } })
  const byId = new Map(people.map((p) => [p.id, p]))
  let ruled = false
  const out = await ctx.parallel(list, async (x, i) => {
    const p = byId.get(x.personId)
    const asker = clientPaperSeat(ctx, x.clientSlug)
    const worker = workerOf(ctx, p?.primaryEmail)
    const client = ctx.world.companies[x.clientSlug]
    if (!p || !asker || !worker) return false
    const id = await askOf('interview', asker, 'Non-disclosure agreement', 'CANDIDATE', true, 'PERSON', p.id)
    if (!id) return false
    const file = (n: number) => pdf(`${slugOf(p.name)}-${x.clientSlug}-nda${n ? `-${n}` : ''}.pdf`, 'Non-disclosure agreement', [`Between ${client.name} and ${p.name}.`, `Signed by ${p.name} on ${iso(new Date())}.`])
    let res = await answerWith(ctx, 'interview', worker, id, file(0), true)
    if (!res.ok) return false
    // The AP clerk examines nothing, once.
    if (!ruled) {
      ruled = true
      const clerk = ctx.cast.at(x.clientSlug, 'ap')
      if (clerk) await expectAt(ctx, 'interview', clerk, (a) => a.post(`/api/documents/${id}/examine`, { verdict: 'ACCEPT', validFrom: iso(new Date()), expiresAt: iso(plusDays(730)) }), 'is not part of your seat', { rule: 'the AP clerk examines nothing' })
    }
    if (i % 10 === 3) {
      const back = await examineAt('interview', asker, id, { verdict: 'SEND_BACK', reason: 'The signature page is missing. Sign the last page and send the whole agreement.' })
      if (back.ok) {
        res = await answerWith(ctx, 'interview', worker, id, file(1), true)
        if (!res.ok) return false
      }
    }
    const ok = await examineAt('interview', asker, id, { verdict: 'ACCEPT', validFrom: iso(new Date()), expiresAt: iso(plusDays(730)) })
    return ok.ok
  })
  const names = Object.values(ctx.world.companies).filter((c) => requiring.has(c.id)).map((c) => c.name)
  return { closed: out.filter((r) => r.ok && r.value).length, of: list.length, clients: names }
}

/** Re-export so the documents station reads one stage word. */
export type { DocStage }
