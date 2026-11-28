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
 *     client's approver a one-time link. This run has no email key, so
 *     the route hands the link back to the worker (e795f4617), and on
 *     every other such week the approver opens it — as nobody, the link
 *     being the credential — reads the week and presses Approve. On the
 *     rest, and wherever the link is refused, the approval the approver
 *     gave by email is attached as evidence, naming them. Always a named
 *     person, and the two ways are counted apart.
 *
 * A few weeks are left unsigned on purpose — the newest week of every
 * fifth placement — because a bill and an invoice receipt are refused on
 * them later, and that refusal is the rule being held.
 *
 * And the rules held on purpose: nobody signs their own hours, and a
 * flagged week is not signed without a reason.
 *
 * The signer reads each week's flag the way the Timesheets list shows it
 * and the approve route asks it (`weekFlag` in lib/timesheet-flag, on the
 * week's own contract: over the job's hours, past the last day, or marked
 * when it was filed), never from the station's own copy of the job's
 * hours. At the generated firms that copy said nothing where the route
 * flagged the week, and the founder-scale run (2026-11-01) was refused
 * 731 times "Say why this week is right before you sign it" and 188 times
 * "a week like this is signed in Etyme … so it cannot be approved by
 * email": a person reads the warning on the row before pressing Approve,
 * and never sends a flagged week, or one over the overtime line, to be
 * approved by email.
 */
import { defineStage, type Ctx, type WeekFact } from '../../stage'
import { placementsOf, seatWith, workerSeat, postForm, asNobody, todayIso, says, weekExtra, type Placement, type WeekExtra } from './book'
import { weekFlag } from '@/lib/timesheet-flag'

/**
 * Each week's flag as the list shows it and the approve route asks it: the
 * same function over the week's own contract, read through the read-only
 * connection, and whether it is over the overtime line, which the email
 * door leaves to a person signing in Etyme. Sets `flagged` on each week.
 */
