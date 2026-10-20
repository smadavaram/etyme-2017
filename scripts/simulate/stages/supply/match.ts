/**
 * Stage: match. Owned by supply.
 *
 * For every published job request, matching is run through its own route
 * and read back, by every party allowed to run it:
 *
 *   - the firm that raised it (the hiring manager at a client), whose
 *     list ranks its own suppliers first, then firms it works with, then
 *     suggestions from firms that are not its suppliers yet;
 *   - every supplier the job was sent to, matching its own pool — its
 *     agreed bench, its partners' shared people and, at an integrator,
 *     its own employees between projects, who go forward as INTERNAL.
 *
 * `POST /api/requirements/:id/matches` scores; `GET` reads what each
 * viewer may see. Every row is checked for the four things a score must
 * carry — factors, basis, confidence and unknowns — because a bare number
 * is a fault. The list must be ordered nearest circle first. A suggestion
 * must carry no name, no handle on the person and no rate, and its words
 * must not name anybody on the bench. These are asserted, counted, and a
 * break is named with its owner, never thrown.
 *
 * Works on the jobs post-jobs raised in this run where there are any, and
 * on the world's own published jobs otherwise.
 */
import type { Actor, Res } from '../../actors'
import { defineStage, type Ctx } from '../../stage'
import { benchOf } from './bench-facts'

const REACH_ORDER: Record<string, number> = { OWN: 0, PANEL: 1, TRADING: 2, SUGGESTION: 3 }

interface Job {
  id: string
  title: string
  companyId: string
  companySlug: string
  companyKind: string
  /** The seat that raised it, where this run knows it. */
  by: string | null
}

interface Tally {
  runs: number
  rows: number
  bare: number
  bareSamples: string[]
  nullUnknowns: number
  misordered: number
  suggestions: number
  leakedSuggestions: number
  leakSamples: string[]
  internal: number
  byReach: Record<string, number>
  jobsWithRows: number
  existingFirst: number
  withSuggestionsAndPanel: number
  modelScored: number
  ruleScored: number
}

function emptyTally(): Tally {
  return {
    runs: 0, rows: 0, bare: 0, bareSamples: [], nullUnknowns: 0, misordered: 0, suggestions: 0, leakedSuggestions: 0,
    leakSamples: [], internal: 0, byReach: {}, jobsWithRows: 0, existingFirst: 0, withSuggestionsAndPanel: 0,
    modelScored: 0, ruleScored: 0,
  }
}

