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
 * The chain, first (the founder, 2026-11-08): where a bench vendor's
 * person reached the client through a sub-vendor and a prime (submit's
 * chain), the hiring manager awards the prime's submission; then the
 * prime's account manager (else its owner) awards the sub-vendor's
 * submission on the prime's own record, and the sub-vendor's awards the
 * bench vendor's on its own. Each award writes that rung's sell line and
 * the buy line beneath it, so every rung's buy line is on the record: the
 * bench vendor employs the person (its pay stated, the person's yes), the
 * sub-vendor pays the bench vendor, the prime pays the sub-vendor, the
 * client pays the prime. Each award fact carries the rungs it walked
 * (`extra.rungs`, read off the chain of submissions, `rungsWalked`), and
 * `awardsByRungs` in ./common counts them for the report.
 *
 * The rule held on purpose, once per client: a supplier never awards
 * its own candidate.
 */
import { defineStage, type AwardFact, type JobFact, type SubmissionFact } from '../../stage'
import {
  chainOf, chainWords, jobsInPlay, parentsOf, rungsWalked, said, Said, sellerDesk, sundayWeeksAgo, workerSeat, type ChainPlan,
} from './common'

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

    const awardBody = (s: { extra?: Record<string, unknown> }): Record<string, unknown> => ({
      startDate,
      workUnderWay: true,
      underWayReason: `${s.extra?.name ?? 'The contractor'} has been working since ${startDate}; the paperwork follows the work.`,
    })

    // `stateTerms` is false at the top of a chain: the prime does not employ
    // the person, so their pay is stated at the bottom rung, by their employer.
    const tryAward = async (job: JobFact, s: SubmissionFact, stateTerms = true): Promise<boolean> => {
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
      if (!agreed && stateTerms) agreed = await agreeTerms(job, s, Number(d.rate ?? 0))

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
          jobTitle: job.title,
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

    // ── The chain first: the client, then the prime, then the sub-vendor ──
    const chainSaid = new Said()
    let chainAwarded = 0
    let everyRung = 0
    const chained = new Set<string>()
    const chainJobs = withPeople
      .map((job) => ({ job, chain: chainOf(job) }))
      .filter((x): x is { job: JobFact; chain: ChainPlan } => !!x.chain?.topSubmissionId)
    await ctx.parallel(chainJobs, async ({ job, chain }) => {
      const top = ctx.world.submissions.find((x) => x.id === chain.topSubmissionId)
      if (!top || placed.has(top.personId)) return
      placed.add(top.personId)
      if (!(await tryAward(job, top, false))) {
        placed.delete(top.personId)
        chain.stopped = `${chain.client.name} could not place ${chain.personName}; see the refusals`
        chainSaid.add(chain.stopped)
        return
      }
      chained.add(job.id)
      chainAwarded++
      const fact = ctx.world.awards.find((a) => a.submissionId === top.id)!
      const lines: Array<{ rung: string; submissionId: string; sellContractId: string | null; buyContractId: string | null }> = []
      // Each firm below settles with the firm it bought from, on its own record.
      const below: Array<[ChainPlan['prime'], string | undefined, string]> = [
        [chain.prime, chain.subSubmissionId, `${chain.prime.name} buys ${chain.personName} from ${chain.sub.name}`],
        [chain.sub, chain.benchSubmissionId, `${chain.sub.name} buys ${chain.personName} from ${chain.bench.name}`],
      ]
      let whole = true
      for (const [buyer, submissionId, rung] of below) {
        const desk = sellerDesk(ctx, buyer.slug)
        if (!desk || !submissionId) {
          whole = false
          chainSaid.add(`${buyer.name} seats nobody who awards onto its own job (an account manager or the owner)`)
          break
        }
        const res = await desk.post(`/api/submissions/${submissionId}/award`, awardBody(top))
        if (!res.ok) {
          whole = false
          chainSaid.add(said(res))
          break
        }
        const link = await ctx.read.contractLink.findFirst({ where: { sellContractId: res.json?.data?.contractId }, select: { buyContractId: true } })
        lines.push({ rung, submissionId, sellContractId: res.json?.data?.contractId ?? null, buyContractId: link?.buyContractId ?? null })
        if (buyer.id === chain.sub.id) {
          // The bottom rung: the bench vendor employs the person, so it states their pay and they say yes.
          const onRecord = res.json?.data?.terms?.onRecord === true
          const agreed = onRecord || (await agreeTerms(job, {
            id: submissionId, by: desk.key, jobId: chain.subJobId ?? job.id, supplierSlug: chain.bench.slug,
            personId: top.personId, extra: { email: chain.email, name: chain.personName },
          }, Number(res.json?.data?.rate ?? 0)))
          fact.extra = { ...(fact.extra ?? {}), termsOnRecord: agreed, employerSlug: chain.bench.slug }
        }
      }
      if (whole) everyRung++
      fact.extra = {
        ...(fact.extra ?? {}),
        chain: true,
        chainWords: `${chainWords(chain)}${whole ? '' : '; not every rung below the client was awarded'}`,
        chainLines: lines,
        everyRungAwarded: whole,
      }
    })

    // Each person to one job: offers first, then whoever is still in the running.
    const queue = withPeople
      .filter((job) => !chained.has(job.id))
      .map((job) => ({ job, options: subsOf(job).filter((s) => !s.extra?.chain) }))
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
    const awarded = results.filter((r) => r.ok && r.value).length + chainAwarded

    // The rungs every award walked, read off its chain of submissions.
    const parentOf = await parentsOf(ctx, ctx.world.awards.map((a) => a.submissionId))
    for (const a of ctx.world.awards) {
      if (typeof a.extra?.rungs === 'number') continue
      a.extra = { ...(a.extra ?? {}), rungs: rungsWalked(a.submissionId, parentOf) }
    }
    const fourRungs = ctx.world.awards.filter((a) => Number(a.extra?.rungs) >= 4).length

    const parts = [
      `${awarded} of ${withPeople.length} jobs with candidates awarded: each wrote the contract the client pays, the supplier's own line and the order, starting ${startDate} as work already under way.`,
    ]
    if (chainJobs.length || fourRungs) {
      parts.push(`Through the chain: ${chainAwarded} of ${chainJobs.length} people a bench vendor put forward through a sub-vendor and a prime were awarded by the client, ${everyRung} with every rung below awarded in turn (the prime buying from the sub-vendor, the sub-vendor from the bench vendor); ${fourRungs} awards walked four rungs.`)
      if (chainSaid.size) parts.push(`The chain stopped: ${chainSaid.toString()}.`)
    }
    parts.push(`Pay: ${statedTerms} stated by the firm that holds the person, ${personAgreed} agreed by the person from their own page, ${employeeTold} employees told rather than asked.`)
    const noBuy = ctx.world.awards.filter((a) => !a.extra?.buyContractId).length
    if (noBuy) parts.push(`${noBuy} placements have no line the firm pays from yet.`)
    const pending = ctx.world.awards.filter((a) => !a.extra?.termsOnRecord).length
    // Never a colon over nothing: where no refusal was said, the placements
    // wait because nobody stated the terms yet (a chain stopped above the
    // bottom rung, where the employer states them), and that is said.
    if (pending) parts.push(termsSaid.size
      ? `${pending} placements wait on terms: ${termsSaid.toString()}.`
      : `${pending} placements wait on terms nobody has stated yet: the firm that employs the person states them at the bottom rung of its chain.`)
    if (reasoned) parts.push(`${reasoned} went past the client's time limit with the reason written down.`)
    if (jobs.length > withPeople.length) parts.push(`${jobs.length - withPeople.length} open jobs had nobody to place.`)
    if (refused.size) parts.push(`Refused: ${refused.toString()}.`)
    return { closed: awarded, of: withPeople.length, says: parts.join(' ') }
  },
})
