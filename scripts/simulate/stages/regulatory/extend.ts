/**
 * Stage: extend. Owned by regulatory. Runs after paperwork-and-start.
 *
 * The last stage of the founder's list, 2026-10-22: contract and
 * extension. At an extension the client sends the statement of work for
 * the added months, the supplier signs it from its own seat and the
 * client countersigns; then the extension is pressed through
 * `POST /api/contracts/[id]/extend`, which reads every dated paper of the
 * person and the supplier against the new end date. Three extensions,
 * each chosen by reading the papers first, the way a contract manager
 * would look before pressing:
 *
 *   - one clean: every paper covers every added day, so it goes through;
 *   - one blocked: the person's work permit runs out before the new end,
 *     and a gap in work authorization is refused whatever the reason;
 *   - one warned: the supplier's cover runs out before the new end, so
 *     the first press is refused for a reason, and the second carries one.
 *
 * Then the table of every stage is written beside the run's report
 * (`reports/simulation-<stamp>.documents.md`), because the founder asked
 * for one table, one row per stage.
 */
import type { Actor, Res } from '../../actors'
import { defineStage, type Ctx } from '../../stage'
import { extensionPapers, type ExtensionPapers } from '@/lib/contract-clearance'
import { pdf } from './paper-files'
import { statusOf } from './hiring-papers'
import { firstSeat, walkPaper } from './registration'
import { expectAt, stagePage, stageTable, tally, writeBesideTheReport } from './stage-tally'

const iso = (d: Date) => d.toISOString().slice(0, 10)

interface Line {
  id: string
  personId: string
  personName: string
  endDate: Date | null
  supplier: { id: string; slug: string; name: string }
  client: { id: string; slug: string; name: string }
}

/** The new end date the route will compute: the old end (or today) plus whole months. Pure. */
export function newEndOf(endDate: Date | null, months: number, on: Date = new Date()): Date {
  const d = new Date(endDate ?? on)
  d.setMonth(d.getMonth() + months)
  return d
}

/** What the extension will say about the papers, read the way the route reads them. */
async function predict(ctx: Ctx, l: Line, months: number): Promise<{ papers: ExtensionPapers; checked: number; newEnd: Date }> {
  const newEnd = newEndOf(l.endDate, months)
  const select = { type: true, status: true, validFrom: true, expiresAt: true, issuedAt: true } as const
  const startsInTime = (r: { validFrom: Date | null }) => !r.validFrom || r.validFrom.getTime() <= newEnd.getTime()
  const [person, supplier] = await Promise.all([
    ctx.read.verification.findMany({ where: { personId: l.personId }, select }),
    ctx.read.verification.findMany({ where: { companyId: l.supplier.id, personId: null }, select }),
  ])
  const p = person.filter(startsInTime)
  const s = supplier.filter(startsInTime)
  const papers = extensionPapers({ personName: l.personName, supplierName: l.supplier.name, newEnd, person: p, supplier: s })
  const dated = [...p, ...s].filter((r) => r.expiresAt && ['CLEAR', 'CONDITIONAL'].includes(r.status)).length
  return { papers, checked: dated, newEnd }
}

const COVER = /INSURANCE_|GOOD_STANDING/

