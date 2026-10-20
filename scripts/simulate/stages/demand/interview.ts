/**
 * Stage: interview. Owned by demand.
 *
 * For each job, the hiring manager picks the strongest one or two people
 * put forward and asks for a round (`POST /api/submissions/[id]/interviews`,
 * three times offered from tomorrow). The candidate accepts from their own
 * page (`POST /api/me/interviews/[id]/respond`); the supplier confirms
 * (`POST /api/interviews/[id]` confirm), which books the earliest time
 * everybody can do. The hiring manager then records how it went: the
 * first gets an offer, the second goes through to the next round and
 * stays in the running.
 *
 * Where the run cannot sit as the candidate, the supplier answers for
 * them, and the round records that the supplier said so.
 *
 * Two rules held on purpose, once per client: a supplier cannot say how
 * its own candidate's interview went, and a hiring manager who turns
 * somebody down has to say why.
 *
 * There is no clock override, so the outcome is recorded the same day
 * the round is booked; the report says so.
 */
import { defineStage, type JobFact, type SubmissionFact } from '../../stage'
import { jobsInPlay, said, Said, seatlessWorker, supplierSeat, workerSeat } from './common'

const HOUR = 3_600_000

function slotsFrom(i: number) {
  const base = new Date()
  base.setUTCDate(base.getUTCDate() + 1)
  base.setUTCHours(15 + (i % 3), 0, 0, 0)
  return [0, 1, 2].map((d) => {
    const start = new Date(base.getTime() + d * 24 * HOUR)
    return { start: start.toISOString(), end: new Date(start.getTime() + HOUR).toISOString() }
  })
}

