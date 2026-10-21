/**
 * The generated world's people, written in steps.
 *
 * Every row's id is decided by `planPeople` before anything is written,
 * so each step reads what exists once per table and writes only what is
 * missing, in batches of at most `BATCH_ROWS` (kit `writeMissing`). A
 * second seeding finds every row and writes nothing; a step re-walked
 * after a deploy costs one read per table.
 *
 * The steps, in the order they must run (foreign keys decide it):
 *
 *   scale:people:persons                    Person, ConsultantProfile, Resume
 *   scale:people:own-companies:<k>-of-<n>   each one-person company, through the frame's `ensureSolo`
 *   scale:people:seats                      discipline roles, employee seats, their own seats
 *   scale:people:training                   the bench firms' courses, the freshers' enrollments
 *   scale:people:benches                    every listing, by the person's own yes; their own do-not-submit notes
 *   scale:people:careers                    ended lines: both contracts, the pay line, the link; no cycles
 *   scale:people:placements                 live lines the same way, a one-person company's paper with its prime,
 *                                           and an integrator's roll-off flags
 *
 * Nothing here writes a paper (regulatory), a job or a submission
 * (demand), an order header, a cycle or a rate card (money).
 */

import { Prisma } from '@prisma/client'
import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { stayFields } from '@/lib/bench-stay'
import { ownSeatGrantReason } from '@/lib/own-seat'
import { ensureSolo, roleKeyOf, type FrameStep } from '../frame'
import { agreementTermsFor, type AgreementTerms } from '../rates/pure'
import { jobIdForLine } from '../jobs/plan'
import { batch, idFor, minutesAfter, writeMissing } from '../kit'
import type { ScaleFrame, Share } from '../types'
import { planPeople, profileAuth, soloIdOf, type LinePlan, type PersonPlan } from './plan'

type WithId<T> = T & { id: string }

/** One-person companies made per step: each is a `createCompany`, about twenty queries. */
export const SOLOS_PER_STEP = 10

const DAY = 86_400_000
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const key = (p: PersonPlan, rest: string) => `person/${String(p.n).padStart(4, '0')}/${rest}`

/** The people's steps, in the order they must run. */
export function peopleSteps(frame?: ScaleFrame): FrameStep[] {
  const solos = frame ? planPeople(frame).filter((p) => p.facts.career === 'OWN_COMPANY').length : 160
  const shares = Math.max(1, Math.ceil(solos / SOLOS_PER_STEP))
  return [
    { name: 'scale:people:persons', run: seedPersons },
    ...Array.from({ length: shares }, (_, index): FrameStep => ({
      name: `scale:people:own-companies:${index + 1}-of-${shares}`, run: (f) => seedOwnCompanies(f, { index, of: shares }),
    })),
    { name: 'scale:people:seats', run: seedSeats },
    { name: 'scale:people:training', run: seedTraining },
    { name: 'scale:people:benches', run: seedBenches },
    { name: 'scale:people:careers', run: (f) => seedLines(f, false) },
    { name: 'scale:people:placements', run: (f) => seedLines(f, true) },
  ]
}

/**
 * The step that runs after the jobs (demand): every line points at the
 * filled job it came from (`jobIdForLine`). It cannot ride on the lines'
 * own insert, because the jobs are written after the people.
 */
export function peopleAfterJobsSteps(): FrameStep[] {
  return [{ name: 'scale:people:lines-to-jobs', run: seedLinesToJobs }]
}

/** The names of the people's steps, for `index.ts` to run after the frame's. */
export function peopleStepNames(frame?: ScaleFrame): string[] {
  return peopleSteps(frame).map((s) => s.name)
}

/**
 * Every person, in one call, or one share of the steps. Idempotent.
 * `share` cuts the list of steps, never a step: a step is the unit a
 * call either finishes or does not.
 */
export async function seedPeople(frame: ScaleFrame, share?: Share): Promise<void> {
  const steps = peopleSteps(frame)
  const from = share ? Math.floor((steps.length * share.index) / share.of) : 0
  const to = share ? Math.floor((steps.length * (share.index + 1)) / share.of) : steps.length
  for (const s of steps.slice(from, to)) await s.run(frame)
}

// ── Persons ───────────────────────────────────────────────────────────

