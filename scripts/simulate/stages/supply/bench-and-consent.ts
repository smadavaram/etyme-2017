/**
 * Stage: bench-and-consent. Owned by supply.
 *
 * Every supplier and sub-vendor in the world fills its bench the way a
 * recruiter does, and every person on it says yes or no from their own
 * seat. Nothing reaches past a firm until the person agrees.
 *
 *   1. At each firm the recruiter (else the resource manager, else the
 *      owner) adds new people through `POST /api/consultants`, with the
 *      skills, places and rates of the jobs that firm's clients actually
 *      post — a nurse at a clinical firm, a validation engineer at a
 *      validation firm, never a software default. A third carry the pay
 *      the firm would offer (W2 or 1099).
 *   2. Each person answers from their own seat: half from their own page
 *      (`/api/me/benches`, then respond), half from the emailed link
 *      (`/api/bench-invite/:token`). Each chooses how long they stay —
 *      until they cancel, 5, 7, 15, 25, 50, 60 or 500 days — whether
 *      they may be shown in matches beyond the firm's partners, and one
 *      in eight says no, with a reason.
 *   3. A person the seed already asked and who has not answered answers
 *      now; a consultant at the firm with no listing is listed through
 *      `POST /api/bench/listings` and answers too.
 *   4. A firm passes two of its agreed people one rung up or down, to a
 *      firm it already trades with (`POST /api/bench/share`), and each
 *      person answers the new firm's ask.
 *   5. At an integrator, the delivery manager flags the firm's own people
 *      coming off a project they manage (`POST /api/bench/ours/flag`).
 *      No consent is asked; the person and HR are told.
 *   6. Rules held on purpose: a recruiter cannot answer for the person,
 *      nor grant the listing for them; a person who has not agreed is not
 *      passed on; a share to a firm the lister does not trade with is
 *      refused; a client does not browse a bench; a manager cannot flag a
 *      project they do not manage, nor somebody the firm does not employ.
 *
 * What the next stations need is left in `benchOf(ctx.world)`.
 */
import { signInvite } from '@/lib/bench-invite'
import type { Actor, Res } from '../../actors'
import { defineStage, type Ctx } from '../../stage'
import { benchOf, newPersonEmail, newPersonName, STAYS, type BenchFact } from './bench-facts'

const DAY = 86_400_000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

interface Template {
  title: string
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
}

interface Firm {
  slug: string
  id: string
  name: string
  kind: string
  lister: Actor
}

/** One person the run brings onto a bench, from the firm's ask to their answer. */
interface Newcomer {
  firm: Firm
  k: number
  name: string
  email: string
  t: Template
  rateMin: number
  rateMax: number
  terms: { engagementType: 'W2' | 'IND_1099'; payRateCents: number } | null
  said: 'ACCEPT' | 'DECLINE'
  stayDays: number | null
  showInMatches: boolean
  viaLink: boolean
}

/** Who adds people at a firm: the recruiter, the resource manager, else the owner. */
function listerAt(ctx: Ctx, slug: string): Actor | null {
  return ctx.cast.at(slug, 'recruiter') ?? ctx.cast.at(slug, 'resourcing') ?? ctx.cast.at(slug, 'owner')
}

