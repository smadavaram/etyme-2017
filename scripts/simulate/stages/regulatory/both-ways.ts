/**
 * Every document action both ways, through the real routes, as the real
 * seats: the cases behind the document matrix (`doc-matrix.ts`).
 *
 * The founder, 2026-11-01: "Simulate documents to attach, sign or fill
 * for positive and negative cases", and then the six documents from a
 * walk of a worker starting through Brightmoor, each a named row with
 * its positive and its negative beside it. Run once per run, by the
 * extend station before it hands its tables back, on one placement this
 * run started, its worker, its employer and its client.
 *
 * Nothing here writes a row. Every move is a route a person presses;
 * every refusal is asked for with `ctx.expectRefusal`, so the run's own
 * table of rules shows whether it held; and where the routes have no
 * rule for a case, the matrix says so as a finding with its owner rather
 * than a refusal this file invented.
 *
 * Owned by regulatory.
 */
import { randomBytes } from 'node:crypto'
import type { Actor, Res } from '../../actors'
import type { Ctx } from '../../stage'
import { docMatrix, type DocAction } from './doc-matrix'
import { pdf, sendFile, type PaperFile } from './paper-files'
import { askOf, answerWith, examineAt, firstSeat, workerOf } from './registration'
import { education } from './education'

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + n * DAY)

/** The kinds, as the matrix names them: the founder's six first. */
export const KIND = {
  RTW: 'Proof of right to work',
  I9: 'I-9 and E-Verify',
  BG: 'Background check',
  NDA: 'Signed NDA and confidentiality undertaking',
  DRUG: 'Drug screening',
  GS: 'Certificate of good standing',
  W9: 'W-9',
  GL: 'Certificate of general liability insurance',
  LIC: 'Professional license',
  CONSENT: 'Background check authorization',
  NCA: 'Non-compete agreement',
  SET: 'A line’s required set',
} as const

const ATTACH: DocAction = 'attach a file'
const SIGN: DocAction = 'sign or countersign'
const FILL: DocAction = 'fill a form from fields'

/** The placement the cases stand on. */
interface Subject {
  lineId: string
  personId: string
  personName: string
  supplier: { id: string; slug: string; name: string }
  client: { id: string; slug: string; name: string }
  worker: Actor
  /** The employer's seat that keeps its people's papers. */
  hr: Actor
  /** The client's seat that asks for and examines papers. */
  clientSeat: Actor
  /** The supplier's seat that answers for the firm. */
  supplierSeat: Actor
}

/** A refusal the case expects, counted in the matrix and in the run's own table of rules. */
async function no(
  ctx: Ctx, kind: string, action: DocAction, seat: Actor,
  call: (a: Actor) => Promise<Res>, phrase: string | RegExp, rule: string
): Promise<Res> {
  const res = await ctx.expectRefusal(seat, call, phrase)
  docMatrix.refused(kind, action, res, phrase, rule)
  return res
}

/** A file of the wrong kind: bytes nobody checking a paper can open. */
function wrongKind(name: string): PaperFile {
  return { name, type: 'application/x-msdownload', bytes: Buffer.concat([Buffer.from('MZ'), randomBytes(2048)]) }
}

/** A PDF past the ten megabyte limit. */
function tooLarge(name: string): PaperFile {
  const head = pdf(name, 'Scanned certificate', ['Scanned at the highest resolution the copier offers.']).bytes
  return { name, type: 'application/pdf', bytes: Buffer.concat([head, Buffer.alloc(Math.ceil(10.5 * 1024 * 1024), 0x20)]) }
}

