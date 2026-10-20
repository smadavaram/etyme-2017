/**
 * Stage: approve-jobs. Owned by demand.
 *
 * A job request that did not publish itself waits on people, rank by
 * rank (lib/requisition-approval): HR reads the role and Procurement
 * audits the suppliers alongside each other at one rank, then whoever
 * signs the money — the cost center's owner, and the approver where the
 * money is over their limit. Each of them finds it on their own queue
 * and says yes through `POST /api/requisitions/[id]/approve`, as
 * themselves. When the last rank says yes the job is published.
 *
 * The rule held on purpose, once per client: whoever raised a job
 * cannot approve it ("nobody signs their own"), and the route says so.
 *
 * The queue is read the way the approver reads it — their own pending
 * rows — through the read-only connection; every decision goes through
 * the route.
 */
import { defineStage, type JobFact } from '../../stage'
import { jobsInPlay, said, seatOfPerson, Said } from './common'

export default defineStage({
  name: 'approve-jobs',
  domain: 'DEMAND',
  async run(ctx) {
    const waiting = await jobsInPlay(ctx, 'WAITING')
    if (waiting.length === 0) {
      const open = ctx.world.jobs.filter((j) => j.status === 'OPEN').length
      return { closed: 0, of: 0, says: `No job request waits on approval; ${open} are published already.` }
    }

    // The rule first, once per client: the hiring manager who raised it tries to say yes.
    const tried = new Set<string>()
    for (const job of waiting) {
      if (tried.has(job.clientSlug)) continue
      const raiser = job.by !== 'seed' ? ctx.cast.seat(job.by) : ctx.cast.at(job.clientSlug, 'hiring')
      if (!raiser) continue
      tried.add(job.clientSlug)
      await ctx.expectRefusal(
        raiser,
        (a) => a.post(`/api/requisitions/${job.id}/approve`, { action: 'approve' }),
        'not yours to decide'
      )
    }

    const noSeat = new Said()
    const refused = new Said()
    let published = 0
    let decisions = 0

    await ctx.parallel(waiting, async (job: JobFact) => {
      // At most one pass per rank; a chain is never longer than a few ranks.
      for (let pass = 0; pass < 6; pass++) {
        const pending = await ctx.read.requirementApproval.findMany({
          where: { requirementId: job.id, outcome: 'PENDING' },
          select: { id: true, rank: true, stage: true, approverId: true },
          orderBy: { rank: 'asc' },
        })
        if (pending.length === 0) break
        const lowest = pending[0].rank
        const now = pending.filter((p) => p.rank === lowest)
        const clientId = ctx.world.companies[job.clientSlug]?.id
        let moved = false
        for (const p of now) {
          if (!p.approverId) {
            noSeat.add(`A ${p.stage.toLowerCase()} approval on ${job.title} names nobody`)
            continue
          }
          const seat = seatOfPerson(ctx, p.approverId, clientId)
          if (!seat) {
            noSeat.add(`The approver of a ${p.stage.toLowerCase()} rank holds no seat this run can sit at`)
            continue
          }
          const res = await seat.post(`/api/requisitions/${job.id}/approve`, {
            action: 'approve',
            reason: `Approved by ${seat.name}: within the program's plan for this work.`,
          })
          decisions++
          if (!res.ok) {
            refused.add(said(res))
            continue
          }
          moved = true
          const d = res.json?.data
          if (d) {
            job.status = d.status ?? job.status
            job.approvalState = d.approvalState ?? job.approvalState
          }
        }
        if (!moved) break
      }
      if (job.status === 'OPEN') published++
    })

    const stuck = waiting.length - published
    const parts = [
      `${published} of ${waiting.length} job requests approved and published, after ${decisions} approvals given by the people they were routed to.`,
    ]
    if (stuck > 0) parts.push(`${stuck} still wait.`)
    if (noSeat.size) parts.push(`Not approvable this run: ${noSeat.toString()}.`)
    if (refused.size) parts.push(`Refused: ${refused.toString()}.`)
    return { closed: published, of: waiting.length, says: parts.join(' ') }
  },
})