/** The first day anything about them is on the record. */
function bornOnRecord(p: PersonPlan): Date {
  const dates = [
    ...p.lines.map((l) => l.start),
    ...p.listings.map((l) => l.invitedAt),
    ...(p.employment ? [p.employment.grantedAt] : []),
    ...(p.enrollment ? [p.enrollment.enrolledAt] : []),
    day(-30),
  ]
  return plus(new Date(Math.min(...dates.map((d) => d.getTime()))), -7)
}

async function seedPersons(frame: ScaleFrame): Promise<void> {
  const people = planPeople(frame)
  await writeMissing(db.person, people.map((p) => ({ id: p.facts.id, name: p.facts.name, primaryEmail: p.facts.email, createdAt: bornOnRecord(p) })))
  const profiles: WithId<Prisma.ConsultantProfileCreateManyInput>[] = people.map((p) => ({
    id: idFor(key(p, 'profile')),
    personId: p.facts.id,
    headline: p.headline,
    skills: p.facts.skills,
    location: p.location,
    country: p.facts.country,
    workAuth: profileAuth(p.facts.workAuth),
    rateFloor: p.rateFloor,
    availableFrom: p.availableFrom,
    visibility: 'VERIFIED',
    confirmedAt: p.confirmedAt,
  }))
  await writeMissing(db.consultantProfile, profiles)
  const resumes: WithId<Prisma.ResumeCreateManyInput>[] = people.map((p) => {
    const text = p.resume
    return {
      id: idFor(key(p, 'resume')),
      personId: p.facts.id,
      label: `${p.facts.role.title} ${day(0).getUTCFullYear()}`,
      fileName: `${p.facts.name.toLowerCase().replace(/[^a-z]+/g, '-')}-cv.txt`,
      contentType: 'text/plain',
      sizeBytes: Buffer.byteLength(text),
      storage: 'DB',
      bytes: Buffer.from(text, 'utf8'),
      textExtract: text,
      uploadedByCompanyId: p.listings.find((l) => l.state === 'GRANTED' && !l.revokedAt)?.firmId ?? p.employment?.firmId ?? null,
      // While this is the current one: the unique on (personId, currentKey).
      currentKey: p.facts.id,
      createdAt: plus(bornOnRecord(p), 1),
    }
  })
  await writeMissing(db.resume, resumes)
}

// ── One-person companies ──────────────────────────────────────────────

async function seedOwnCompanies(frame: ScaleFrame, share: Share): Promise<void> {
  const solos = planPeople(frame).filter((p) => p.facts.career === 'OWN_COMPANY')
  const from = Math.floor((solos.length * share.index) / share.of)
  const to = Math.floor((solos.length * (share.index + 1)) / share.of)
  const mine = solos.slice(from, to)
  const have = new Set((await db.company.findMany({ where: { id: { in: mine.map((p) => soloIdOf(p.facts.id)) } }, select: { id: true } })).map((c) => c.id))
  for (const p of mine) {
    if (have.has(soloIdOf(p.facts.id))) continue
    const made = await ensureSolo(frame, p.facts.id, p.facts.name)
    if (made.id !== soloIdOf(p.facts.id)) throw new Error(`${p.facts.name}'s own company came back under another id.`)
  }
}

// ── Seats ─────────────────────────────────────────────────────────────

/**
 * An integrator's engineer or a client's permanent analyst sits in a role
 * named for what they do, which reads their own work and files their own
 * week and nothing else: they staff nobody and see no money.
 */
const DISCIPLINE_PERMISSIONS = ['assignments.read', 'timesheets.read']

async function seedSeats(frame: ScaleFrame): Promise<void> {
  const people = planPeople(frame)
  const employed = people.filter((p) => p.employment)
  const firms = [...new Set(employed.map((p) => p.employment!.firmId))]
  const roles = await db.role.findMany({ where: { companyId: { in: firms } }, select: { id: true, companyId: true, name: true } })
  const roleOf = new Map(roles.map((r) => [`${r.companyId}|${r.name}`, r.id]))
  const newRoles: WithId<Prisma.RoleCreateManyInput>[] = []
  for (const p of employed) {
    const title = p.facts.role.title
    if (roleKeyOf(title)) throw new Error(`"${title}" is a role a door opens; a discipline must not be.`)
    const k = `${p.employment!.firmId}|${title}`
    if (roleOf.has(k)) continue
    const id = idFor(`role/${p.employment!.firmId}/${title}`)
    roleOf.set(k, id)
    newRoles.push({ id, companyId: p.employment!.firmId, name: title, permissions: DISCIPLINE_PERMISSIONS, isDefault: false })
  }
  await writeMissing(db.role, newRoles)

  const contexts: WithId<Prisma.ContextCreateManyInput>[] = []
  for (const p of people) {
    if (p.employment) {
      const e = p.employment
      contexts.push({
        id: idFor(key(p, 'context/employee')), personId: p.facts.id, companyId: e.firmId,
        roleId: roleOf.get(`${e.firmId}|${p.facts.role.title}`)!, type: 'EMPLOYEE', side: e.side,
        grantedAt: e.grantedAt, grantReason: e.practice,
      })
    } else if (p.ownSeat) {
      const because = p.lines.length ? 'on a placement' : 'asked onto a bench'
      contexts.push({
        id: idFor(key(p, 'context/own')), personId: p.facts.id, type: 'CONSULTANT',
        grantedAt: plus(bornOnRecord(p), 1), grantReason: ownSeatGrantReason(because),
      })
    }
  }
  await writeMissing(db.context, contexts)
}