/** One placement this run started whose worker, employer and client all have seats. */
async function findSubject(ctx: Ctx): Promise<{ s: Subject | null; other: Actor | null; otherPerson: { personId: string; personName: string } | null }> {
  const started = ctx.world.contracts.filter((c) => c.side === 'SELL').map((c) => c.id)
  const rows = await ctx.read.sellContract.findMany({
    where: { state: 'IN_PROGRESS', ...(started.length ? { id: { in: started } } : {}) },
    select: {
      id: true, personId: true,
      person: { select: { name: true, primaryEmail: true } },
      company: { select: { id: true, slug: true, name: true } },
      clientCompany: { select: { id: true, slug: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  // A line nobody sells to below, so the firm on it is the one the worker answers to.
  const below = new Set(
    (await ctx.read.sellContract.findMany({
      where: { personId: { in: rows.map((r) => r.personId) }, state: { notIn: ['ENDED', 'CANCELLED'] } },
      select: { personId: true, clientCompanyId: true },
    })).map((r) => `${r.personId}:${r.clientCompanyId}`)
  )
  let s: Subject | null = null
  let other: Actor | null = null
  let otherPerson: { personId: string; personName: string } | null = null
  for (const r of rows) {
    if (!ctx.world.companies[r.company.slug] || !ctx.world.companies[r.clientCompany.slug]) continue
    if (below.has(`${r.personId}:${r.company.id}`)) continue
    const worker = workerOf(ctx, r.person.primaryEmail)
    if (!worker) continue
    if (!s) {
      const hr = firstSeat(ctx, r.company.slug, ['hr', 'compliance', 'owner'])
      const clientSeat = firstSeat(ctx, r.clientCompany.slug, ['compliance', 'programme', 'owner'])
      const supplierSeat = firstSeat(ctx, r.company.slug, ['compliance', 'hr', 'owner'])
      if (!hr || !clientSeat || !supplierSeat) continue
      s = { lineId: r.id, personId: r.personId, personName: r.person.name, supplier: r.company, client: r.clientCompany, worker, hr, clientSeat, supplierSeat }
      continue
    }
    if (r.personId !== s.personId) { other = worker; otherPerson = { personId: r.personId, personName: r.person.name }; break }
  }
  return { s, other, otherPerson }
}

// ── 1. Proof of right to work ─────────────────────────────────────────

async function rightToWork(ctx: Ctx, s: Subject, other: Actor | null): Promise<void> {
  const id = await askOf('hiring', s.hr, 'Proof of right to work', 'CANDIDATE', false, 'PERSON', s.personId)
  if (!id) return docMatrix.skipped(`${s.supplier.name} could not ask ${s.personName} for proof of right to work`)
  const undated = pdf(`${s.personId}-right-to-work.pdf`, 'Employment authorization', [`${s.personName}.`, 'No expiry date is printed on this page.'])
  const sent = await answerWith(ctx, 'hiring', s.worker, id, undated, false)
  docMatrix.took(KIND.RTW, ATTACH, sent, 'the worker sends the file from her own seat')

  // A paper with nobody's name on the ask is not hers to answer.
  if (other) {
    await no(ctx, KIND.RTW, ATTACH, other,
      (a) => sendFile(ctx, a, `/api/documents/${id}/upload`, pdf('someone-else.pdf', 'Employment authorization', ['Somebody else’s paper.'])),
      /is not here|was not asked of you/, 'a paper attached by somebody it was not asked of')
  } else docMatrix.skipped('a second worker with a seat, to attach a paper that was not asked of her')

  // The first upload has no date printed on it: it cannot be accepted, and it is sent back.
  await no(ctx, KIND.RTW, ATTACH, s.hr, (a) => a.post(`/api/documents/${id}/examine`, { verdict: 'ACCEPT' }),
    'cannot be accepted without the date printed on it', 'a paper that runs out, accepted with no date printed on it')
  const reason = 'No date printed on it. Send the page that shows the day it runs out.'
  docMatrix.sentBack(KIND.RTW, ATTACH, await examineAt('hiring', s.hr, id, { verdict: 'SEND_BACK', reason }), reason)

  // The second prints its expiry, 31 December 2028, and is accepted.
  const dated = pdf(`${s.personId}-right-to-work-2.pdf`, 'Employment authorization', [`${s.personName}.`, 'Valid until 12/31/2028.'])
  const again = await answerWith(ctx, 'hiring', s.worker, id, dated, false)
  if (again.ok) {
    docMatrix.took(KIND.RTW, ATTACH, await examineAt('hiring', s.hr, id, { verdict: 'ACCEPT', expiresAt: '2028-12-31' }),
      'sent back, answered again with 31 December 2028 printed on it, and accepted')
  }

  // What HR examined, recorded from its fields: the record the start reads.
  await no(ctx, KIND.RTW, FILL, s.hr,
    (a) => a.post('/api/compliance/verifications', { contractId: s.lineId, about: 'PERSON', type: 'RIGHT_TO_WORK', issuer: 'U.S. Citizenship and Immigration Services' }),
    'cannot go on file without the date printed on it', 'proof of right to work recorded with no expiry')
  const recorded = await s.hr.post('/api/compliance/verifications', {
    contractId: s.lineId, about: 'PERSON', type: 'RIGHT_TO_WORK', issuer: 'U.S. Citizenship and Immigration Services', expiresAt: '2028-12-31',
  })
  if (docMatrix.took(KIND.RTW, FILL, recorded, 'recorded from what HR examined, good until Dec 31, 2028')) {
    const onRecord = await ctx.read.verification.findFirst({
      where: { personId: s.personId, type: 'RIGHT_TO_WORK', status: 'CLEAR', expiresAt: new Date('2028-12-31T00:00:00Z') },
      select: { id: true },
    })
    if (onRecord) docMatrix.took(KIND.RTW, FILL, { ok: true, status: 200, sentence: null }, 'the start reads it: the check is on the person’s record, good until Dec 31, 2028')
    else docMatrix.finding(KIND.RTW, 'recorded, but no check good until Dec 31, 2028 is on the person’s record for the start to read', 'regulatory')
  }
}

// ── 2. I-9 and E-Verify ───────────────────────────────────────────────

async function i9(ctx: Ctx, s: Subject): Promise<void> {
  const passport = { type: 'PASSPORT', issuer: 'U.S. Department of State', expiresAt: iso(plusDays(1500)) }
  const post = (a: Actor, body: Record<string, unknown>) =>
    a.post('/api/compliance/verifications', { contractId: s.lineId, about: 'PERSON', type: 'I9_EVERIFY', ...body })

  docMatrix.took(KIND.I9, FILL, await post(s.hr, { formEdition: '01/20/25', evidence: [passport] }),
    'the employer records its own W2’s I-9 on the current edition, 01/20/25, completed from a passport')
  const typed = await post(s.hr, { formEdition: 'Rev. 01/20/25', evidence: [passport] })
  if (typed.ok && !/01\/20\/25 edition|already on file/.test(String(typed.json?.data?.says ?? ''))) {
    docMatrix.finding(KIND.I9, `“Rev. 01/20/25” was taken but not read as the 01/20/25 edition: “${typed.json?.data?.says}”`, 'regulatory')
  } else docMatrix.took(KIND.I9, FILL, typed, 'typed as “Rev. 01/20/25”, read the way the issuer prints it, 01/20/25')
  await no(ctx, KIND.I9, FILL, s.hr, (a) => post(a, { formEdition: 'Rev. March 2024', evidence: [passport] }),
    'is not an edition of the I-9', 'an edition the issuer never printed is not taken as current')
  await no(ctx, KIND.I9, FILL, s.hr, (a) => post(a, { formEdition: '01/20/25' }),
    'Say which document', 'an I-9 with no right-to-work document named behind it')
  // The client never completes the employer's I-9.
  await no(ctx, KIND.I9, FILL, s.clientSeat, (a) => post(a, { formEdition: '01/20/25', evidence: [passport] }),
    /firm that employs or places them|completes the I-9/, 'the client completing the employer’s I-9')

  // A sub-vendor's own W2, sold on through a prime: the prime is refused, the employer records it.
  const chain = await chainWithEmployer(ctx)
  if (!chain) {
    docMatrix.skipped('nobody in this world is employed, on the record, by a firm below a prime, so the prime’s refusal was not tried')
    return
  }
  const prime = firstSeat(ctx, chain.prime.slug, ['hr', 'compliance', 'owner'])
  const employer = firstSeat(ctx, chain.employer.slug, ['hr', 'compliance', 'owner'])
  if (!prime || !employer) return docMatrix.skipped(`a seat at ${chain.prime.name} and at ${chain.employer.name}`)
  const at = (a: Actor, lineId: string) =>
    a.post('/api/compliance/verifications', { contractId: lineId, about: 'PERSON', type: 'I9_EVERIFY', formEdition: '01/20/25', evidence: [passport] })
  await no(ctx, KIND.I9, FILL, prime, (a) => at(a, chain.topLineId), `${chain.employer.name} employs`,
    'a prime completing a sub-vendor’s W2’s I-9')
  docMatrix.took(KIND.I9, FILL, await at(employer, chain.topLineId),
    `${chain.employer.name}, the employer, records ${chain.personName}’s I-9 from the line at the top of the chain`)
}

/** A person on two lines where the record says the lower firm employs them. */
async function chainWithEmployer(ctx: Ctx): Promise<{
  personName: string; topLineId: string
  prime: { slug: string; name: string }; employer: { slug: string; name: string }
} | null> {
  const lines = await ctx.read.sellContract.findMany({
    where: { state: { notIn: ['ENDED', 'CANCELLED'] }, company: { slug: { in: Object.keys(ctx.world.companies) } } },
    select: { id: true, personId: true, companyId: true, clientCompanyId: true, person: { select: { name: true } }, company: { select: { slug: true, name: true } } },
    take: 2000,
  })
  const byPerson = new Map<string, typeof lines>()
  for (const l of lines) byPerson.set(l.personId, [...(byPerson.get(l.personId) ?? []), l])
  for (const [personId, ls] of byPerson) {
    if (ls.length < 2) continue
    for (const top of ls) {
      const sub = ls.find((l) => l.clientCompanyId === top.companyId)
      if (!sub) continue
      const seat = await ctx.read.context.findFirst({ where: { personId, companyId: sub.companyId, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } })
      if (seat) return { personName: top.person.name, topLineId: top.id, prime: top.company, employer: sub.company }
    }
  }
  return null
}

// ── 3 and 5. A screening company's verdict ────────────────────────────

async function verdict(ctx: Ctx, s: Subject, kind: string, type: 'BACKGROUND_CHECK' | 'DRUG_SCREENING', provider: string, says: string): Promise<void> {
  const ref = `${type === 'BACKGROUND_CHECK' ? 'BG' : 'DS'}-${randomBytes(3).toString('hex').toUpperCase()}`
  const post = (a: Actor, body: Record<string, unknown>) =>
    a.post('/api/compliance/verifications', { contractId: s.lineId, about: 'PERSON', type, provider, outcome: 'CLEAR', providerSays: says, ...body })
  docMatrix.took(kind, FILL, await post(s.hr, { reference: ref, renderedOn: '2026-11-01', expiresAt: '2027-11-01' }),
    `${provider}’s verdict recorded verbatim, reference ${ref}, reported Nov 1, 2026, good until Nov 1, 2027`)
  await no(ctx, kind, FILL, s.hr, (a) => post(a, { renderedOn: '2026-11-01' }), `Give ${provider}’s reference`, 'a provider’s verdict with no reference')
  await no(ctx, kind, FILL, s.hr, (a) => post(a, { reference: ref }), `Give the day ${provider} reported`, 'a provider’s verdict with no date')
  if (type === 'BACKGROUND_CHECK') {
    await no(ctx, kind, ATTACH, s.worker, (a) => a.post('/api/me/papers', { documentTypeKey: 'BACKGROUND_CHECK' }),
      'is not a document you hold', 'a worker sending the report herself')
  }
}

// ── 4. The signed NDA and confidentiality undertaking ─────────────────

async function nda(ctx: Ctx, s: Subject): Promise<void> {
  const id = await askOf('hiring', s.clientSeat, 'Non-disclosure agreement', 'CANDIDATE', true, 'PERSON', s.personId)
  if (!id) return docMatrix.skipped(`${s.client.name} could not ask ${s.personName} for its non-disclosure agreement`)
  const dates = { validFrom: '2026-11-01', expiresAt: '2028-11-01' }
  const file = (n: number) => pdf(`${s.personId}-nda-${n}.pdf`, 'Non-disclosure agreement and confidentiality undertaking',
    [`Between ${s.client.name} and ${s.personName}.`, 'Dated November 1, 2026.'])

  await no(ctx, KIND.NDA, SIGN, s.clientSeat, (a) => a.post(`/api/documents/${id}/examine`, { verdict: 'ACCEPT', ...dates }),
    'has not arrived yet', 'a countersignature before the worker signed')
  await no(ctx, KIND.NDA, SIGN, s.supplierSeat, (a) => sendFile(ctx, a, `/api/documents/${id}/sign`, file(0), { attests: 'true' }),
    /is not here|not asked of you|Only /, 'the client’s NDA signed from the supplier’s seat instead of the worker’s')
  const signed = await answerWith(ctx, 'hiring', s.worker, id, file(1), true)
  if (!docMatrix.took(KIND.NDA, SIGN, signed, 'signed by the worker, dated Nov 1, 2026')) return
  await no(ctx, KIND.NDA, SIGN, s.worker, (a) => sendFile(ctx, a, `/api/documents/${id}/sign`, file(2), { attests: 'true' }),
    'is already on file', 'signing the same paper twice')
  const counter = await examineAt('hiring', s.clientSeat, id, { verdict: 'ACCEPT', ...dates })
  if (counter.ok && counter.json?.data?.countersigned !== true) {
    docMatrix.finding(KIND.NDA, 'accepted, but the route did not countersign an agreement both sides sign', 'regulatory')
  }
  docMatrix.took(KIND.NDA, SIGN, counter, `countersigned for ${s.client.name}, Nov 1, 2026 to Nov 1, 2028`)
}

// ── 6. A supplier's certificate, examined by the client ───────────────

/** Ask the supplier for a paper about itself and have it answered; the request's id. */
async function askFirm(ctx: Ctx, s: Subject, name: string, file: PaperFile): Promise<string | null> {
  const id = await askOf('hiring', s.clientSeat, name, 'VENDOR', false, 'COMPANY', s.supplier.id)
  if (!id) return null
  const sent = await answerWith(ctx, 'hiring', s.supplierSeat, id, file, false)
  return sent.ok ? id : null
}

async function goodStanding(ctx: Ctx, s: Subject): Promise<void> {
  const cert = (n: number) => pdf(`${s.supplier.slug}-good-standing-${n}.pdf`, 'Certificate of good standing',
    [`${s.supplier.name} is in good standing.`, 'Issued October 15, 2026.'])
  const id = await askFirm(ctx, s, 'Certificate of good standing', cert(0))
  if (!id) return docMatrix.skipped(`${s.client.name} could not ask ${s.supplier.name} for its certificate of good standing`)
  await no(ctx, KIND.GS, ATTACH, s.clientSeat,
    (a) => a.post(`/api/documents/${id}/examine`, { verdict: 'ACCEPT', validFrom: '2025-10-15', expiresAt: '2026-10-15' }),
    'ran out on', 'a certificate already lapsed')
  const accepted = await examineAt('hiring', s.clientSeat, id, { verdict: 'ACCEPT', validFrom: '2026-10-15', expiresAt: '2027-10-15' })
  if (docMatrix.took(KIND.GS, ATTACH, accepted, `issued Oct 15, 2026, accepted by ${s.client.name} onto ${s.supplier.name}’s standing`)) {
    const standing = await ctx.read.verification.findFirst({
      where: { companyId: s.supplier.id, personId: null, type: 'GOOD_STANDING', status: 'CLEAR', expiresAt: { gt: new Date() }, validFrom: { lte: new Date() } },
      select: { id: true },
    })
    if (standing) docMatrix.took(KIND.GS, ATTACH, { ok: true, status: 200, sentence: null }, 'the start’s good standing item reads it the same day: the certificate is on the supplier’s record')
    else docMatrix.finding(KIND.GS, 'accepted, but no current certificate of good standing is on the supplier’s record for the start to read', 'regulatory')
  }
  // One that begins after the placement starts is taken as a fact and holds nothing until it begins.
  const later = await askFirm(ctx, s, 'Certificate of good standing', cert(1))
  if (!later) return docMatrix.skipped('a second certificate of good standing request')
  const begins = await s.clientSeat.post(`/api/documents/${later}/examine`, { verdict: 'ACCEPT', validFrom: iso(plusDays(30)), expiresAt: iso(plusDays(395)) })
  docMatrix.held(KIND.GS, ATTACH, begins.ok ? String(begins.json?.data?.says ?? '') : begins.sentence, begins.ok,
    'a certificate whose cover begins after the placement starts', /does not start until|covers nobody/)
}

// ── The rest: W-9, insurance, a license, the consent, a waiver, the sets ──

async function w9(ctx: Ctx, s: Subject): Promise<void> {
  const id = await askOf('hiring', s.clientSeat, 'W-9', 'VENDOR', false, 'COMPANY', s.supplier.id)
  if (!id) return docMatrix.skipped(`${s.client.name} could not ask ${s.supplier.name} for its W-9`)
  await no(ctx, KIND.W9, ATTACH, s.supplierSeat, (a) => sendFile(ctx, a, `/api/documents/${id}/upload`, wrongKind('w-9.exe')),
    'A PDF, a photograph or a Word document', 'a file of a kind nobody checking it can open')
  await no(ctx, KIND.W9, ATTACH, s.supplierSeat, (a) => sendFile(ctx, a, `/api/documents/${id}/upload`, tooLarge('w-9-scan.pdf')),
    'ten is the limit', 'a file over ten megabytes')
  const sent = await answerWith(ctx, 'hiring', s.supplierSeat, id, pdf(`${s.supplier.slug}-w9.pdf`, 'Form W-9', [`${s.supplier.name}.`, 'Rev. March 2024.']), false)
  if (!docMatrix.took(KIND.W9, ATTACH, sent, 'a PDF the supplier sends')) return
  await no(ctx, KIND.W9, FILL, s.clientSeat, (a) => a.post(`/api/documents/${id}/examine`, { verdict: 'ACCEPT' }),
    'Say which edition', 'a W-9 accepted with no edition')
  docMatrix.took(KIND.W9, FILL, await examineAt('hiring', s.clientSeat, id, { verdict: 'ACCEPT', edition: 'Rev. March 2024' }),
    'accepted on the edition the IRS prints, Rev. March 2024')
}

async function insurance(ctx: Ctx, s: Subject): Promise<void> {
  const id = await askFirm(ctx, s, 'Certificate of general liability insurance',
    pdf(`${s.supplier.slug}-gl.pdf`, 'Certificate of liability insurance', [`Insured: ${s.supplier.name}.`]))
  if (!id) return docMatrix.skipped(`${s.client.name} could not ask ${s.supplier.name} for its general liability certificate`)
  await no(ctx, KIND.GL, FILL, s.clientSeat, (a) => a.post(`/api/documents/${id}/examine`, { verdict: 'ACCEPT', expiresAt: iso(plusDays(300)) }),
    'Give the day', 'a certificate accepted with its start date missing')
  await no(ctx, KIND.GL, ATTACH, s.clientSeat,
    (a) => a.post(`/api/documents/${id}/examine`, { verdict: 'ACCEPT', validFrom: iso(plusDays(-400)), expiresAt: iso(plusDays(-35)) }),
    'ran out on', 'a lapsed certificate')
  docMatrix.took(KIND.GL, ATTACH, await examineAt('hiring', s.clientSeat, id, { verdict: 'ACCEPT', validFrom: iso(plusDays(-30)), expiresAt: iso(plusDays(335)) }),
    'a lapsed certificate renewed: the current one accepted onto the supplier’s standing')
}

async function license(ctx: Ctx, s: Subject): Promise<void> {
  const post = (a: Actor, body: Record<string, unknown>) =>
    a.post('/api/compliance/verifications', { contractId: s.lineId, about: 'PERSON', type: 'PROFESSIONAL_LICENSE', licenseNumber: `RN-${randomBytes(3).toString('hex').toUpperCase()}`, licenseState: 'OR', ...body })
  await no(ctx, KIND.LIC, FILL, s.hr, (a) => post(a, { expiresAt: iso(plusDays(400)) }), 'Say which board issued the license', 'a license with no issuer')
  const past = await post(s.hr, { issuer: 'Oregon State Board of Nursing', expiresAt: iso(plusDays(-20)) })
  docMatrix.held(KIND.LIC, FILL, past.ok ? String(past.json?.data?.says ?? '') : past.sentence, past.ok,
    'a license filled with an expiry already past', 'holds nothing until a renewal is on file')
  docMatrix.took(KIND.LIC, FILL, await post(s.hr, { issuer: 'Oregon State Board of Nursing', expiresAt: iso(plusDays(500)) }),
    'a license with its board, number, state and a date ahead')
}

async function consent(ctx: Ctx, s: Subject): Promise<void> {
  const id = await askOf('hiring', s.hr, 'Background check authorization', 'CANDIDATE', true, 'PERSON', s.personId)
  if (!id) return docMatrix.skipped(`${s.supplier.name} could not ask ${s.personName} for the background check authorization`)
  await no(ctx, KIND.CONSENT, SIGN, s.hr, (a) => a.post(`/api/documents/${id}/sign`, { attests: true }),
    'Attach the signed copy', 'the authorization signed by the firm instead of the worker')
  docMatrix.took(KIND.CONSENT, SIGN,
    await answerWith(ctx, 'hiring', s.worker, id, pdf(`${s.personId}-authorization.pdf`, 'Background check disclosure and authorization', [`Signed by ${s.personName}.`]), true),
    'signed by the worker from her own seat')
  docMatrix.finding(KIND.CONSENT,
    'the firm may still record a "signed copy" of the worker’s authorization with any file attached; nothing tells a copy the worker signed from one the firm made',
    'regulatory')
}

async function waiver(ctx: Ctx, s: Subject): Promise<void> {
  await no(ctx, KIND.SET, FILL, s.clientSeat,
    (a) => a.post('/api/documents/requirements', { sellContractId: s.lineId, documentTypeKey: 'NDA', waivedReason: '   ' }),
    'one with no reason is not a waiver', 'a waiver with a blank reason')
}

/** The sets read, not pressed: a void non-compete, and a corp-to-corp worker’s own set. */
async function sets(ctx: Ctx): Promise<string[]> {
  const out: string[] = []
  const voidLine = await ctx.read.sellContract.findFirst({
    where: {
      state: { notIn: ['ENDED', 'CANCELLED'] },
      company: { slug: { in: Object.keys(ctx.world.companies) } },
      workLocation: { state: { in: ['CA', 'MN', 'ND', 'OK', 'California', 'Minnesota', 'North Dakota', 'Oklahoma'] } },
    },
    select: { id: true, workLocation: { select: { state: true } }, clientCompany: { select: { slug: true } } },
  })
  const seat = voidLine ? firstSeat(ctx, voidLine.clientCompany.slug, ['compliance', 'programme', 'owner']) : null
  if (voidLine && seat) {
    const res = await seat.get(`/api/documents/requirements?sellContractId=${voidLine.id}`)
    const items = (res.json?.data?.items ?? []) as { key?: string; documentTypeKey?: string; waived?: boolean; required?: boolean }[]
    const nca = items.find((i) => (i.key ?? i.documentTypeKey) === 'NCA')
    if (res.ok && (!nca || nca.waived || nca.required === false)) {
      docMatrix.took(KIND.NCA, SIGN, res, `not asked at a site in ${voidLine.workLocation?.state}, where the state voids one for workers`)
    } else if (res.ok) {
      docMatrix.finding(KIND.NCA, `a non-compete is still asked at a site in ${voidLine.workLocation?.state}, which voids one for workers`, 'regulatory')
    }
  } else docMatrix.skipped('a running line at a site in California, Minnesota, North Dakota or Oklahoma, to read the non-compete as not asked')

  const c2c = await ctx.read.buyContract.findFirst({
    where: { contractType: 'C2C', state: { notIn: ['ENDED', 'CANCELLED'] }, company: { slug: { in: Object.keys(ctx.world.companies) } } },
    select: { id: true, company: { select: { slug: true } } },
  })
  const firm = c2c ? firstSeat(ctx, c2c.company.slug, ['compliance', 'hr', 'contracts', 'owner']) : null
  if (c2c && firm) {
    const res = await firm.get(`/api/documents/requirements?buyContractId=${c2c.id}`)
    const items = (res.json?.data?.items ?? []) as { label?: string; owedBy?: string }[]
    const hers = items.filter((i) => i.owedBy === 'WORKER' || i.owedBy === 'SUPPLIER').map((i) => i.label).filter(Boolean)
    if (res.ok) docMatrix.took(KIND.SET, FILL, res, `a corp-to-corp worker chased against her own line’s set: ${hers.slice(0, 5).join(', ') || 'nothing owed by her'}`)
    out.push(`Corp-to-corp line read: ${hers.length} papers owed by the worker or her firm.`)
  } else docMatrix.skipped('a running corp-to-corp buy line, to read the worker’s own set')
  return out
}

/** Every case, once. Never throws: a case that fails is a line in the report. */
export async function bothWays(ctx: Ctx): Promise<string> {
  const { s, other, otherPerson } = await findSubject(ctx)
  if (!s) {
    docMatrix.skipped('no running placement this run had a worker, an employer and a client all with seats')
    return 'The document matrix found no placement to stand on.'
  }
  const cases: [string, () => Promise<unknown>][] = [
    ['proof of right to work', () => rightToWork(ctx, s, other)],
    ['the I-9', () => i9(ctx, s)],
    ['the background check', () => verdict(ctx, s, KIND.BG, 'BACKGROUND_CHECK', 'Sterling', 'Clear. No records found in the searches ordered.')],
    ['the NDA', () => nda(ctx, s)],
    ['the drug screen', () => verdict(ctx, s, KIND.DRUG, 'DRUG_SCREENING', 'Quest Diagnostics', 'Negative on the ten-panel screen.')],
    ['good standing', () => goodStanding(ctx, s)],
    ['the W-9', () => w9(ctx, s)],
    ['insurance', () => insurance(ctx, s)],
    ['the license', () => license(ctx, s)],
    ['the authorization', () => consent(ctx, s)],
    ['the waiver', () => waiver(ctx, s)],
    ['the sets', () => sets(ctx)],
    ['education', () => education(ctx, s, other && otherPerson ? { actor: other, ...otherPerson } : null)],
  ]
  for (const [name, run] of cases) {
    try {
      await run()
    } catch (e: any) {
      docMatrix.skipped(`${name}: the case stopped on “${String(e?.message ?? e)}”`)
    }
  }
  return `The document matrix stood on ${s.personName}’s placement at ${s.client.name} through ${s.supplier.name}.`
}