/** What a firm's clients hire for: the jobs sent to it, then the jobs at the clients it serves directly or through a prime. */
async function templatesFor(ctx: Ctx, firmId: string): Promise<Template[]> {
  const reg = await ctx.read.counterparty.findMany({
    where: { companyId: firmId, status: 'ACTIVE' },
    select: { otherCompanyId: true, relationship: true },
  })
  // A firm that sells to another supplier (a prime, or an integrator it
  // is a client-side vendor to) recruits for that firm's clients.
  const kinds = new Map(
    (await ctx.read.company.findMany({ where: { id: { in: reg.map((r) => r.otherCompanyId) } }, select: { id: true, kind: true } }))
      .map((c) => [c.id, c.kind])
  )
  const clients = new Set(reg.filter((r) => r.relationship === 'CLIENT').map((r) => r.otherCompanyId))
  const primes = reg
    .filter((r) => r.relationship === 'PRIME' || (r.relationship === 'CLIENT' && kinds.get(r.otherCompanyId) !== 'CLIENT'))
    .map((r) => r.otherCompanyId)
  if (primes.length) {
    const up = await ctx.read.counterparty.findMany({
      where: { companyId: { in: primes }, relationship: 'CLIENT', status: 'ACTIVE' },
      select: { otherCompanyId: true },
    })
    for (const u of up) clients.add(u.otherCompanyId)
  }
  const sent = await ctx.read.requirementInvitation.findMany({
    where: { toCompanyId: firmId, status: { not: 'REVOKED' } },
    select: { requirementId: true },
  })
  const rows = await ctx.read.requirement.findMany({
    where: {
      NOT: { skills: { isEmpty: true } },
      OR: [{ id: { in: sent.map((s) => s.requirementId) } }, { companyId: { in: [...clients] } }],
    },
    select: { id: true, title: true, skills: true, location: true, billMin: true, billMax: true, status: true },
    orderBy: { createdAt: 'asc' },
  })
  // Published work first: that is what the firm is filling this month.
  const open = rows.filter((r) => r.status === 'OPEN')
  const rest = rows.filter((r) => r.status !== 'OPEN')
  const fromWorld = ctx.world.jobs
    .filter((j) => j.status === 'OPEN' && clients.has(ctx.world.companies[j.clientSlug]?.id ?? ''))
    .map((j) => ({ title: j.title, skills: j.skills, location: null, billMin: j.billMin, billMax: j.billMax }))
  return [...open, ...fromWorld, ...rest].map(({ title, skills, location, billMin, billMax }) => ({ title, skills, location, billMin, billMax }))
}

/** The person's yes or no, from their own page or from the emailed link. */
async function answer(
  ctx: Ctx,
  worker: Actor,
  listingId: string,
  how: { said: 'ACCEPT' | 'DECLINE'; stayDays: number | null; showInMatches: boolean; viaLink: boolean; note?: string }
): Promise<Res> {
  if (how.viaLink) {
    const token = signInvite(listingId)
    const page = await worker.get(`/api/bench-invite/${token}`)
    const seen = page.json?.data?.terms?.seen ?? undefined
    return worker.post(`/api/bench-invite/${token}`, {
      said: how.said,
      stayDays: how.stayDays ?? 'UNTIL_CANCELLED',
      showInMatches: how.showInMatches,
      ...(seen ? { termsSeen: seen } : {}),
      ...(how.note ? { note: how.note } : {}),
    })
  }
  const page = await worker.get('/api/me/benches')
  const asked = ((page.json?.data?.invited ?? []) as any[]).find((i) => i.listingId === listingId)
  const seen = asked?.terms ? { engagementType: asked.terms.engagementType, payRateCents: asked.terms.payRateCents } : undefined
  return worker.post(`/api/me/benches/${listingId}/respond`, {
    said: how.said,
    stayDays: how.stayDays ?? 'UNTIL_CANCELLED',
    showInMatches: how.showInMatches,
    ...(seen ? { termsSeen: seen } : {}),
    ...(how.note ? { note: how.note } : {}),
  })
}

const DECLINE_NOTES = [
  'I have accepted a permanent offer and am not looking for contract work.',
  'I am already represented for this kind of work and do not want two firms putting me forward.',
  'Not available until next year; please ask me again then.',
]