export default defineStage({
  name: 'extend',
  domain: 'REGULATORY',
  async run(ctx) {
    tally.names('contract and extension', 'the statement of work for the added months, countersigned; every dated paper read against the new end date', 'the supplier; the person’s and the supplier’s papers')
    const started = ctx.world.contracts.filter((c) => c.side === 'SELL').map((c) => c.id)
    const rows = await ctx.read.sellContract.findMany({
      where: { state: 'IN_PROGRESS', OR: [{ id: { in: started } }, { company: { slug: { startsWith: 'world-' } } }] },
      select: {
        id: true, personId: true, endDate: true,
        person: { select: { name: true } },
        company: { select: { id: true, slug: true, name: true } },
        clientCompany: { select: { id: true, slug: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 400,
    })
    const lines: Line[] = rows
      .filter((r) => ctx.world.companies[r.company.slug] && ctx.world.companies[r.clientCompany.slug])
      .map((r) => ({ id: r.id, personId: r.personId, personName: r.person.name, endDate: r.endDate, supplier: r.company, client: r.clientCompany }))
    // What this run started first, then the seed's.
    const fromRun = new Set(started)
    lines.sort((a, b) => Number(fromRun.has(b.id)) - Number(fromRun.has(a.id)))

    const done: string[] = []
    let extended = 0
    let tried = 0

    // ── Choose by reading first, the way a contract manager would ─────
    let clean: { l: Line; months: number } | null = null
    let blocked: { l: Line; months: number } | null = null
    let warned: { l: Line; months: number } | null = null
    for (const l of lines) {
      if (clean && blocked && warned) break
      if (!clean && statusOf(l.personId) === 'PASSPORT') {
        const r = await predict(ctx, l, 3)
        if (r.papers.outcome === 'PASS') { clean = { l, months: 3 }; continue }
      }
      if (!blocked && statusOf(l.personId) === 'WORK_PERMIT') {
        const r = await predict(ctx, l, 3)
        if (r.papers.outcome === 'BLOCK' && r.papers.items.some((i) => i.blocks && i.key === 'WORK_PERMIT')) { blocked = { l, months: 3 }; continue }
      }
      if (!warned) {
        for (const m of [3, 6, 9, 12, 15, 18]) {
          const r = await predict(ctx, l, m)
          if (r.papers.outcome === 'BLOCK') break
          if (r.papers.outcome === 'WARN' && r.papers.items.every((i) => COVER.test(i.key))) { warned = { l, months: m }; break }
        }
      }
    }

    // ── The statement of work for the added months, and the press ─────
    const sow = async (x: { l: Line; months: number }, i: number): Promise<boolean> => {
      const asker = firstSeat(ctx, x.l.client.slug, ['programme', 'compliance', 'owner'])
      const signer = firstSeat(ctx, x.l.supplier.slug, ['contracts', 'account', 'owner'])
      if (!asker || !signer) return false
      const from = new Date((x.l.endDate ?? new Date()).getTime() + 86_400_000)
      const to = newEndOf(x.l.endDate, x.months)
      const w = await walkPaper(ctx, 'contract and extension', {
        asker, answerer: signer, name: 'Statement of work', audience: 'VENDOR', sign: true,
        subjectType: 'COMPANY', subjectId: x.l.supplier.id,
        file: (n) => pdf(`${x.l.supplier.slug}-sow-extension-${x.l.id.slice(-6)}${n ? `-${n}` : ''}.pdf`, 'Statement of work', [
          `${x.l.personName} at ${x.l.client.name}, extended ${x.months} months.`, `From ${iso(from)} to ${iso(to)}.`, `Signed for ${x.l.supplier.name}.`,
        ]),
        accept: { verdict: 'ACCEPT', validFrom: iso(from), expiresAt: iso(to) },
        sendBack: i === 0 ? `The end date on the statement of work does not match the extension. It must read ${iso(to)}.` : null,
      })
      return w.ok
    }

    /** The seats that may press it: the supplier's contract manager, then the client's program manager. */
    const extenders = (l: Line): Actor[] =>
      [firstSeat(ctx, l.supplier.slug, ['contracts', 'resourcing', 'owner']), firstSeat(ctx, l.client.slug, ['programme', 'owner'])].filter(Boolean) as Actor[]

    const press = async (l: Line, body: Record<string, unknown>): Promise<{ res: Res | null; seat: Actor | null }> => {
      for (const seat of extenders(l)) {
        const res = await seat.post(`/api/contracts/${l.id}/extend`, body)
        if (res.status === 403 && /FORBIDDEN|NOT_A_PARTY/.test(String(res.json?.error?.code))) continue
        return { res, seat }
      }
      return { res: null, seat: null }
    }

    // Clean.
    if (clean) {
      tried++
      await sow(clean, 0)
      const r = await predict(ctx, clean.l, clean.months)
      let { res } = await press(clean.l, { months: clean.months })
      if (res && !res.ok && res.json?.error?.code === 'TIME_LIMIT_REASON') {
        res = (await press(clean.l, { months: clean.months, limitReason: 'The client needs the same person through the release; the time limit is watched.' })).res
      }
      if (res?.ok) {
        extended++
        tally.examined('contract and extension', r.checked)
        done.push(`${clean.l.personName} extended ${clean.months} months to ${iso(r.newEnd)}: every paper covered every added day (${r.checked} dated papers read).`)
      } else done.push(`${clean.l.personName}’s clean extension did not go through: ${res?.sentence ?? 'nobody could press it'}`)
    } else done.push('No placement this run had every paper covering three more months, so the clean extension was not tried.')

    // Blocked on a work-permit gap.
    if (blocked) {
      tried++
      await sow(blocked, 1)
      const r = await predict(ctx, blocked.l, blocked.months)
      const seat = extenders(blocked.l)[0]
      if (seat) {
        const res = await expectAt(
          ctx, 'contract and extension', seat,
          (a) => a.post(`/api/contracts/${blocked!.l.id}/extend`, { months: blocked!.months, reason: 'The client asked for three more months.' }),
          /Nobody works (past the day|on a day)/, { best: true, rule: 'a gap in work authorization stops the extension, whatever the reason' }
        )
        tally.examined('contract and extension', r.checked)
        done.push(`${blocked.l.personName}’s extension was refused, reason or not: “${res.sentence ?? `status ${res.status}`}”`)
      }
    } else done.push('Nobody on a work permit was running this run whose permit ends before three more months, so the block was not tried.')

    // Warned on a cover gap, then carried with a reason.
    if (warned) {
      tried++
      await sow(warned, 2)
      const r = await predict(ctx, warned.l, warned.months)
      const seat = extenders(warned.l)[0]
      if (seat) {
        await expectAt(ctx, 'contract and extension', seat, (a) => a.post(`/api/contracts/${warned!.l.id}/extend`, { months: warned!.months }), 'Give a reason to go ahead', { rule: 'a gap in cover needs a reason' })
        const reason = `${warned.l.supplier.name} has sent its renewal to the insurer; the certificate is chased before the old one runs out.`
        let res = await seat.post(`/api/contracts/${warned.l.id}/extend`, { months: warned.months, reason })
        if (!res.ok && res.json?.error?.code === 'TIME_LIMIT_REASON') {
          res = await seat.post(`/api/contracts/${warned.l.id}/extend`, { months: warned.months, reason, limitReason: 'The client accepts the time limit on the record for this extension.' })
        }
        tally.examined('contract and extension', r.checked)
        if (res.ok) {
          extended++
          done.push(`${warned.l.personName} extended ${warned.months} months past ${warned.l.supplier.name}’s cover, with the reason kept: “${r.papers.says}”`)
        } else done.push(`${warned.l.personName}’s extension with a reason did not go through: ${res.sentence ?? res.status}`)
      }
    } else done.push('No placement this run had only a gap in cover before a new end date, so the warning was not tried.')

    // ── The table, one row per stage, beside the run's report ──────────
    const page = stagePage(tally, [
      ...done,
      'Onboarding has no screen: a company cannot yet say what it requires. Its set is read as the shipped floor plus what its own orders add.',
      'A non-compete is asked of every W2 here. The rule table carries no row for the states that void one for workers (California among them); that is the next row to add before any client relies on it.',
    ])
    const path = writeBesideTheReport(page)
    for (const line of stageTable(tally).split('\n')) ctx.log(line)
    return {
      closed: extended,
      of: tried,
      says:
        `${extended} of ${tried} extensions went through. ${done.join(' ')} ` +
        (path ? `The table of every stage is in ${path.split('/reports/')[1] ? `reports/${path.split('/reports/')[1]}` : path}.` : 'The table of every stage could not be written beside the report.'),
    }
  },
})
