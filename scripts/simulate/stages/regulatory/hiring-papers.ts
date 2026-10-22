/**
 * The papers of the hire that paperwork-and-start did not yet ask for.
 * Owned by regulatory.
 *
 * The founder's list for hiring, 2026-10-22: the I-9 completed from a
 * named document, the visa, the I-94 and the work permit where they
 * apply, the background-check disclosure and consent, the provider's
 * verdict, the drug screen, the employment or sub-vendor agreement, the
 * NDA and the non-compete. The I-9, the consent, the verdict and the NDA
 * were already walked by paperwork-and-start; this adds the rest, each
 * asked, answered from the person's or the firm's own seat, and examined
 * or recorded, through the real routes.
 *
 * Who holds a visa or a work permit is dealt by the person's id, so the
 * same person is on the same status every run: one in six on a work
 * permit (EAD), one in six on a visa with its I-94. The rest show a
 * passport. A work permit runs out six weeks after the placement's last
 * day, which is what the extension station meets later: an extension of
 * three months past a permit that ends in six weeks is refused.
 */
import type { Actor } from '../../actors'
import type { Ctx } from '../../stage'
import { pdf, photo } from './paper-files'
import { askOf, answerWith, walkPaper } from './registration'
import { tally } from './stage-tally'
import { nonCompeteVoidAt } from '@/lib/document-stages'

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + n * DAY)
const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export interface HirePlacement {
  id: string
  personId: string
  personName: string
  supplier: { id: string; slug: string; name: string }
  client: { id: string; slug: string; name: string }
  endDate: Date | null
}

export type Status = 'PASSPORT' | 'WORK_PERMIT' | 'VISA'

/** Who shows what, stable per person. Pure. */
export function statusOf(personId: string): Status {
  const n = hashOf(personId) % 6
  return n === 0 ? 'WORK_PERMIT' : n === 1 ? 'VISA' : 'PASSPORT'
}

/** The day a work permit runs out: six weeks after the placement's last day, never sooner than ten weeks from today. Pure. */
export function permitEnds(endDate: Date | null, on: Date = new Date()): Date {
  const last = endDate ?? new Date(on.getTime() + 180 * DAY)
  const six = new Date(last.getTime() + 42 * DAY)
  const floor = new Date(on.getTime() + 70 * DAY)
  return six > floor ? six : floor
}

/** The evidence an I-9 is completed from, for this person: what they showed. */
export interface I9Evidence {
  type: Status
  issuer: string
  expiresAt: Date
}

/**
 * The visa, the I-94 and the work permit, where they apply: HR asks, the
 * worker sends a picture from her own page, HR looks and accepts it with
 * the date printed on it, and records it on her file. Returns the
 * evidence the I-9 is completed from.
 */
export async function statusPapers(ctx: Ctx, hr: Actor, worker: Actor | null, p: HirePlacement): Promise<I9Evidence> {
  const status = statusOf(p.personId)
  const passport: I9Evidence = { type: 'PASSPORT', issuer: 'U.S. Department of State', expiresAt: plusDays(900 + (hashOf(p.personId) % 2400)) }
  if (status === 'PASSPORT' || !worker) return passport
  const slug = slugOf(p.personName)
  const papersFor: { name: string; key: 'WORK_PERMIT' | 'VISA' | 'I94'; expiresAt: Date; issuer: string }[] =
    status === 'WORK_PERMIT'
      ? [{ name: 'Work permit (EAD)', key: 'WORK_PERMIT', expiresAt: permitEnds(p.endDate), issuer: 'U.S. Citizenship and Immigration Services' }]
      : [
          { name: 'Visa', key: 'VISA', expiresAt: plusDays(700 + (hashOf(p.personId) % 300)), issuer: 'U.S. Department of State' },
          { name: 'I-94 record', key: 'I94', expiresAt: plusDays(690 + (hashOf(p.personId) % 300)), issuer: 'U.S. Customs and Border Protection' },
        ]
  tally.names('hiring', 'visa, I-94 and work permit where they apply', 'the worker')
  for (const paper of papersFor) {
    const walked = await walkPaper(ctx, 'hiring', {
      asker: hr, answerer: worker, name: paper.name, audience: 'CANDIDATE', sign: false,
      subjectType: 'PERSON', subjectId: p.personId,
      file: () => photo(`${slug}-${slugOf(paper.name)}.png`),
      accept: { verdict: 'ACCEPT', expiresAt: iso(paper.expiresAt) },
    })
    if (!walked.ok) continue
    await hr.post('/api/compliance/verifications', {
      contractId: p.id, about: 'PERSON', type: paper.key, issuer: paper.issuer, expiresAt: iso(paper.expiresAt),
    })
  }
  const shown = papersFor[0]
  return { type: shown.key === 'I94' ? 'VISA' : (shown.key as Status), issuer: shown.issuer, expiresAt: shown.expiresAt }
}