export default defineStage({
  name: 'interview',
  domain: 'DEMAND',
  async run(ctx) {
    const jobs = await jobsInPlay(ctx, 'OPEN')
    if (jobs.length === 0) return { closed: 0, of: 0, says: 'No published job to interview for.' }

    // Who was put forward, from this run or, where it made none, from the seeded world.
    let subs = ctx.world.submissions
    if (subs.length === 0) {
      const rows = await ctx.read.submission.findMany({
        where: { requirementId: { in: jobs.map((j) => j.id) }, status: { in: ['SUBMITTED', 'SHORTLISTED'] } },
        select: { id: true, requirementId: true, personId: true, kind: true, fromCompany: { select: { slug: true } }, person: { select: { name: true, primaryEmail: true } } },
      })
      for (const r of rows) {
        const seat = supplierSeat(ctx, r.fromCompany.slug, r.kind === 'INTERNAL')
        if (!seat) continue
        ctx.world.submissions.push({
          id: r.id, by: seat.key, jobId: r.requirementId, supplierSlug: r.fromCompany.slug, personId: r.personId, kind: r.kind,
          extra: { name: r.person.name, email: r.person.primaryEmail, fromSeed: true },
        })
      }
      subs = ctx.world.submissions
      ctx.log(`no submissions from earlier stations; working on ${subs.length} from the seeded world`)
    }

    const refused = new Said()
    const ruled = new Set<string>()
    let rounds = 0
    let booked = 0
    let selfAnswered = 0
    let offers = 0
    let advanced = 0
    let jobsWithOffer = 0
    let triedSeatless = false
    let seatless: string | null = null
    let forThem = 0

    // Who gets the offer is settled before the rounds, one person to one job:
    // a hiring manager does not offer a job to somebody another job of the
    // same run already has. The jobs with the fewest people choose first.
    const placedAlready = new Set(ctx.world.awards.map((a) => String(a.extra?.personId ?? '')))
    const offerTo = new Set<string>()
    const byFit = (a: SubmissionFact, b: SubmissionFact) => Number(b.extra?.fit ?? 0) - Number(a.extra?.fit ?? 0)
    const pools = jobs
      .map((job) => ({ job, pool: subs.filter((s) => s.jobId === job.id && !placedAlready.has(s.personId)).sort(byFit) }))
      .filter((p) => p.pool.length > 0)
      .sort((a, b) => a.pool.length - b.pool.length)
    const plan = pools.map(({ job, pool }) => {
      const first = pool.find((s) => !offerTo.has(s.personId)) ?? null
      if (first) offerTo.add(first.personId)
      const second = pool.find((s) => s !== first && !offerTo.has(s.personId)) ?? pool.find((s) => s !== first) ?? null
      return { job, picks: [first, second].filter((x): x is SubmissionFact => x !== null), offerable: first !== null }
    })
    const nobodyFree = plan.filter((p) => !p.offerable).length

    await ctx.parallel(plan, async ({ job, picks, offerable }: { job: JobFact; picks: SubmissionFact[]; offerable: boolean }, n: number) => {
      const hm = (job.by !== 'seed' ? ctx.cast.seat(job.by) : null) ?? ctx.cast.at(job.clientSlug, 'hiring')
      if (!hm) {
        refused.add(`${ctx.world.companies[job.clientSlug]?.name ?? job.clientSlug} seats no hiring manager`)
        return
      }
      let offered = false
      for (const [k, sub] of picks.entries()) {
        const asked = await hm.post(`/api/submissions/${sub.id}/interviews`, {
          slots: slotsFrom(n + k), mode: 'VIDEO', stage: 'TECHNICAL', durationMins: 60,
          interviewers: [hm.name],
        })
        if (!asked.ok) {
          refused.add(said(asked))
          continue
        }
        rounds++
        const interviewId: string = asked.json?.data?.id
        const supplier = ctx.cast.seat(sub.by)

        // The candidate answers from their own page; else the supplier answers for them.
        const person = await workerSeat(ctx, sub.extra?.email as string | undefined, sub.personId)
        let candidateSaid = false
        if (!person && !triedSeatless) {
          // Once a run: a candidate who is only a profile on a bench tries their own page.
          triedSeatless = true
          const ghost = seatlessWorker(ctx, sub.extra?.email as string | undefined)
          if (ghost) {
            const r = await ghost.post(`/api/me/interviews/${interviewId}/respond`, { action: 'ACCEPT' })
            if (r.ok) candidateSaid = true
            else seatless = said(r)
          }
        }
        if (person) {
          const yes = await person.post(`/api/me/interviews/${interviewId}/respond`, { action: 'ACCEPT' })
          if (yes.ok) {
            candidateSaid = true
            selfAnswered++
          } else refused.add(said(yes))
        }
        const confirm = await supplier.post(`/api/interviews/${interviewId}`, {
          action: 'confirm', ...(candidateSaid ? {} : { forConsultant: true }),
        })
        if (!candidateSaid) forThem++
        if (!confirm.ok) {
          refused.add(said(confirm))
          continue
        }
        if (confirm.json?.data?.state === 'CONFIRMED') booked++

        // The rules, once per client, on the first round booked there.
        if (!ruled.has(job.clientSlug)) {
          ruled.add(job.clientSlug)
          await ctx.expectRefusal(
            supplier,
            (a) => a.post(`/api/interviews/${interviewId}`, { action: 'outcome', outcome: 'OFFER' }),
            'Only the company that ran the interview'
          )
          await ctx.expectRefusal(
            hm,
            (a) => a.post(`/api/interviews/${interviewId}`, { action: 'outcome', outcome: 'REJECT' }),
            'Say why they are out'
          )
        }

        const outcome = offered || !offerable ? 'ADVANCE' : 'OFFER'
        const done = await hm.post(`/api/interviews/${interviewId}`, {
          action: 'outcome', outcome,
          feedback: outcome === 'OFFER'
            ? `Strong on ${job.skills.slice(0, 2).join(' and ') || job.title}; offer made.`
            : 'Good round; kept in the running behind the offer.',
        })
        if (!done.ok) {
          refused.add(said(done))
          continue
        }
        sub.extra = { ...(sub.extra ?? {}), interviewId, outcome }
        if (outcome === 'OFFER') {
          offered = true
          offers++
        } else advanced++
      }
      if (offered) jobsWithOffer++
    })

    const parts = [
      `${jobsWithOffer} of ${plan.length} jobs with candidates have an offer: ${rounds} rounds asked for, ${booked} booked with all three sides, ${selfAnswered} candidates answered from their own page; ${offers} offers and ${advanced} kept in the running.`,
      'Outcomes are recorded the day the round is booked, because the run has no clock.',
    ]
    if (nobodyFree) parts.push(`${nobodyFree} jobs saw only people another job had already offered, so their rounds end in "through to the next round".`)
    if (forThem) parts.push(`${forThem} candidates hold no seat of their own, so their supplier answered for them${seatless ? `; one tried their own page and was told: "${seatless}"` : ''}.`)
    if (jobs.length > plan.length) parts.push(`${jobs.length - plan.length} jobs had nobody put forward.`)
    if (refused.size) parts.push(`Refused: ${refused.toString()}.`)
    return { closed: jobsWithOffer, of: plan.length, says: parts.join(' ') }
  },
})
