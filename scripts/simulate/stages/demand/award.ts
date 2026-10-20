/**
 * Stage: award. Owned by demand.
 *
 * The hiring manager places one person per job through
 * `POST /api/submissions/[id]/award`: the one who was offered the job,
 * else one still in the running. One award writes the contract the
 * client pays (the sell line), the line the supplier pays from (the buy
 * line: a sub-vendor's or the firm's own payroll), the order behind them
 * and the billing dates, stands the other suppliers down and closes the
 * seat. Nobody is placed twice in one run.
 *
 * The start date. The run has no clock, so weeks can only be worked if
 * they are behind us: each placement starts on the Sunday `--weeks`
 * weeks back, awarded as work already under way with the reason
 * written down. That is the route's own path for a start before the
 * award, said plainly on the placement, not a shortcut around it.
 *
 * What it hands on: `ctx.world.awards`, one per placement, with the
 * sell line, the buy line and the order the award wrote, so the
 * contracts, paperwork and weeks stations continue from them.
 *
 * The rule held on purpose, once per client: a supplier never awards
 * its own candidate.
 */
import { defineStage, type AwardFact, type JobFact, type SubmissionFact } from '../../stage'
import { jobsInPlay, said, Said, sundayWeeksAgo, workerSeat } from './common'

const RANK: Record<string, number> = { OFFER: 0, ADVANCE: 1 }