/** The drug screen: her signed authorization, then the testing company's result, recorded as it wrote it. */
export async function drugScreen(ctx: Ctx, hr: Actor, compliance: Actor, worker: Actor | null, p: HirePlacement): Promise<boolean> {
  if (!worker) return false
  tally.names('hiring', 'drug screen authorization and the testing company’s result', 'the worker; the result from the provider')
  const id = await askOf('hiring', hr, 'Drug screening authorization', 'CANDIDATE', true, 'PERSON', p.personId)
  if (!id) return false
  const signed = await answerWith(ctx, 'hiring', worker, id, pdf(`${slugOf(p.personName)}-drug-screen-authorization.pdf`, 'Drug screening authorization', [
    `${p.supplier.name} may arrange a pre-placement drug screen for ${p.personName}.`, `Signed by ${p.personName} on ${iso(new Date())}.`,
  ]), true)
  if (!signed.ok) return false
  const lab = hashOf(p.id) % 2 ? 'Quest Diagnostics' : 'Labcorp'
  const verdict = await compliance.post('/api/compliance/verifications', {
    contractId: p.id, about: 'PERSON', type: 'DRUG_SCREENING', provider: lab,
    reference: `${lab.slice(0, 2).toUpperCase()}-${hashOf(p.id) % 1_000_000}`, renderedOn: iso(plusDays(-1)),
    outcome: 'CLEAR', providerSays: '10-panel urine screen. Negative for all substances tested.', consentDocumentId: id,
  })
  if (verdict.ok) tally.examined('hiring')
  return verdict.ok
}

/**
 * The employment agreement for a W2, or the agreement with the sub-vendor
 * below where there is one, and the non-compete for a W2. The firm raises
 * each; the person (or the sub-vendor) signs it from its own seat; the
 * firm accepts it with its dates, which countersigns where both sign.
 */
export async function agreements(ctx: Ctx, hr: Actor, contracts: Actor, worker: Actor | null, p: HirePlacement, index: number): Promise<number> {
  const line = await ctx.read.sellContract.findUnique({
    where: { id: p.id },
    select: {
      workLocation: { select: { country: true, state: true } },
      buyLinks: { select: { buyContract: { select: { contractType: true, vendorCompanyId: true, vendorCompany: { select: { slug: true, name: true } } } } } },
    },
  })
  const buy = line?.buyLinks[0]?.buyContract ?? null
  const until = iso(p.endDate ?? plusDays(365))
  let closed = 0
  if (buy?.vendorCompany) {
    tally.names('hiring', 'sub-vendor agreement', 'the sub-vendor')
    const sub = ctx.cast.at(buy.vendorCompany.slug, 'owner')
    if (sub) {
      const walked = await walkPaper(ctx, 'hiring', {
        asker: contracts, answerer: sub, name: 'Master service agreement', audience: 'VENDOR', sign: true,
        subjectType: 'COMPANY', subjectId: buy.vendorCompanyId!,
        file: (n) => pdf(`${buy.vendorCompany!.slug}-${p.supplier.slug}-msa${n ? `-${n}` : ''}.pdf`, 'Master service agreement', [`Between ${p.supplier.name} and ${buy.vendorCompany!.name}.`, `Signed for ${buy.vendorCompany!.name}.`]),
        accept: { verdict: 'ACCEPT', validFrom: iso(new Date()), expiresAt: iso(plusDays(3 * 365)) },
      })
      if (walked.ok) closed++
    }
  } else if (worker && (buy?.contractType ?? 'W2') === 'W2') {
    tally.names('hiring', 'employment agreement and non-compete', 'the worker')
    const slug = slugOf(p.personName)
    const emp = await walkPaper(ctx, 'hiring', {
      asker: hr, answerer: worker, name: 'Employment agreement', audience: 'CANDIDATE', sign: true,
      subjectType: 'PERSON', subjectId: p.personId,
      file: (n) => pdf(`${slug}-employment-agreement${n ? `-${n}` : ''}.pdf`, 'Employment agreement', [`Between ${p.supplier.name} and ${p.personName}.`, `For the placement at ${p.client.name}, to ${until}.`]),
      accept: { verdict: 'ACCEPT', validFrom: iso(new Date()), expiresAt: until },
      sendBack: index % 13 === 6 ? 'The start date on page one is not the agreed one. Sign the corrected copy.' : null,
    })
    if (emp.ok) closed++
    // Not asked where the site's state voids a non-compete for workers.
    if (nonCompeteVoidAt(line?.workLocation ?? null)) return closed
    const nca = await walkPaper(ctx, 'hiring', {
      asker: hr, answerer: worker, name: 'Non-compete agreement', audience: 'CANDIDATE', sign: true,
      subjectType: 'PERSON', subjectId: p.personId,
      file: () => pdf(`${slug}-non-compete.pdf`, 'Non-compete agreement', [`Between ${p.supplier.name} and ${p.personName}.`, 'Twelve months, the client’s own staffing roles only.']),
      accept: { verdict: 'ACCEPT', validFrom: iso(new Date()), expiresAt: iso(plusDays(365)) },
    })
    if (nca.ok) closed++
  }
  return closed
}