// ── Training ──────────────────────────────────────────────────────────

async function seedTraining(frame: ScaleFrame): Promise<void> {
  const people = planPeople(frame).filter((p) => p.enrollment)
  const benchFirms = [...new Set(people.map((p) => p.enrollment!.firmId))]
  const courses: WithId<Prisma.CourseCreateManyInput>[] = benchFirms.map((id) => {
    const firm = frame.byId.get(id)!
    const ind = frame.industries.find((i) => i.key === firm.industries[0])!
    const niche = ind.niches.find((n) => n.key === firm.niche) ?? ind.niches[0]
    return {
      id: idFor(`course/${id}`), companyId: id, title: niche.course.title,
      description: `${niche.label}: ${niche.skills.join(', ')}.`,
      category: firm.industries[0] === 'IT' ? 'TECH' : 'CERTIFICATION',
      duration: niche.course.hours, price: niche.course.priceCents, currency: 'USD', isPublic: true,
      createdAt: day(-400),
    }
  })
  await writeMissing(db.course, courses)
  await writeMissing(db.enrollment, people.map((p) => ({
    id: idFor(key(p, 'enrollment')), courseId: idFor(`course/${p.enrollment!.firmId}`), personId: p.facts.id,
    status: 'COMPLETED', enrolledAt: p.enrollment!.enrolledAt, completedAt: p.enrollment!.completedAt, score: p.enrollment!.score,
  })))
}

// ── Benches ───────────────────────────────────────────────────────────

async function seedBenches(frame: ScaleFrame): Promise<void> {
  const people = planPeople(frame)
  const profiles = await db.consultantProfile.findMany({ where: { personId: { in: people.map((p) => p.facts.id) } }, select: { id: true, personId: true } })
  const profileOf = new Map(profiles.map((x) => [x.personId, x.id]))
  const rows: WithId<Prisma.BenchListingCreateManyInput>[] = []
  for (const p of people) {
    const consultantId = profileOf.get(p.facts.id)
    if (!consultantId) throw new Error(`${p.facts.name} has no profile to list.`)
    for (const l of p.listings) {
      const stay = l.state === 'GRANTED' ? stayFields(l.stayDays, l.grantedAt) : { stayDays: null, staysUntil: null }
      rows.push({
        id: idFor(key(p, `listing/${l.firmId}`)), consultantId, companyId: l.firmId, tier: l.tier,
        rateMin: l.rate.minCents, rateMax: l.rate.maxCents, state: l.state,
        invitedAt: l.invitedAt, respondedAt: l.respondedAt, declinedNote: l.declinedNote,
        grantedAt: l.grantedAt, revokedAt: l.revokedAt, lapsedAt: l.lapsed ? l.revokedAt : null,
        askFirst: l.askFirst, showInMatches: l.showInMatches,
        stayDays: stay.stayDays, staysUntil: stay.staysUntil,
      })
    }
  }
  await writeMissing(db.benchListing, rows)
  await writeMissing(db.doNotSubmit, people.filter((p) => p.doNotSubmit).map((p) => ({
    id: idFor(key(p, 'do-not-submit')), personId: p.facts.id, companyId: p.doNotSubmit!,
    note: 'My own employer. Not going back through an agency.', createdAt: p.listings[0]?.grantedAt ?? day(-30),
  })))
}

// ── Lines ─────────────────────────────────────────────────────────────

