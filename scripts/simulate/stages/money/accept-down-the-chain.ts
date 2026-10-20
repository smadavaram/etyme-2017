/**
 * Stage: accept-down-the-chain. Owned by money.
 *
 * Once the client has signed a week, it travels down the chain and each
 * firm below accepts the same week in its turn, through the same door the
 * client signed at (`POST /api/timesheets/:id/approve`): the firm in the
 * middle accepts what it pays its supplier for, and the worker's employer
 * accepts last, which is what it pays the worker on. Never a second copy
 * of the week, and never before the firm above has signed.
 *
 * Fewer hours are sometimes accepted than were worked, with the reason,
 * because the trade does that:
 *   - in a chain, the firm in the middle accepts three hours fewer of a
 *     long week from its supplier, and the supplier's bill then prices
 *     what it accepted, the cut taken off overtime first;
 *   - on a direct placement, the employer accepts two hours fewer of a
 *     long week, and the worker's pay takes the cut off ordinary hours
 *     first, so the worker keeps their overtime.
 *
 * And the rule held on purpose: a firm that tries to accept a week the
 * client has not signed is told who it is waiting on.
 */
import { defineStage } from '../../stage'
import { placementsOf, seatWith, says, weekExtra } from './book'

const MIDDLE_CUT = 'Three of these hours were not authorized on our side of the order.'
const EMPLOYER_CUT = 'Two of these hours were not approved before they were worked.'
const FLAGGED = 'The client signed these hours with the reason; the extra hours were for the release.'

export default defineStage({
  name: 'accept-down-the-chain',
  domain: 'MONEY',
  async run(ctx) {
    const { placements } = await placementsOf(ctx)
    const signed = ctx.world.weeks.filter((w) => weekExtra(w)?.clientSignedBy)
    if (signed.length === 0) return { closed: 0, says: 'No week has been signed by a client yet, so nothing travels down the chain.' }

    // ── The rule, held on purpose ──────────────────────────────────────
    const waiting = ctx.world.weeks.find((w) => weekExtra(w)?.unsigned)
    const pw = waiting && placements.find((p) => p.id === waiting.contractId)
    if (waiting && pw) {
      const employer = await seatWith(ctx, pw.bottom.sellerId, 'timesheets.approve', [pw.personId])
      if (employer) {
        await ctx.expectRefusal(employer, (a) => a.post(`/api/timesheets/${waiting.id}/approve`, {}), 'has not signed this week yet')
      }
    }

    let fullyAccepted = 0
    let acceptances = 0
    let middleCuts = 0
    let employerCuts = 0
    let stopped = 0
    const soloStuck = new Set<string>()
    await ctx.parallel(signed, async (w) => {
      const p = placements.find((x) => x.id === w.contractId)
      if (!p) return
      const x = weekExtra(w)
      x.accepted ??= {}
      const long = x.variant === 'OVER' || x.variant === 'FORTY_FOUR'
      // Top down: every seller on the ladder accepts, the employer last.
      for (let i = 0; i < p.ladder.length; i++) {
        const rung = p.ladder[i]
        const last = i === p.ladder.length - 1
        let seat = await seatWith(ctx, rung.sellerId, 'timesheets.approve', [p.personId])
        // A one-person firm: the only seat that accepts for the employer is
        // the worker's own. She tries, as she would, and the run records
        // what the route says.
        if (!seat) {
          const own = await seatWith(ctx, rung.sellerId, 'timesheets.approve')
          if (own && own.spec.personId === p.personId) {
            const res = await own.post(`/api/timesheets/${w.id}/approve`, {})
            if (res.ok) {
              acceptances++
              x.accepted[rung.sellerId] = w.hours
              continue
            }
            soloStuck.add(p.personName)
          }
          stopped++
          return
        }
        const body: Record<string, unknown> = {}
        // A flagged week is signed with the reason it is right at every
        // rung, not only at the top: each signature carries its own.
        if (x.flagged) body.note = FLAGGED
        if (long && !last && i === 0) {
          body.acceptedHours = w.hours - 3
          body.note = MIDDLE_CUT
        } else if (long && last && p.ladder.length === 1) {
          body.acceptedHours = w.hours - 2
          body.note = EMPLOYER_CUT
        }
        const res = await seat.post(`/api/timesheets/${w.id}/approve`, body)
        if (!res.ok) {
          stopped++
          return
        }
        acceptances++
        x.accepted[rung.sellerId] = (body.acceptedHours as number | undefined) ?? w.hours
        if (body.acceptedHours != null) {
          if (last) employerCuts++
          else middleCuts++
        }
      }
      w.status = 'APPROVED'
      fullyAccepted++
    })

    return {
      closed: fullyAccepted,
      of: signed.length,
      says: says([
        `${fullyAccepted} of ${signed.length} signed weeks accepted by every firm below the client, ${acceptances} acceptances in all, each in its turn.`,
        middleCuts ? `${middleCuts} long weeks were accepted three hours short by the firm in the middle of a chain, with the reason.` : null,
        employerCuts ? `${employerCuts} long weeks were accepted two hours short by the employer on a direct placement, with the reason.` : null,
        stopped ? `${stopped} weeks stopped part way down the chain; the refusals are in the lessons.` : null,
        soloStuck.size ? `A one-person firm cannot accept its own owner's week at the employer's rung, because the only person there is the worker: ${[...soloStuck].join(', ')}.` : null,
      ]),
    }
  },
})