export default defineStage({
  name: 'award',
  domain: 'DEMAND',
  async run(ctx) {
    const jobs = await jobsInPlay(ctx, 'OPEN')
    const subsOf = (job: JobFact) =>
      ctx.world.submissions
        .filter((s) => s.jobId === job.id)
        .sort((a, b) => (RANK[String(a.extra?.outcome)] ?? 2) - (RANK[String(b.extra?.outcome)] ?? 2))
    const withPeople = jobs.filter((j) => subsOf(j).length > 0)
    if (withPeople.length === 0) return { closed: 0, of: 0, says: 'Nobody was put forward on any open job, so nobody can be placed.' }

    const start = sundayWeeksAgo(ctx.options.weeks)
    const startDate = start.toISOString().slice(0, 10)
    const placed = new Set<string>(ctx.world.awards.map((a) => String(a.extra?.personId ?? '')))
    const refused = new Said()
    let reasoned = 0

    // The rule, once per client: the supplier tries to place its own candidate.
    const ruled = new Set<string>()
    for (const job of withPeople) {
      if (ruled.has(job.clientSlug)) continue
      ruled.add(job.clientSlug)
      const s = subsOf(job)[0]
      await ctx.expectRefusal(ctx.cast.seat(s.by), (a) => a.post(`/api/submissions/${s.id}/award`, {}), 'never awards its own candidate')
    }

    const tryAward = async (job: JobFact, s: SubmissionFact): Promise<boolean> => {
      const hm = (job.by !== 'seed' ? ctx.cast.seat(job.by) : null) ?? ctx.cast.at(job.clientSlug, 'hiring')
      if (!hm) return false
      const body: Record<string, unknown> = {
        startDate,
        workUnderWay: true,
        underWayReason: `${s.extra?.name ?? 'The contractor'} has been working since ${startDate}; the paperwork follows the work.`,
      }
      let res = await hm.post(`/api/submissions/${s.id}/award`, body)
      if (!res.ok && /Give a reason to go ahead/.test(res.sentence ?? '')) {
        refused.add(res.sentence)
        body.limitReason = `${s.extra?.name ?? 'This contractor'} is the only fit for ${job.title}; the time limit is read again before any extension.`
        res = await hm.post(`/api/submissions/${s.id}/award`, body)
        if (res.ok) reasoned++
      }
      if (!res.ok) {
        refused.add(said(res))
        return false
      }
      const d = res.json?.data ?? {}

      // Placed is not employed: where the person's pay is not on record yet,
      // the firm that holds them states it and the person says yes.
      let agreed = d.terms?.onRecord === true
      if (!agreed) agreed = await agreeTerms(job, s, Number(d.rate ?? 0))

      const link = await ctx.read.contractLink.findFirst({
        where: { sellContractId: d.contractId },
        select: { buyContractId: true },
      })
      const fact: AwardFact = {
        id: d.contractId, by: hm.key, jobId: job.id, submissionId: s.id,
        extra: {
          sellContractId: d.contractId,
          buyContractId: link?.buyContractId ?? null,
          orderId: d.order?.id ?? null,
          personId: s.personId,
          personName: s.extra?.name ?? null,
          email: s.extra?.email ?? null,
          supplierSlug: s.supplierSlug,
          supplierSeat: s.by,
          clientSlug: job.clientSlug,
          kind: s.kind ?? null,
          startDate: d.startDate ?? startDate,
          rateCents: Math.round(Number(d.rate ?? 0) * 100),
          termsOnRecord: agreed,
          notes: d.notes ?? [],
        },
      }
      ctx.world.awards.push(fact)
      job.status = d.requisitionFilled ? 'FILLED' : job.status
      return true
    }

    const termsSaid = new Said()
    let statedTerms = 0
    let personAgreed = 0
    let employeeTold = 0
    const agreeTerms = async (job: JobFact, s: SubmissionFact, billDollars: number): Promise<boolean> => {
      const firm = ctx.cast.at(s.supplierSlug, 'contracts') ?? ctx.cast.at(s.supplierSlug, 'owner')
      if (!firm) {
        termsSaid.add(`${ctx.world.companies[s.supplierSlug]?.name ?? s.supplierSlug} seats nobody who states pay`)
        return false
      }
      // What the firm pays the person: about seventy cents of every dollar billed, in whole dollars.
      const payRate = Math.max(100, Math.round(billDollars * 0.7) * 100)
      const stated = await firm.post(`/api/submissions/${s.id}/terms`, { action: 'state', engagementType: 'W2', payRate })
      if (!stated.ok) {
        termsSaid.add(said(stated))
        return false
      }
      statedTerms++
      if (stated.json?.data?.onRecord) {
        employeeTold++
        return true
      }
      const person = await workerSeat(ctx, s.extra?.email as string | undefined, s.personId)
      if (!person) {
        termsSaid.add('The person holds no seat this run can sit at, so the terms wait on them')
        return false
      }
      const yes = await person.post(`/api/submissions/${s.id}/terms`, { action: 'agree' })
      if (!yes.ok) {
        termsSaid.add(said(yes))
        return false
      }
      personAgreed++
      return yes.json?.data?.onRecord === true
    }

    // Each person to one job: offers first, then whoever is still in the running.
    const queue = withPeople
      .map((job) => ({ job, options: subsOf(job) }))
      .sort((a, b) => a.options.length - b.options.length)
    const results = await ctx.parallel(queue, async ({ job, options }) => {
      for (const s of options) {
        if (placed.has(s.personId)) continue
        placed.add(s.personId)
        if (await tryAward(job, s)) return true
        placed.delete(s.personId)
      }
      return false
    })
    const awarded = results.filter((r) => r.ok && r.value).length

    const parts = [
      `${awarded} of ${withPeople.length} jobs with candidates awarded: each wrote the contract the client pays, the supplier's own line and the order, starting ${startDate} as work already under way.`,
    ]
    parts.push(`Pay: ${statedTerms} stated by the firm that holds the person, ${personAgreed} agreed by the person from their own page, ${employeeTold} employees told rather than asked.`)
    const noBuy = ctx.world.awards.filter((a) => !a.extra?.buyContractId).length
    if (noBuy) parts.push(`${noBuy} placements have no line the firm pays from yet.`)
    const pending = ctx.world.awards.filter((a) => !a.extra?.termsOnRecord).length
    if (pending) parts.push(`${pending} placements wait on terms: ${termsSaid.toString()}.`)
    if (reasoned) parts.push(`${reasoned} went past the client's time limit with the reason written down.`)
    if (jobs.length > withPeople.length) parts.push(`${jobs.length - withPeople.length} open jobs had nobody to place.`)
    if (refused.size) parts.push(`Refused: ${refused.toString()}.`)
    return { closed: awarded, of: withPeople.length, says: parts.join(' ') }
  },
})