/** The ids of one rung of one line. */
export function rungIds(p: Pick<PersonPlan, 'n'>, l: Pick<LinePlan, 'key'>, rung: number): { sell: string; buy: string; candidate: string; link: string } {
  const base = `person/${String(p.n).padStart(4, '0')}/line/${l.key}/rung/${rung}`
  return { sell: idFor(`${base}/sell`), buy: idFor(`${base}/buy`), candidate: idFor(`${base}/candidate`), link: idFor(`${base}/link`) }
}

/** A one-person company's paper with the prime it sells to: the frame's ids, made the frame's way. */
export const soloAgreementId = (solo: string, prime: string) => idFor(`agreement/${solo}/${prime}`)
const soloEngagementId = (solo: string, prime: string) => idFor(`engagement/${solo}/${prime}`)

/**
 * Lines as rows: per rung, the contract that bills the firm above, the
 * contract that pays the party below, the pay line for the person on it,
 * and the link between the two. The lowest rung pays the person by
 * payroll; a person's own one-person company has no pay line under it,
 * because the firm above pays it corp-to-corp. Ended lines carry no
 * cycles; a live line's order header and cycles are money's.
 */
async function seedLines(frame: ScaleFrame, live: boolean): Promise<void> {
  const people = planPeople(frame)
  const paper = new Map(frame.trades.filter((t) => t.agreementId).map((t) => [`${t.seller}|${t.buyer}`, t]))
  const sells: WithId<Prisma.SellContractCreateManyInput>[] = []
  const buys: WithId<Prisma.BuyContractCreateManyInput>[] = []
  const candidates: WithId<Prisma.BuyContractCandidateCreateManyInput>[] = []
  const links: WithId<Prisma.ContractLinkCreateManyInput>[] = []
  const ties: WithId<Prisma.CounterpartyCreateManyInput>[] = []
  const agreements: WithId<Prisma.MasterAgreementCreateManyInput>[] = []
  const engagements: WithId<Prisma.EngagementCreateManyInput>[] = []
  const releases: WithId<Prisma.ProjectReleaseCreateManyInput>[] = []

  for (const p of people) {
    for (const l of p.lines) {
      if (l.live !== live) continue
      const client = frame.byId.get(l.clientId)!
      const rungs = l.chain.length
      const state = live ? 'IN_PROGRESS' : 'ENDED'
      for (let r = 0; r < rungs; r++) {
        const seller = l.chain[r]
        const buyer = r === 0 ? l.clientId : l.chain[r - 1]
        const ids = rungIds(p, l, r)
        const bottom = r === rungs - 1
        const ownCompany = bottom && l.ownCompany
        let msaId: string | null = null
        let engagementId: string | null = null
        if (ownCompany) {
          msaId = soloAgreementId(seller, buyer)
          engagementId = soloEngagementId(seller, buyer)
          const since = plus(l.start, -14)
          ties.push(
            { id: idFor(`tie/${seller}/${buyer}/PRIME`), companyId: seller, otherCompanyId: buyer, relationship: 'PRIME', since },
            { id: idFor(`tie/${buyer}/${seller}/SUPPLIER`), companyId: buyer, otherCompanyId: seller, relationship: 'SUPPLIER', since, tier: 'APPROVED' },
          )
          // The prime's own subcontract terms, from money's one writer of terms (rates/pure `agreementTermsFor`).
          const terms = soloTerms(frame, msaId, buyer)
          agreements.push({
            id: msaId, vendorId: seller, clientId: buyer,
            paymentTerms: terms.paymentTerms, paymentTermsFrom: terms.paymentTermsFrom, billFrequency: terms.billFrequency,
            billAnchor: terms.billAnchor, billStraddle: terms.billStraddle, billableExpenseKinds: terms.billableExpenseKinds,
            billableExpenseKindsSaid: terms.billableExpenseKindsSaid, currency: terms.currency, minMarginPct: terms.minMarginPct,
            rateCard: (terms.rateCard ?? undefined) as Prisma.InputJsonValue | undefined,
            signedAt: since, effectiveDate: since,
          })
          engagements.push({ id: engagementId, msaId, title: `${p.facts.name} for ${frame.byId.get(buyer)?.name ?? 'the prime'}`, invoiceCycle: 'MONTHLY' })
        } else {
          const t = paper.get(`${seller}|${buyer}`)
          if (!t) throw new Error(`${p.facts.name}'s line runs through two firms that do not trade: ${seller} to ${buyer}.`)
          msaId = t.agreementId
          engagementId = idFor(`engagement/${seller}/${buyer}`)
        }
        sells.push({
          id: ids.sell, companyId: seller, clientCompanyId: buyer, endClientCompanyId: l.clientId, personId: p.facts.id,
          engagementId, msaId, workLocationId: l.workLocationId,
          hiringManagerId: r === 0 ? client.program?.hiringManagerId ?? null : null,
          billRate: l.rates[r].billCents, billCurrency: 'USD', paymentTerms: r === 0 ? 45 : 30, state,
          ...(ownCompany ? lineTerms(soloTerms(frame, msaId!, buyer)) : {}),
          startDate: l.start, endDate: l.end, createdAt: plus(l.start, -10),
        })
        if (ownCompany) continue
        buys.push({
          id: ids.buy, companyId: seller, vendorCompanyId: bottom ? null : l.chain[r + 1], payCurrency: 'USD',
          contractType: bottom ? 'W2' : 'C2C', state, startDate: l.start, endDate: l.end,
          supplierSellContractId: bottom ? null : rungIds(p, l, r + 1).sell, createdAt: plus(l.start, -10),
        })
        candidates.push({
          id: ids.candidate, buyContractId: ids.buy, personId: p.facts.id, payRate: l.rates[r].payCents, payCurrency: 'USD',
          startDate: l.start, endDate: l.end, state: live ? 'ACTIVE' : 'ENDED', createdAt: plus(l.start, -10),
        })
        links.push({ id: ids.link, sellContractId: ids.sell, buyContractId: ids.buy, effectiveFrom: l.start, effectiveTo: l.end })
      }
      if (l.release) {
        releases.push({
          id: idFor(key(p, `release/${l.key}`)), companyId: l.chain[0], personId: p.facts.id,
          sellContractId: rungIds(p, l, 0).sell, releasedById: l.release.releasedById, rollsOffOn: l.release.rollsOffOn,
          confirmedAt: l.release.confirmed ? day(-1) : null, confirmedById: l.release.confirmed ? l.release.releasedById : null,
          createdAt: minutesAfter(day(-7), p.n),
        })
      }
    }
  }
  await writeMissing(db.counterparty, dedupe(ties))
  await writeMissing(db.masterAgreement, dedupe(agreements))
  await writeMissing(db.engagement, dedupe(engagements))
  await writeMissing(db.sellContract, sells)
  await writeMissing(db.buyContract, buys)
  await writeMissing(db.buyContractCandidate, candidates)
  await writeMissing(db.contractLink, links)
  await writeMissing(db.projectRelease, releases)
}