export default defineStage({
  name: 'bench-and-consent',
  domain: 'SUPPLY',
  async run(ctx) {
    const bench = benchOf(ctx.world)
    const today = new Date()
    const noted: string[] = []

    // ── Who lists, at which firms ──────────────────────────────────────
    const vendors = Object.values(ctx.world.companies).filter((c) => c.kind === 'VENDOR')
    const firms: Firm[] = []
    for (const c of vendors) {
      const lister = listerAt(ctx, c.slug)
      if (lister) firms.push({ slug: c.slug, id: c.id, name: c.name, kind: c.kind, lister })
    }
    const seatless = await ctx.read.company.findMany({
      where: { slug: { startsWith: 'world-' }, kind: 'VENDOR', id: { notIn: firms.map((f) => f.id) } },
      select: { name: true },
    })
    if (seatless.length) noted.push(`${seatless.map((s) => s.name).join(', ')} hold no seat anybody can sit at, so nobody there adds people.`)
    if (firms.length === 0) return { closed: 0, says: 'No supplier in this world seats anybody who can add people to a bench.' }

    // ── 1–2. New people, each asked and each answering ─────────────────
    const perFirm = Math.max(3, Math.ceil((ctx.options.placements * 1.5) / firms.length))
    const newcomers: Newcomer[] = []
    let k = 0
    for (const firm of firms) {
      const templates = await templatesFor(ctx, firm.id)
      if (templates.length === 0) {
        noted.push(`${firm.name} serves no client with a job on record, so it has nothing to recruit for.`)
        continue
      }
      for (let j = 0; j < perFirm; j++, k++) {
        const t = templates[j % templates.length]
        const name = newPersonName(k)
        const lo = t.billMin ?? 8000
        const hi = Math.max(lo, t.billMax ?? lo + 2000)
        // Most are marketed inside the job's band; one in five above it, as happens.
        const above = j % 5 === 4
        const rateMin = above ? hi + 500 : Math.round((lo + (hi - lo) * 0.2) / 100) * 100
        const rateMax = above ? hi + 2000 : Math.round((lo + (hi - lo) * 0.8) / 100) * 100
        const terms =
          j % 3 === 0
            ? { engagementType: (j % 2 === 0 ? 'W2' : 'IND_1099') as 'W2' | 'IND_1099', payRateCents: Math.round((rateMin * 0.72) / 100) * 100 }
            : null
        newcomers.push({
          firm, k, name, email: newPersonEmail(name, k, firm.slug), t, rateMin, rateMax, terms,
          said: k % 8 === 7 ? 'DECLINE' : 'ACCEPT',
          stayDays: STAYS[k % STAYS.length],
          showInMatches: k % 2 === 0,
          viaLink: k % 2 === 1,
        })
      }
    }

    let added = 0
    let agreed = 0
    let declined = 0
    const made = new Map<string, Newcomer & { listingId: string; personId: string; consultantId: string }>()
    await ctx.parallel(newcomers, async (n) => {
      const res = await n.firm.lister.post('/api/consultants', {
        name: n.name,
        email: n.email,
        headline: n.t.title,
        skills: n.t.skills,
        location: n.t.location,
        availableFrom: isoDay(new Date(today.getTime() + (n.k % 4) * 7 * DAY)),
        tier: 'MARKETING',
        rateMin: n.rateMin,
        rateMax: n.rateMax,
        ...(n.terms ? { termsEngagementType: n.terms.engagementType, termsPayRateCents: n.terms.payRateCents } : {}),
      })
      const listingId = res.json?.data?.listing?.id
      const personId = res.json?.data?.consultant?.personId
      const consultantId = res.json?.data?.consultant?.id
      if (!res.ok || !listingId) return
      added++
      made.set(listingId, { ...n, listingId, personId, consultantId })
      const worker = ctx.cast.worker(n.email)
      const said = await answer(ctx, worker, listingId, {
        said: n.said, stayDays: n.stayDays, showInMatches: n.showInMatches, viaLink: n.viaLink,
        note: n.said === 'DECLINE' ? DECLINE_NOTES[n.k % DECLINE_NOTES.length] : undefined,
      })
      if (said.ok) n.said === 'ACCEPT' ? agreed++ : declined++
    })

    // ── 3. The seed's own unanswered asks, and consultants never listed ─
    let seededAnswered = 0
    let listedExisting = 0
    await ctx.parallel(firms, async (firm) => {
      const res = await firm.lister.get('/api/bench?scope=company')
      const rows = [...(res.json?.data?.tiers?.RETAINED ?? []), ...(res.json?.data?.tiers?.MARKETING ?? [])] as any[]
      for (const row of rows) {
        if (row.consent !== 'INVITED' || made.has(row.id)) continue
        const email: string | null = row.consultant?.person?.email ?? null
        if (!email) continue
        let worker: Actor
        try {
          worker = ctx.cast.worker(email)
        } catch {
          continue // a real address: nobody here may sit as them
        }
        const r = await answer(ctx, worker, row.id, { said: 'ACCEPT', stayDays: null, showInMatches: false, viaLink: false })
        if (r.ok) seededAnswered++
      }
      // A consultant at the firm with a profile and no listing here: the firm asks.
      const unlisted = await ctx.read.consultantProfile.findMany({
        where: {
          person: { contexts: { some: { companyId: firm.id, type: 'CONSULTANT', revokedAt: null } } },
          listings: { none: { companyId: firm.id } },
        },
        select: { id: true, person: { select: { primaryEmail: true } } },
      })
      for (const c of unlisted) {
        const l = await firm.lister.post('/api/bench/listings', { consultantId: c.id, tier: 'MARKETING' })
        const id = l.json?.data?.listing?.id
        if (!l.ok || !id) continue
        listedExisting++
        let worker: Actor
        try {
          worker = ctx.cast.worker(c.person.primaryEmail)
        } catch {
          continue
        }
        await answer(ctx, worker, id, { said: 'ACCEPT', stayDays: null, showInMatches: true, viaLink: true })
      }
    })

    // ── 4. Shared one rung, only to a firm the lister trades with ──────
    const kinds = new Map(Object.values(ctx.world.companies).map((c) => [c.id, c.kind]))
    const granted = [...made.values()].filter((m) => m.said === 'ACCEPT')
    let shared = 0
    let sharedAgreed = 0
    const sharedFacts: BenchFact[] = []
    await ctx.parallel(firms, async (firm) => {
      const partners = await ctx.read.counterparty.findMany({
        where: { companyId: firm.id, status: 'ACTIVE', relationship: { in: ['PRIME', 'SUPPLIER'] } },
        select: { otherCompanyId: true },
      })
      const to = partners.map((p) => p.otherCompanyId).find((id) => kinds.get(id) === 'VENDOR' || kinds.get(id) === 'GSI')
      if (!to) return
      const mine = granted.filter((m) => m.firm.slug === firm.slug).slice(0, 2)
      if (mine.length === 0) return
      const res = await firm.lister.post('/api/bench/share', { listingIds: mine.map((m) => m.listingId), toCompanyId: to })
      const results = (res.json?.data?.results ?? []) as any[]
      const toSlug = Object.values(ctx.world.companies).find((c) => c.id === to)?.slug ?? null
      for (const r of results) {
        if (r.status !== 'shared' || !r.newListingId) continue
        shared++
        const m = mine.find((x) => x.listingId === r.listingId)!
        const a = await answer(ctx, ctx.cast.worker(m.email), r.newListingId, { said: 'ACCEPT', stayDays: null, showInMatches: false, viaLink: false })
        if (!a.ok || !toSlug) continue
        sharedAgreed++
        sharedFacts.push({
          id: r.newListingId, by: firm.lister.key, personId: m.personId, consultantId: m.consultantId, name: m.name, email: m.email,
          firmSlug: toSlug, firmId: to, kind: 'SHARED', state: 'GRANTED', tier: 'MARKETING', skills: m.t.skills, location: m.t.location,
          rateMin: m.rateMin, rateMax: m.rateMax, stayDays: null, showInMatches: false, seeded: false,
        })
      }
    })

    // ── 5. An integrator's own people, flagged by the manager of their project ─
    const flags = await flagRollOffs(ctx, today)

    // ── 6. The rules, held on purpose ──────────────────────────────────
    const held: string[] = []
    const sample = [...made.values()][0]
    if (sample) {
      const lister = sample.firm.lister
      await ctx.expectRefusal(lister, (a) => a.post(`/api/me/benches/${sample.listingId}/respond`, { said: 'ACCEPT' }), 'not yours to answer')
      await ctx.expectRefusal(lister, (a) => a.patch(`/api/bench/listings/${sample.listingId}/grant`, {}), 'Only the consultant can grant')
    }
    // A person who said no is not passed on: the share answers 200 and names them, so it is checked here.
    // Asked of a firm the lister does trade with, so it is the consent that says no and not the tie.
    let no: (typeof granted)[number] | undefined
    let partnerId: string | undefined
    for (const m of [...made.values()].filter((x) => x.said === 'DECLINE')) {
      const p = await ctx.read.counterparty.findFirst({
        where: { companyId: m.firm.id, status: 'ACTIVE' },
        select: { otherCompanyId: true },
      })
      if (p) {
        no = m
        partnerId = p.otherCompanyId
        break
      }
    }
    if (no && partnerId) {
      const res = await no.firm.lister.post('/api/bench/share', { listingIds: [no.listingId], toCompanyId: partnerId })
      const r0 = (res.json?.data?.results ?? [])[0]
      held.push(
        r0?.status === 'not_consented'
          ? `a person who said no was not passed on ("${r0.reason}")`
          : r0?.status === 'shared'
            ? 'NOT HELD: a person who said no was passed on to another firm'
            : `the not-consented share was answered ${res.status} ${r0?.status ?? res.sentence ?? ''}`
      )
    }
    // A share to a firm the lister does not trade with.
    const stranger = await strangerPair(ctx, firms, granted)
    if (stranger) {
      await ctx.expectRefusal(
        stranger.firm.lister,
        (a) => a.post('/api/bench/share', { listingIds: [stranger.listingId], toCompanyId: stranger.toId }),
        'only with firms you already work with'
      )
    }
    // A client does not browse a bench.
    const client = Object.values(ctx.world.companies).find((c) => c.kind === 'CLIENT' && ctx.cast.at(c.slug, 'hiring'))
    if (client) {
      await ctx.expectRefusal(ctx.cast.at(client.slug, 'hiring')!, (a) => a.get('/api/bench?scope=company'), /bench/i)
    }

    // ── What the next stations read ────────────────────────────────────
    const profiles = new Map<string, { skills: string[]; location: string | null }>()
    await ctx.parallel(firms, async (firm) => {
      const res = await firm.lister.get('/api/bench?scope=company')
      const rows = [...(res.json?.data?.tiers?.RETAINED ?? []), ...(res.json?.data?.tiers?.MARKETING ?? [])] as any[]
      const unknown = rows.filter((r) => !made.has(r.id)).map((r) => r.consultant?.id).filter(Boolean)
      if (unknown.length) {
        for (const p of await ctx.read.consultantProfile.findMany({ where: { id: { in: unknown } }, select: { id: true, skills: true, location: true } })) {
          profiles.set(p.id, { skills: p.skills, location: p.location })
        }
      }
      for (const r of rows) {
        const m = made.get(r.id)
        const p = profiles.get(r.consultant?.id)
        bench.push({
          id: r.id, by: firm.lister.key, personId: r.consultant?.personId, consultantId: r.consultant?.id ?? null,
          name: r.consultant?.person?.name ?? '', email: r.consultant?.person?.email ?? '',
          firmSlug: firm.slug, firmId: firm.id, kind: 'LISTING', state: r.consent, tier: r.tier,
          skills: m?.t.skills ?? p?.skills ?? [], location: m?.t.location ?? p?.location ?? null,
          rateMin: r.rateMin ?? null, rateMax: r.rateMax ?? null,
          stayDays: m ? (m.said === 'ACCEPT' ? m.stayDays : null) : null,
          showInMatches: m ? m.said === 'ACCEPT' && m.showInMatches : false,
          seeded: !m,
        })
      }
    })
    for (const f of sharedFacts) if (!bench.some((b) => b.id === f.id)) bench.push(f)
    for (const e of flags.employees) bench.push(e)

    const live = bench.filter((b) => b.state === 'GRANTED' || b.kind === 'EMPLOYEE').length
    ctx.log(
      `${added} added at ${firms.length} firms; ${agreed} said yes, ${declined} said no; ${seededAnswered} seeded asks answered; ` +
        `${listedExisting} existing consultants listed; ${shared} shared one rung (${sharedAgreed} agreed the new firm); ` +
        `${flags.flagged} flagged rolling off; ${flags.employees.length} employees on Our bench`
    )
    for (const h of [...held, ...flags.notes, ...noted]) ctx.log(h)
    return {
      closed: agreed + seededAnswered + sharedAgreed + flags.flagged,
      of: newcomers.length + seededAnswered + shared + flags.tried,
      says:
        `${agreed} of ${newcomers.length} people added at ${firms.length} suppliers said yes from their own seat and ${declined} said no; ` +
        `${seededAnswered} the seed had asked answered; ${sharedAgreed} of ${shared} shared one rung agreed the new firm; ` +
        `${flags.flagged} of the integrators' own people were flagged rolling off. ${live} people are live on a bench for the stations after. ` +
        [...held, ...flags.notes, ...noted].join(' '),
    }
  },
})

