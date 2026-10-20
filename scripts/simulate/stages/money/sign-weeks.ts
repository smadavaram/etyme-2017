/**
 * Stage: sign-weeks. Owned by money.
 *
 * The client signs first. Each week the workers sent is signed at the top
 * of its chain, by the person at the end client who signs hours
 * (`POST /api/timesheets/:id/approve`), and three things are said as a
 * person says them:
 *   - a flagged week (over the role's hours) carries the reason it is
 *     right, which rides on the signature;
 *   - a week over the overtime line carries the client's answer on the
 *     extra hours, a premium or the same rate, with why;
 *   - some weeks are approved by email instead: the worker sends the
 *     client's approver a one-time link, and where the link cannot be
 *     opened the approval the approver gave by email is attached as
 *     evidence, naming them. Always a named person.
 *
 * A few weeks are left unsigned on purpose — the newest week of every
 * fifth placement — because a bill and an invoice receipt are refused on
 * them later, and that refusal is the rule being held.
 *
 * And the rules held on purpose: nobody signs their own hours, and a
 * flagged week is not signed without a reason.
 */
import { defineStage, type Ctx, type WeekFact } from '../../stage'
import { placementsOf, seatWith, workerSeat, postForm, todayIso, says, weekExtra, type Placement, type WeekExtra } from './book'

const FLAG_REASON = 'Agreed with the hiring manager: the release needed the extra hours this week.'
const OT_REASON = 'Overtime agreed in advance for the release weekend.'

/** Weeks the run filed; where file-weeks did not run, the weeks the seed left waiting. */
async function weeksToSign(ctx: Ctx, placements: Placement[]): Promise<WeekFact[]> {
  if (ctx.world.weeks.length > 0) return ctx.world.weeks
  const waiting = await ctx.read.timesheet.findMany({
    where: { sellContractId: { in: placements.map((p) => p.id) }, status: 'SUBMITTED', clientApprovedAt: null },
    select: { id: true, sellContractId: true, personId: true, periodStart: true, periodEnd: true, totalHours: true, days: true },
  })
  for (const t of waiting) {
    const p = placements.find((x) => x.id === t.sellContractId)!
    const total = Number(t.totalHours)
    const extra: WeekExtra = {
      placementId: p.id, periodEnd: t.periodEnd.toISOString().slice(0, 10),
      variant: total > 40 ? 'OVER' : 'PLAIN', days: (t.days ?? {}) as Record<string, number>,
      flagged: p.hoursPerWeek != null && total > p.hoursPerWeek,
    }
    ctx.world.weeks.push({
      id: t.id, by: 'seed', contractId: p.id, personId: t.personId, weekStart: t.periodStart.toISOString().slice(0, 10),
      hours: total, status: 'SUBMITTED', extra: extra as unknown as Record<string, unknown>,
    })
  }
  return ctx.world.weeks
}