/** The terms on a one-person company's agreement with the prime above it: the prime's standard subcontract. */
function soloTerms(frame: ScaleFrame, agreementId: string, primeId: string): AgreementTerms {
  const prime = frame.byId.get(primeId)
  if (!prime) throw new Error(`No prime ${primeId} in the frame.`)
  return agreementTermsFor({ agreementId, relationship: 'PRIME' }, prime, { runByMsp: false, industries: frame.industries })
}

/** What a line under that agreement reads from it, the same as money sets every other line. */
function lineTerms(t: AgreementTerms) {
  return {
    paymentTerms: t.paymentTerms, paymentTermsFrom: t.paymentTermsFrom,
    billFrequency: t.billFrequency, billAnchor: t.billAnchor, billStraddle: t.billStraddle,
  }
}

function dedupe<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}

// ── Lines to the jobs they filled ─────────────────────────────────────

/**
 * Every line, every rung, carries the filled job it came from, as the
 * base world's placements do. Only where that job exists and the line does
 * not already say so: a second run changes nothing.
 */
async function seedLinesToJobs(frame: ScaleFrame): Promise<void> {
  const rows: { id: string; requirementId: string }[] = []
  for (const p of planPeople(frame)) {
    for (const l of p.lines) {
      const job = jobIdForLine(p.facts, { clientId: l.clientId, start: l.start })
      for (let r = 0; r < l.chain.length; r++) rows.push({ id: rungIds(p, l, r).sell, requirementId: job })
    }
  }
  for (const b of batch(rows)) {
    const values = Prisma.join(b.map((x) => Prisma.sql`(${x.id}, ${x.requirementId})`))
    await db.$executeRaw`
      UPDATE "SellContract" s SET "requirementId" = v.r
      FROM (VALUES ${values}) AS v(id, r)
      WHERE s.id = v.id AND s."requirementId" IS DISTINCT FROM v.r
        AND EXISTS (SELECT 1 FROM "Requirement" q WHERE q.id = v.r)`
  }
}