/** A granted listing and a firm its lister has no tie to, for the refusal. */
async function strangerPair(
  ctx: Ctx,
  firms: Firm[],
  granted: { firm: Firm; listingId: string }[]
): Promise<{ firm: Firm; listingId: string; toId: string } | null> {
  for (const g of granted) {
    const ties = await ctx.read.counterparty.findMany({
      where: { OR: [{ companyId: g.firm.id }, { otherCompanyId: g.firm.id }] },
      select: { companyId: true, otherCompanyId: true },
    })
    const agreements = await ctx.read.masterAgreement.findMany({
      where: { OR: [{ clientId: g.firm.id }, { vendorId: g.firm.id }] },
      select: { clientId: true, vendorId: true },
    })
    const near = new Set([g.firm.id, ...ties.flatMap((t) => [t.companyId, t.otherCompanyId]), ...agreements.flatMap((a) => [a.clientId, a.vendorId])])
    const far = firms.find((f) => !near.has(f.id))
    if (far) return { firm: g.firm, listingId: g.listingId, toId: far.id }
  }
  return null
}

/**
 * At each integrator, the manager of each project flags the firm's own
 * people coming off it. A line ending within six weeks rolls off on its
 * last day; a longer one is released early, three weeks out, which the
 * route says does not shorten the contract.
 */