async function readTheFlags(ctx: Ctx, weeks: WeekFact[]): Promise<{ overLine: Set<string>; corrected: number }> {
  const overLine = new Set<string>()
  let corrected = 0
  for (let i = 0; i < weeks.length; i += 1000) {
    const chunk = weeks.slice(i, i + 1000)
    const rows = await ctx.read.timesheet.findMany({
      where: { id: { in: chunk.map((w) => w.id) } },
      select: {
        id: true, totalHours: true, periodEnd: true, anomalyScore: true, anomalyReason: true,
        sellContract: { select: { endDate: true, overtimeAfterHours: true, requirement: { select: { hoursPerWeek: true } } } },
      },
    })
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const w of chunk) {
      const t = byId.get(w.id)
      if (!t) continue
      const hours = Number(t.totalHours)
      const flagged = weekFlag({
        hours,
        hoursPerWeek: t.sellContract.requirement?.hoursPerWeek ?? null,
        periodEnd: t.periodEnd,
        contractEnd: t.sellContract.endDate,
        anomalyScore: t.anomalyScore,
        anomalyReason: t.anomalyReason,
      }) != null
      const x = weekExtra(w)
      if (x.flagged !== flagged) corrected++
      x.flagged = flagged
      // Over the line: what the extra hours are worth is the signer's to say.
      if (hours > Math.min(40, t.sellContract.overtimeAfterHours ?? 40)) overLine.add(w.id)
    }
  }
  return { overLine, corrected }
}

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
    // Read off the rows before anybody presses anything.
    const { overLine, corrected } = await readTheFlags(ctx, weeks)

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
    let byLink = 0
    let linksMinted = 0
    let linksDelivered = 0
    let linksHandedBack = 0
    let linksOpened = 0
    let handBackSays: string | null = null
    let linkSays: string | null = null
    const linkRefusals = new Map<string, number>()
    let withReason = 0
    let missedFlags = 0
    let overtimeAnswered = 0
    let i = 0
    // Never a flagged week, or one over the overtime line: those are signed
    // in Etyme with the signer's reason and answer.
    const emailOrder = weeks
      .filter((w) => !held.has(w.id) && ['PLAIN', 'WEEKEND'].includes(weekExtra(w).variant) && !weekExtra(w).flagged && !overLine.has(w.id))
      .filter(() => i++ % 6 === 2)
      .map((w) => w.id)
    const emailWeeks = new Set(emailOrder)
    // Every other week asked for by email is answered on the link itself.
    const answeredOnLink = new Set(emailOrder.filter((_, n) => n % 2 === 0))

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
            const handed: string | undefined = link.json?.data?.link
            if (handed) {
              linksHandedBack++
              handBackSays ??= link.json?.data?.says ?? null
            }
            // The approver opens the link the worker forwarded: no sign-in,
            // the token is the credential. Reads the week, then Approve.
            const token = handed ? handed.split('?')[0].split('/').filter(Boolean).pop() : undefined
            if (token && answeredOnLink.has(w.id)) {
              const opened = await asNobody(ctx, 'GET', `/api/approve-week/${token}`)
              if (opened.ok) {
                linksOpened++
                const answered = await asNobody(ctx, 'POST', `/api/approve-week/${token}`, { answer: 'APPROVE' })
                if (answered.ok) {
                  byLink++
                  linkSays ??= answered.json?.data?.says ?? null
                  x.byLink = approver.personName
                  x.clientSignedBy = `link:${approver.personName}`
                  return
                }
                const why = answered.sentence ?? `refused with ${answered.status}`
                linkRefusals.set(why, (linkRefusals.get(why) ?? 0) + 1)
              } else {
                const why = opened.sentence ?? `refused with ${opened.status}`
                linkRefusals.set(why, (linkRefusals.get(why) ?? 0) + 1)
              }
            }
          }
          // Not answered on the link, so the approval the approver gave by
          // email is attached as evidence.
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
        // The signer read the row wrong: a station fault, said, then answered.
        missedFlags++
        body.note = FLAG_REASON
        withReason++
        res = await signer.post(`/api/timesheets/${w.id}/approve`, body)
      }
      if (res.ok) {
        inEtyme++
        if (over) overtimeAnswered++
        x.clientSignedBy = signer.key
      }
    })

    const signed = inEtyme + byLink + byEmail
    const refusedOnLink = [...linkRefusals].map(([why, n]) => `${n} × “${why}”`).join('; ')
    return {
      closed: signed,
      of: weeks.length,
      says: says([
        `${signed} of ${weeks.length} weeks signed by the client: ${inEtyme} in Etyme, ${byLink} signed by email link, the approver pressing Approve on the one-time link, and ${byEmail} attached as evidence of an approval given by email, each naming the approver.`,
        withReason ? `${withReason} flagged weeks were signed with the reason they are right, each flag read off the row as the list shows it${corrected ? ` (${corrected} weeks read differently from the job's hours the station carried)` : ''}.` : null,
        missedFlags ? `${missedFlags} weeks were refused for want of a reason the signer should have read off the row; a station fault.` : null,
        overtimeAnswered ? `${overtimeAnswered} weeks over forty hours carried the client's answer on the extra hours.` : null,
        linksMinted
          ? `${linksMinted} one-time approval links were made; ${linksDelivered} left by email and ${linksHandedBack} were handed back to the worker, because this run has no email key` +
            (handBackSays ? ` (“${handBackSays}”)` : '') +
            `. ${linksOpened} were opened by the approver with no sign-in` +
            (linkSays ? `, and Approve said “${linkSays}”` : '') +
            '.'
          : null,
        refusedOnLink ? `Refused on the link, and attached as evidence instead: ${refusedOnLink}.` : null,
        `${held.size} weeks were left waiting on the client on purpose.`,
      ]),
    }
  },
})