/** Published jobs: this run's, else the world's own. */
async function publishedJobs(ctx: Ctx): Promise<Job[]> {
  const fromRun = ctx.world.jobs.filter((j) => j.status === 'OPEN')
  if (fromRun.length > 0) {
    return fromRun.map((j) => {
      const c = ctx.world.companies[j.clientSlug]
      return { id: j.id, title: j.title, companyId: c?.id ?? '', companySlug: j.clientSlug, companyKind: c?.kind ?? 'CLIENT', by: j.by }
    })
  }
  const rows = await ctx.read.requirement.findMany({
    where: { status: 'OPEN', NOT: { skills: { isEmpty: true } }, company: { slug: { startsWith: 'world-' } } },
    select: { id: true, title: true, companyId: true, company: { select: { slug: true, kind: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r) => ({ id: r.id, title: r.title, companyId: r.companyId, companySlug: r.company.slug, companyKind: r.company.kind, by: null }))
}

/** Who at the raising firm presses Find matches. */
function raiserAt(ctx: Ctx, job: Job): Actor | null {
  if (job.by) {
    try {
      return ctx.cast.seat(job.by)
    } catch {
      // fall through to the firm's own desks
    }
  }
  return (
    ctx.cast.at(job.companySlug, 'hiring') ??
    ctx.cast.at(job.companySlug, 'programme') ??
    ctx.cast.at(job.companySlug, 'recruiter') ??
    ctx.cast.at(job.companySlug, 'account') ??
    ctx.cast.at(job.companySlug, 'owner')
  )
}

/** Who at a supplier matches its own pool against a job it was sent. */
function matcherAt(ctx: Ctx, slug: string): Actor | null {
  return (
    ctx.cast.at(slug, 'recruiter') ??
    ctx.cast.at(slug, 'resourcing') ??
    ctx.cast.at(slug, 'account') ??
    // Learned on the first run: a delivery manager may put the firm's own
    // employee forward, and is still refused matching ("for the recruiting
    // team"), so at an integrator the owner runs it. Reported to demand.
    ctx.cast.at(slug, 'owner')
  )
}

/** Check one GET answer and add what it shows to the tally. */
function audit(t: Tally, res: Res, viewer: string, job: Job, names: string[], owner: string): void {
  const rows = (res.json?.data?.matches ?? []) as any[]
  if (rows.length) t.jobsWithRows++
  let last = -1
  let firstPanelSeen = false
  let suggestionSeen = false
  for (const r of rows) {
    t.rows++
    t.byReach[r.reach] = (t.byReach[r.reach] ?? 0) + 1
    const missing: string[] = []
    if (!Array.isArray(r.factors) || r.factors.length === 0) missing.push('factors')
    if (typeof r.basis !== 'string' || r.basis.trim() === '') missing.push('basis')
    if (r.confidence == null || r.confidence === '') missing.push('confidence')
    if (!('unknowns' in r)) missing.push('unknowns')
    else if (r.unknowns == null || (typeof r.unknowns === 'string' && r.unknowns.trim() === '')) t.nullUnknowns++
    if (missing.length) {
      t.bare++
      if (t.bareSamples.length < 3) t.bareSamples.push(`${viewer} on "${job.title}": score ${r.score} without ${missing.join(', ')} (${owner})`)
    }
    const order = REACH_ORDER[r.reach] ?? 9
    if (order < last) t.misordered++
    last = Math.max(last, order)
    if (r.reach === 'PANEL') firstPanelSeen = true
    if (r.reach === 'SUGGESTION') {
      suggestionSeen = true
      t.suggestions++
      const words = [r.basis, r.unknowns, ...(r.factors ?? []).map((f: any) => f?.detail)].filter((x) => typeof x === 'string').join(' ')
      const leaks: string[] = []
      if (r.consultant?.name) leaks.push('a name')
      if (r.consultant?.personId || r.consultant?.id) leaks.push('a handle on the person')
      if (r.rate) leaks.push('a rate')
      if (r.consultant?.headline || r.consultant?.location || r.consultant?.workAuth) leaks.push('their own words or place')
      if (/\$\s?\d/.test(words)) leaks.push('a figure in its words')
      const named = names.find((n) => n.length > 3 && words.includes(n))
      if (named) leaks.push(`the name ${named}`)
      if (leaks.length) {
        t.leakedSuggestions++
        if (t.leakSamples.length < 3) t.leakSamples.push(`"${job.title}" to ${viewer}: a suggestion carried ${leaks.join(', ')}`)
      }
    }
    if (r.employee) {
      if (r.action?.kind === 'SUBMIT' && r.action?.as === 'INTERNAL') t.internal++
    }
  }
  if (firstPanelSeen) t.existingFirst++
  if (firstPanelSeen && suggestionSeen) t.withSuggestionsAndPanel++
}

export default defineStage({
  name: 'match',
  domain: 'SUPPLY',
  async run(ctx) {
    const jobs = await publishedJobs(ctx)
    if (jobs.length === 0) return { closed: 0, says: 'No published job request in this world to match against.' }

    // Every name on any bench, so a suggestion that carries one is caught.
    const names = [
      ...new Set([
        ...benchOf(ctx.world).map((b) => b.name),
        ...(await ctx.read.person.findMany({
          where: { consultant: { listings: { some: { state: 'GRANTED' } } } },
          select: { name: true },
          take: 2000,
        })).map((p) => p.name),
      ]),
    ].filter(Boolean)

    // Who else may run it: every supplier the job was sent to.
    const sent = await ctx.read.requirementInvitation.findMany({
      where: { requirementId: { in: jobs.map((j) => j.id) }, status: { not: 'REVOKED' } },
      select: { requirementId: true, toCompany: { select: { slug: true, name: true } } },
    })

    const plan: { job: Job; actor: Actor; side: 'RAISER' | 'SUPPLIER' }[] = []
    let noRaiser = 0
    for (const job of jobs) {
      const r = raiserAt(ctx, job)
      if (r) plan.push({ job, actor: r, side: 'RAISER' })
      else noRaiser++
      for (const s of sent.filter((x) => x.requirementId === job.id)) {
        const m = matcherAt(ctx, s.toCompany.slug)
        if (m) plan.push({ job, actor: m, side: 'SUPPLIER' })
      }
    }

    const raiser = emptyTally()
    const supplier = emptyTally()
    let scored = 0
    let refused = 0
    await ctx.parallel(plan, async ({ job, actor, side }) => {
      const t = side === 'RAISER' ? raiser : supplier
      const run = await actor.post(`/api/requirements/${job.id}/matches`, { limit: 20 })
      if (!run.ok) {
        refused++
        return
      }
      t.runs++
      scored++
      if (run.json?.data?.decidedBy === 'MODEL') t.modelScored++
      else t.ruleScored++
      const read = await actor.get(`/api/requirements/${job.id}/matches`)
      if (!read.ok) return
      audit(t, read, actor.key, job, names, 'supply, lib/match-engine and lib/match-pool; the route is demand’s')
    })

    // The rules, held on purpose: a firm the job was never sent to is told it is not there.
    const sample = jobs[0]
    const sentTo = new Set(sent.filter((s) => s.requirementId === sample.id).map((s) => s.toCompany.slug))
    const stranger = Object.values(ctx.world.companies).find(
      (c) => (c.kind === 'VENDOR' || c.kind === 'GSI') && !sentTo.has(c.slug) && c.slug !== sample.companySlug && matcherAt(ctx, c.slug)
    )
    if (stranger) {
      await ctx.expectRefusal(matcherAt(ctx, stranger.slug)!, (a) => a.get(`/api/requirements/${sample.id}/matches`), 'not found')
    }
    // And a supplier's AP & Payroll seat may not run matching on a job its firm was sent.
    const sentRow = sent.find((s) => ctx.cast.at(s.toCompany.slug, 'payroll'))
    if (sentRow) {
      await ctx.expectRefusal(
        ctx.cast.at(sentRow.toCompany.slug, 'payroll')!,
        (a) => a.post(`/api/requirements/${sentRow.requirementId}/matches`, {}),
        'recruiting team'
      )
    }

    const faults: string[] = []
    for (const [who, t] of [['the firms that raised them', raiser], ['the suppliers they were sent to', supplier]] as const) {
      if (t.bare) faults.push(`FAULT (supply): ${t.bare} of ${t.rows} rows read by ${who} carried a bare score — ${t.bareSamples.join('; ')}.`)
      if (t.misordered) faults.push(`FAULT (supply): ${t.misordered} rows read by ${who} came out of order — a farther circle ranked above a nearer one.`)
      if (t.leakedSuggestions) faults.push(`FAULT (supply): ${t.leakedSuggestions} suggestions read by ${who} leaked — ${t.leakSamples.join('; ')}.`)
    }
    for (const f of faults) ctx.log(f)

    const reach = (t: Tally) =>
      Object.entries(t.byReach).sort((a, b) => (REACH_ORDER[a[0]] ?? 9) - (REACH_ORDER[b[0]] ?? 9)).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ') || 'none'
    const line =
      `Matching ran ${scored} times on ${jobs.length} published jobs (${raiser.runs} by the firm that raised the job, ${supplier.runs} by a supplier it was sent to; ` +
      `${raiser.ruleScored + supplier.ruleScored} scored by rules, ${raiser.modelScored + supplier.modelScored} by the model). ` +
      `Raisers read ${raiser.rows} rows (${reach(raiser)}); on ${raiser.existingFirst} jobs existing suppliers' people were listed, every one ahead of any suggestion (${raiser.misordered + supplier.misordered} rows out of order). ` +
      `Suppliers read ${supplier.rows} rows (${reach(supplier)}), ${supplier.internal + raiser.internal} of them the firm's own employees offered as INTERNAL. ` +
      `${raiser.suggestions + supplier.suggestions} suggestions came with no name, no handle and no rate except ${raiser.leakedSuggestions + supplier.leakedSuggestions}. ` +
      `${raiser.rows + supplier.rows - raiser.bare - supplier.bare} of ${raiser.rows + supplier.rows} rows carried factors, basis, confidence and unknowns` +
      ` (${raiser.nullUnknowns + supplier.nullUnknowns} said nothing was unknown).` +
      (noRaiser ? ` ${noRaiser} jobs had nobody at the raising firm to run matching.` : '') +
      (refused ? ` ${refused} runs were refused.` : '') +
      (faults.length ? ` ${faults.join(' ')}` : '')
    ctx.log(line)
    return { closed: scored, of: plan.length, says: line }
  },
})