async function flagRollOffs(ctx: Ctx, today: Date): Promise<{ flagged: number; tried: number; employees: BenchFact[]; notes: string[] }> {
  const notes: string[] = []
  const employees: BenchFact[] = []
  let flagged = 0
  let tried = 0
  let skillsSaid = 0
  const gsis = Object.values(ctx.world.companies).filter((c) => c.kind === 'GSI')
  const startedAt = new Date()
  for (const gsi of gsis) {
    const managers = ctx.cast.where((s) => s.company?.slug === gsi.slug && s.role === 'Delivery Manager' && s.key.split('/').length === 3)
    const anyManager = managers.length ? managers : (ctx.cast.at(gsi.slug, 'delivery') ? [ctx.cast.at(gsi.slug, 'delivery')!] : [])
    const lines = await ctx.read.sellContract.findMany({
      where: { companyId: gsi.id, state: { in: ['IN_PROGRESS', 'PAUSED'] } },
      select: {
        id: true, personId: true, endDate: true, deliveryUnitId: true,
        person: { select: { name: true, contexts: { where: { companyId: gsi.id, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } } } },
        projectRelease: { select: { releasedById: true, withdrawnAt: true } },
      },
    })
    const units = await ctx.read.orgUnit.findMany({ where: { companyId: gsi.id }, select: { id: true, parentId: true } })
    const under = (root: string): Set<string> => {
      const out = new Set([root])
      let grew = true
      while (grew) {
        grew = false
        for (const u of units) if (u.parentId && out.has(u.parentId) && !out.has(u.id)) { out.add(u.id); grew = true }
      }
      return out
    }
    const seatOf = new Map<string, { orgUnitId: string | null; personId: string }>()
    for (const m of anyManager) {
      const ctxRow = await ctx.read.context.findFirst({
        where: { personId: m.spec.personId, companyId: gsi.id, revokedAt: null },
        select: { orgUnitId: true },
      })
      seatOf.set(m.key, { orgUnitId: ctxRow?.orgUnitId ?? null, personId: m.spec.personId })
    }
    const manages = (m: Actor, deliveryUnitId: string | null) => {
      const s = seatOf.get(m.key)
      if (!s) return false
      if (!deliveryUnitId || !s.orgUnitId) return true
      return under(s.orgUnitId).has(deliveryUnitId)
    }

    if (anyManager.length === 0) {
      notes.push(`${gsi.name} seats no delivery manager, so nobody there flags who comes off a project.`)
    }
    for (const line of lines) {
      if (line.person.contexts.length === 0) continue // not the firm's employee: moved with their consent, from Bench
      const m = anyManager.find((x) => manages(x, line.deliveryUnitId))
      if (!m) continue
      const already = line.projectRelease && !line.projectRelease.withdrawnAt ? line.projectRelease : null
      if (already && already.releasedById !== seatOf.get(m.key)?.personId) continue // another manager's flag; theirs to move
      if (already) continue // flagged before this run by this same manager
      const ends = line.endDate ? new Date(line.endDate) : null
      const soon = new Date(today.getTime() + 21 * DAY)
      const rollsOffOn = ends && ends.getTime() - today.getTime() <= 42 * DAY ? ends : soon
      if (ends && rollsOffOn.getTime() > ends.getTime()) continue
      tried++
      const res = await m.post('/api/bench/ours/flag', { sellContractId: line.id, rollsOffOn: isoDay(rollsOffOn) })
      if (res.ok) flagged++
    }

    // The rules: a project the manager does not run, and somebody the firm does not employ.
    for (const m of anyManager) {
      const foreign = lines.find((l) => l.person.contexts.length > 0 && !manages(m, l.deliveryUnitId))
      if (foreign) {
        await ctx.expectRefusal(m, (a) => a.post('/api/bench/ours/flag', { sellContractId: foreign.id, rollsOffOn: isoDay(new Date(today.getTime() + 7 * DAY)) }), 'a project you do not manage')
        break
      }
    }
    const notOurs = lines.find((l) => l.person.contexts.length === 0)
    if (anyManager[0] && notOurs) {
      await ctx.expectRefusal(anyManager[0], (a) => a.post('/api/bench/ours/flag', { sellContractId: notOurs.id, rollsOffOn: isoDay(new Date(today.getTime() + 7 * DAY)) }), 'is not employed at')
    }

    // Who is on Our bench now, read by HR (else a manager, else the owner).
    const reader = ctx.cast.at(gsi.slug, 'hr') ?? anyManager[0] ?? ctx.cast.at(gsi.slug, 'owner')
    if (!reader) continue
    const ours = await reader.get('/api/bench/ours')
    if (!ours.ok) {
      notes.push(`${gsi.name}'s Our bench could not be read by ${reader.name}: ${ours.sentence ?? ours.status}.`)
      continue
    }
    const rows = (ours.json?.data?.rows ?? []) as any[]
    const ids = rows.map((r) => r.personId)
    // Each of them says their own skills on their own page — the work they
    // are on, or last did here — so matching can weigh them. Nobody lists
    // an employee, so nobody else types them.
    const lastJobs = await ctx.read.sellContract.findMany({
      where: { companyId: gsi.id, personId: { in: ids }, requirement: { NOT: { skills: { isEmpty: true } } } },
      select: { personId: true, endDate: true, requirement: { select: { skills: true, location: true } } },
      orderBy: { startDate: 'desc' },
    })
    const before = await ctx.read.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, primaryEmail: true, consultant: { select: { skills: true } } },
    })
    for (const p of before) {
      if ((p.consultant?.skills.length ?? 0) > 0) continue
      const job = lastJobs.find((j) => j.personId === p.id)
      if (!job?.requirement) continue
      let worker: Actor
      try {
        worker = ctx.cast.worker(p.primaryEmail)
      } catch {
        continue
      }
      const r = await worker.patch('/api/me/portfolio', { skills: job.requirement.skills })
      if (r.ok) skillsSaid++
    }
    const people = await ctx.read.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, primaryEmail: true, consultant: { select: { id: true, skills: true, location: true } } },
    })
    for (const r of rows) {
      const p = people.find((x) => x.id === r.personId)
      employees.push({
        id: r.personId, by: reader.key, personId: r.personId, consultantId: p?.consultant?.id ?? null, name: r.name ?? p?.name ?? '',
        email: p?.primaryEmail ?? '', firmSlug: gsi.slug, firmId: gsi.id, kind: 'EMPLOYEE', state: 'EMPLOYEE', tier: null,
        skills: p?.consultant?.skills ?? [], location: p?.consultant?.location ?? null, rateMin: null, rateMax: null,
        stayDays: null, showInMatches: false, seeded: true, freeOn: r.freeOn ?? null,
      })
    }
    // The person is told, never asked: read the notice they were sent.
    const told = await ctx.read.notification.count({ where: { companyId: gsi.id, type: 'ROLLOFF', createdAt: { gte: startedAt } } })
    if (flagged > 0 && told === 0) notes.push(`NOT HELD: ${gsi.name} flagged people and nobody was told.`)
  }
  if (skillsSaid) notes.push(`${skillsSaid} of the integrators' own people between projects put their skills on their own page.`)
  return { flagged, tried, employees, notes }
}