export default defineStage({
  name: 'sign-weeks',
  domain: 'MONEY',
  async run(ctx) {
    const { placements } = await placementsOf(ctx)
    const weeks = (await weeksToSign(ctx, placements)).filter((w) => w.status === 'SUBMITTED')
    if (weeks.length === 0) return { closed: 0, says: 'No week is waiting for a client to sign.' }

    // The newest week of every fifth placement waits on the client.
    const held = new Set<string>()
    placements.forEach((p, i) => {
      if (i % 5 !== 4) return
      const mine = weeks.filter((w) => w.contractId === p.id).sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      if (mine[0]) held.add(mine[0].id)
    })
    for (const w of weeks) if (held.has(w.id)) weekExtra(w).unsigned = true

    // ── The rules, held on purpose, before anything is signed ──────────
    const first = weeks.find((w) => !held.has(w.id))
    const p0 = first && placements.find((p) => p.id === first.contractId)
    const w0 = p0 && workerSeat(ctx, p0)
    if (first && w0) {
      // A worker who also holds a seat at the firm is turned away one door
      // earlier, by the seat's own reach; either way nobody signs their own.
      await ctx.expectRefusal(
        w0,
        (a) => a.post(`/api/timesheets/${first.id}/approve`, {}),
        /Nobody approves their own hours|not part of your seat/
      )
    }
    const flagged = weeks.find((w) => weekExtra(w).flagged && !held.has(w.id))
    if (flagged) {
      const p = placements.find((x) => x.id === flagged.contractId)!
      const signer = await seatWith(ctx, p.clientId, 'timesheets.approve', [p.personId])
      if (signer) {
        await ctx.expectRefusal(signer, (a) => a.post(`/api/timesheets/${flagged.id}/approve`, {}), 'Say why this week is right')
      }
    }

    let inEtyme = 0
    let byEmail = 0
    let linksMinted = 0
    let linksDelivered = 0
    let withReason = 0
    let overtimeAnswered = 0
    let i = 0
    const emailWeeks = new Set(
      weeks
        .filter((w) => !held.has(w.id) && ['PLAIN', 'WEEKEND'].includes(weekExtra(w).variant))
        .filter(() => i++ % 6 === 2)
        .map((w) => w.id)
    )

    await ctx.parallel(weeks.filter((w) => !held.has(w.id)), async (w) => {
      const p = placements.find((x) => x.id === w.contractId)
      if (!p) return
      const x = weekExtra(w)

      if (emailWeeks.has(w.id)) {
        // The worker asks the client's approver, who is somebody at the
        // client other than whoever signs hours in Etyme.
        const signer = await seatWith(ctx, p.clientId, 'timesheets.approve', [p.personId])
        const approver =
          ctx.cast.seats.find((s) => s.company?.id === p.clientId && s.key.endsWith('/programme')) ??
          ctx.cast.seats.find((s) => s.company?.id === p.clientId && s.door && 'as' in s.door && s.personId !== signer?.spec.personId)
        const worker = workerSeat(ctx, p)
        if (approver && worker) {
          const link = await worker.post('/api/week-approvals', {
            timesheetId: w.id, how: 'LINK', approverName: approver.personName, approverEmail: approver.email,
          })
          if (link.ok) {
            linksMinted++
            if (link.json?.data?.delivery?.state === 'SENT') linksDelivered++
          }
          // The link went nowhere a person could open it, so the approval
          // the approver gave by email is attached as evidence.
          const form = new FormData()
          form.set('timesheetId', w.id)
          form.set('how', 'EVIDENCE')
          form.set('approverName', approver.personName)
          form.set('approverEmail', approver.email)
          form.set('kind', 'EMAIL')
          form.set('approvedOn', todayIso())
          form.set(
            'pastedText',
            `From: ${approver.personName} <${approver.email}>\nSubject: Hours for the week of ${w.weekStart}\n\n` +
              `${p.personName}'s ${w.hours} hours for the week of ${w.weekStart} are approved.\n`
          )
          const ev = await postForm(ctx, worker, '/api/week-approvals', form)
          if (ev.ok) {
            byEmail++
            x.byEmail = approver.personName
            x.clientSignedBy = `email:${approver.personName}`
            return
          }
        }
        // Falls through to the signer in Etyme.
      }

      const signer = await seatWith(ctx, p.clientId, 'timesheets.approve', [p.personId])
      if (!signer) return
      const over = x.variant === 'OVER' || x.variant === 'FORTY_FOUR'
      const body: Record<string, unknown> = {}
      if (x.flagged) {
        body.note = FLAG_REASON
        withReason++
      }
      if (over) {
        // Half paid at a premium, half at the same rate, each with why.
        const premium = w.weekStart.charCodeAt(9) % 2 === 0
        body.overtime = [{ weekOf: w.weekStart, treatment: premium ? 'PREMIUM' : 'SAME_RATE', reason: OT_REASON }]
      }
      let res = await signer.post(`/api/timesheets/${w.id}/approve`, body)
      // A line the signer could not see from the list: the route names the
      // weeks still undecided, and the signer answers them.
      if (!res.ok && res.json?.error?.code === 'OVERTIME_UNDECIDED' && Array.isArray(res.json.error.weeks)) {
        body.overtime = res.json.error.weeks.map((q: { weekOf: string }) => ({ weekOf: q.weekOf, treatment: 'PREMIUM', reason: OT_REASON }))
        res = await signer.post(`/api/timesheets/${w.id}/approve`, body)
      }
      if (!res.ok && res.json?.error?.code === 'FLAG_NEEDS_REASON') {
        body.note = FLAG_REASON
        res = await signer.post(`/api/timesheets/${w.id}/approve`, body)
      }
      if (res.ok) {
        inEtyme++
        if (over) overtimeAnswered++
        x.clientSignedBy = signer.key
      }
    })

    const signed = inEtyme + byEmail
    return {
      closed: signed,
      of: weeks.length,
      says: says([
        `${signed} of ${weeks.length} weeks signed by the client: ${inEtyme} in Etyme and ${byEmail} by an approval given by email and attached as evidence, each naming the approver.`,
        withReason ? `${withReason} flagged weeks were signed with the reason they are right.` : null,
        overtimeAnswered ? `${overtimeAnswered} weeks over forty hours carried the client's answer on the extra hours.` : null,
        linksMinted ? `${linksMinted} one-time approval links were made; ${linksDelivered} left by email, because this run has no email key, and the route does not hand the link back to whoever asked for it, so nobody could open one.` : null,
        `${held.size} weeks were left waiting on the client on purpose.`,
      ]),
    }
  },
})
