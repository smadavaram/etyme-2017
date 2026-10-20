/**
 * Stage: file-weeks. Owned by money.
 *
 * Each worker files their own weeks, through the worker's door
 * (`POST /api/timesheets`, then `POST /api/timesheets/:id/submit`), on the
 * rung of the firm that employs them. Real past Sunday-to-Saturday weeks
 * the worker has not filed yet, newest first, `--weeks` of them each.
 *
 * Most weeks are forty hours, Monday to Friday. Some are not, because the
 * trade is not:
 *   - a share run over forty (nine-hour days, 45 hours), which the client
 *     decides the overtime on when it signs;
 *   - a 44-hour week on a 40-hour job, filed without fuss and flagged for
 *     the signer, who gives a reason (WARN, capture a reason, proceed);
 *   - a weekend day worked in place of a Friday, which is normal and
 *     never questioned for being on a weekend.
 *
 * And the rules held on purpose: the worker's employer may not file the
 * week for them, and a week after the placement's last day is refused.
 */
import { defineStage, type WeekFact } from '../../stage'
import { placementsOf, openWeeksOf, workerSeat, seatWith, keyedByEmail, addDays, sundayOf, todayIso, says, type Placement, type WeekExtra } from './book'

type Variant = WeekExtra['variant']

/** Which shape this week takes, spread evenly and the same every run. */
function variantOf(k: number): Variant {
  if (k % 7 === 3) return 'OVER'
  if (k % 11 === 6) return 'FORTY_FOUR'
  if (k % 9 === 5) return 'WEEKEND'
  return 'PLAIN'
}

/** The days of a week as the worker types them. Sunday is day 0. */
function daysFor(sunday: string, v: Variant): Record<string, number> {
  const d = (i: number) => addDays(sunday, i)
  switch (v) {
    case 'OVER': // nine-hour days
      return { [d(1)]: 9, [d(2)]: 9, [d(3)]: 9, [d(4)]: 9, [d(5)]: 9 }
    case 'FORTY_FOUR':
      return { [d(1)]: 9, [d(2)]: 9, [d(3)]: 9, [d(4)]: 9, [d(5)]: 8 }
    case 'WEEKEND': // Saturday worked for the Friday off: still forty
      return { [d(1)]: 8, [d(2)]: 8, [d(3)]: 8, [d(4)]: 8, [d(6)]: 8 }
    default:
      return { [d(1)]: 8, [d(2)]: 8, [d(3)]: 8, [d(4)]: 8, [d(5)]: 8 }
  }
}

export default defineStage({
  name: 'file-weeks',
  domain: 'MONEY',
  async run(ctx) {
    const { placements, endedUnbilled, unseated } = await placementsOf(ctx)
    if (placements.length === 0) return { closed: 0, says: 'No live placement in this world to file weeks on.' }

    // Every (placement, week) the run will file, planned from what the
    // worker can see on their own page.
    const plan: { p: Placement; sunday: string; variant: Variant }[] = []
    let noSeat = 0
    let k = 0
    for (const p of placements) {
      if (!workerSeat(ctx, p)) {
        noSeat++
        continue
      }
      // A worker the server will not seat tries once, as a person would,
      // and is not sent back eleven more times to read the same sentence.
      const weeks = await openWeeksOf(ctx, p, unseated.includes(p.personName) ? 1 : ctx.options.weeks)
      // A supplier that invoices by email had no long weeks in this run:
      // its invoice is keyed in by hand, and a clerk types forty-hour
      // weeks at the agreed rate rather than guessing an overtime price.
      const keyed = keyedByEmail(placements, p)
      for (const sunday of weeks) {
        const v = variantOf(k++)
        plan.push({ p, sunday, variant: keyed && (v === 'OVER' || v === 'FORTY_FOUR') ? 'PLAIN' : v })
      }
    }

    let filed = 0
    let hours = 0
    const byVariant: Record<string, number> = {}
    await ctx.parallel(plan, async ({ p, sunday, variant }) => {
      const worker = workerSeat(ctx, p)!
      const days = daysFor(sunday, variant)
      const periodEnd = addDays(sunday, 6)
      const made = await worker.post('/api/timesheets', { sellContractId: p.id, periodStart: sunday, periodEnd, days })
      const sheet = made.json?.data?.timesheet
      if (!made.ok || !sheet?.id) return
      const sent = await worker.post(`/api/timesheets/${sheet.id}/submit`)
      if (!sent.ok) return
      const total = Object.values(days).reduce((a, b) => a + b, 0)
      const extra: WeekExtra = {
        placementId: p.id, periodEnd, variant, days,
        flagged: p.hoursPerWeek != null && total > p.hoursPerWeek,
      }
      const fact: WeekFact = {
        id: sheet.id, by: worker.key, contractId: p.id, personId: p.personId,
        weekStart: sunday, hours: total, status: 'SUBMITTED', extra: extra as unknown as Record<string, unknown>,
      }
      ctx.world.weeks.push(fact)
      filed++
      hours += total
      byVariant[variant] = (byVariant[variant] ?? 0) + 1
    })

    // ── The rules, held on purpose ──────────────────────────────────────
    const sample = placements.find((p) => workerSeat(ctx, p))
    if (sample) {
      // The employer files for the worker: refused, whoever they are.
      const employer = await seatWith(ctx, sample.bottom.sellerId, 'timesheets.read', [sample.personId])
      if (employer) {
        const sunday = addDays(sundayOf(todayIso()), -7)
        await ctx.expectRefusal(
          employer,
          (a) => a.post('/api/timesheets', {
            sellContractId: sample.id, periodStart: sunday, periodEnd: addDays(sunday, 6),
            days: { [addDays(sunday, 1)]: 8 },
          }),
          'can file their week'
        )
      }
    }
    // A week after the placement's last day: refused.
    const ended = endedUnbilled.find((p) => p.bottom.endDate && workerSeat(ctx, p))
    if (ended) {
      const sunday = sundayOf(addDays(ended.bottom.endDate!, 7))
      await ctx.expectRefusal(
        workerSeat(ctx, ended)!,
        (a) => a.post('/api/timesheets', {
          sellContractId: ended.id, periodStart: sunday, periodEnd: addDays(sunday, 6),
          days: { [addDays(sunday, 1)]: 8, [addDays(sunday, 2)]: 8 },
        }),
        /after your placement ended|not taking hours/
      )
    }

    return {
      closed: filed,
      of: plan.length,
      says: says([
        `${filed} of ${plan.length} weeks filed and sent by the workers themselves, ${hours.toLocaleString('en-US')} hours,`,
        `across ${new Set(ctx.world.weeks.map((w) => w.contractId)).size} placements:`,
        `${byVariant.PLAIN ?? 0} plain forty-hour weeks, ${byVariant.OVER ?? 0} at 45 hours, ${byVariant.FORTY_FOUR ?? 0} at 44 hours,`,
        `${byVariant.WEEKEND ?? 0} with a Saturday worked for a Friday.`,
        noSeat ? `${noSeat} placements have a worker nobody can sit as, so nothing was filed on them.` : null,
      ]),
    }
  },
})
