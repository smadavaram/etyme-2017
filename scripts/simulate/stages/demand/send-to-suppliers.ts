/**
 * Stage: send-to-suppliers. Owned by demand.
 *
 * The program manager (Procurement where the client has no program
 * manager) reads the client's supplier list on the Suppliers page
 * (`GET /api/suppliers`) and sends each published job to every supplier
 * on it that is not blocked or on probation, through
 * `POST /api/requisitions/[id]/distribute`, with each supplier's rate
 * band on its own invitation — never on the job.
 *
 * Then the chain, top down (the founder, 2026-11-08): on at least
 * `--chain-hires` jobs (20) the client's job goes one rung further and
 * then another. A prime the client sent it to writes its own record of
 * the job (`POST /api/requirements`, the end client named, no band on
 * it) and sends it down to a sub-vendor it buys from; the sub-vendor does
 * the same to a bench vendor it buys from. Each send is the release route,
 * from the desk `who-sends.ts` names at a firm that sells (the account
 * manager, else the owner), with that rung's own band on the invitation.
 * Chains are read off the register (`pickChains` in ./common); where it
 * holds fewer than asked for, the station walks what it has and says so.
 *
 * Two rules held on purpose, once per client:
 *   - a hiring manager raises a job and does not choose who sees it;
 *   - a firm the client reaches only through a prime is the prime's
 *     sub-vendor, and a job cannot be sent to it.
 */
import { defineStage, type JobFact } from '../../stage'
import {
  bandBelow, chainHiresWanted, chainWords, clientSeat, jobsInPlay, pickChains, said, Said, sellerDesk, sellsToFrom,
  type ChainFirmFacts, type ChainPlan,
} from './common'
import type { Ctx } from '../../stage'

interface SupplierRow { companyId: string; name: string; tier: string | null; blocked: boolean }

export default defineStage({
  name: 'send-to-suppliers',
  domain: 'DEMAND',
  async run(ctx) {
    const jobs = await jobsInPlay(ctx, 'OPEN')
    if (jobs.length === 0) return { closed: 0, of: 0, says: 'No published job to send.' }

    const slugs = [...new Set(jobs.map((j) => j.clientSlug))]
    const lists = new Map<string, SupplierRow[]>()
    const refused = new Said()

    for (const slug of slugs) {
      const pm = clientSeat(ctx, slug, 'programme', 'procurement')
      if (!pm) {
        refused.add(`${ctx.world.companies[slug]?.name ?? slug} seats nobody who sends jobs to suppliers`)
        continue
      }
      const res = await pm.get('/api/suppliers')
      if (!res.ok) {
        refused.add(said(res))
        continue
      }
      const rows: SupplierRow[] = (res.json?.data?.suppliers ?? []).filter(
        (r: SupplierRow) => !r.blocked && r.tier !== 'PROBATION'
      )
      lists.set(slug, rows)
    }

    // The rules, once per client, on the first job of each.
    for (const slug of slugs) {
      const job = jobs.find((j) => j.clientSlug === slug)!
      const list = lists.get(slug) ?? []
      const hm = ctx.cast.at(slug, 'hiring')
      if (hm && list[0]) {
        await ctx.expectRefusal(
          hm,
          (a) => a.post(`/api/requisitions/${job.id}/distribute`, { vendors: [{ companyId: list[0].companyId }] }),
          "program manager's call"
        )
      }
      const pm = clientSeat(ctx, slug, 'programme', 'procurement')
      const clientId = ctx.world.companies[slug]?.id
      if (pm && clientId) {
        // A firm this client has only ever bought through a prime: the prime's sub-vendor.
        const below = await ctx.read.sellContract.findMany({
          where: { endClientCompanyId: clientId, clientCompanyId: { not: clientId } },
          select: { companyId: true },
          distinct: ['companyId'],
        })
        const direct = new Set(list.map((r) => r.companyId))
        const sub = below.map((b) => b.companyId).find((id) => !direct.has(id) && id !== clientId)
        if (sub) {
          await ctx.expectRefusal(
            pm,
            (a) => a.post(`/api/requisitions/${job.id}/distribute`, { vendors: [{ companyId: sub }] }),
            'not a supplier of'
          )
        }
      }
    }

    let sentJobs = 0
    let invitations = 0
    await ctx.parallel(jobs, async (job: JobFact) => {
      const list = lists.get(job.clientSlug) ?? []
      const pm = clientSeat(ctx, job.clientSlug, 'programme', 'procurement')
      if (!pm || list.length === 0) return
      const res = await pm.post(`/api/requisitions/${job.id}/distribute`, {
        vendors: list.map((r) => ({
          companyId: r.companyId,
          payMin: job.billMin,
          payMax: job.billMax,
        })),
      })
      if (!res.ok) {
        refused.add(said(res))
        return
      }
      const results: Array<{ companyId: string; status: string }> = res.json?.data?.results ?? []
      const reached = results.filter((r) => r.status === 'sent' || r.status === 'already_invited').map((r) => r.companyId)
      job.extra = { ...(job.extra ?? {}), invited: reached }
      if (reached.length > 0) sentJobs++
      invitations += results.filter((r) => r.status === 'sent').length
    })

    const down = await sendDownTheChain(ctx, jobs)

    const parts = [`${sentJobs} of ${jobs.length} published jobs sent to suppliers: ${invitations} invitations, each with its own rate band.`]
    for (const [slug, list] of lists) parts.push(`${ctx.world.companies[slug]?.name ?? slug} sends to ${list.length}.`)
    parts.push(down.says)
    if (refused.size) parts.push(`Refused: ${refused.toString()}.`)
    return { closed: sentJobs, of: jobs.length, says: parts.join(' '), table: down.table }
  },
})

/**
 * Top down: the client's job, sent by the prime to its sub-vendor and by
 * the sub-vendor to its bench vendor, each on its own record of the job.
 * The chosen chain rides on the job (`job.extra.chain`), so submit walks
 * it bottom up and award places the person through every rung.
 */
async function sendDownTheChain(ctx: Ctx, jobs: JobFact[]): Promise<{ says: string; table?: string[] }> {
  const want = chainHiresWanted(ctx)
  const firms = new Map<string, ChainFirmFacts>(
    Object.values(ctx.world.companies).map((c) => [c.id, { id: c.id, slug: c.slug, name: c.name, kind: c.kind }])
  )
  const ties = sellsToFrom(
    await ctx.read.counterparty.findMany({
      where: { companyId: { in: [...firms.keys()] }, otherCompanyId: { in: [...firms.keys()] } },
      select: { companyId: true, otherCompanyId: true, relationship: true, status: true },
    })
  )
  // Who a bench vendor could put forward today: people who said yes to it
  // being marketed, and who are not working on a placement.
  const now = new Date()
  const [listings, busy] = await Promise.all([
    ctx.read.benchListing.findMany({
      where: {
        companyId: { in: [...new Set(ties.map((t) => t.seller))] }, revokedAt: null, lapsedAt: null,
        state: 'GRANTED', askFirst: false, OR: [{ staysUntil: null }, { staysUntil: { gt: now } }],
      },
      select: { companyId: true, consultant: { select: { personId: true, skills: true } } },
    }),
    ctx.read.sellContract.findMany({
      where: { state: { in: ['IN_PROGRESS', 'DRAFT', 'PAUSED'] } },
      select: { personId: true },
      distinct: ['personId'],
    }),
  ])
  const working = new Set(busy.map((b) => b.personId))
  const benchSkills = new Map<string, string[][]>()
  for (const l of listings) {
    if (working.has(l.consultant.personId)) continue
    benchSkills.set(l.companyId, [...(benchSkills.get(l.companyId) ?? []), l.consultant.skills ?? []])
  }

  // A little over the count asked for, because a chain can stop at any rung
  // for a reason the rules give; the run still says how many walked four.
  const aim = want + Math.ceil(want / 4)
  const chains = pickChains({
    jobs: jobs
      .filter((j) => Array.isArray(j.extra?.invited) && ctx.world.companies[j.clientSlug])
      .map((j) => ({ id: j.id, clientId: ctx.world.companies[j.clientSlug].id, skills: j.skills, invited: j.extra!.invited as string[] })),
    ties, firms, benchSkills, want: aim,
  })
  const jobOf = new Map(jobs.map((j) => [j.id, j]))
  const refused = new Said()
  let sentDown = 0
  await ctx.parallel(chains, async (picked) => {
    const job = jobOf.get(picked.jobId)!
    const chain: ChainPlan = { ...picked }
    job.extra = { ...(job.extra ?? {}), chain }
    const stop = (why: string) => {
      chain.stopped = why
      refused.add(why)
    }
    // Each rung writes its own record of the job and sends it one rung down.
    const rung = async (from: ChainPlan['prime'], to: ChainPlan['sub'], share: number): Promise<string | null> => {
      const desk = sellerDesk(ctx, from.slug)
      if (!desk) {
        stop(`${from.name} seats nobody who sends a job down (an account manager or the owner)`)
        return null
      }
      const made = await desk.post('/api/requirements', {
        title: job.title, skills: job.skills, endClientCompanyId: chain.client.id,
      })
      const id: string | undefined = made.json?.data?.requirement?.id
      if (!made.ok || !id) {
        stop(said(made))
        return null
      }
      const sent = await desk.post(`/api/requisitions/${id}/distribute`, {
        vendors: [{ companyId: to.id, ...bandBelow(job.billMin, job.billMax, share) }],
      })
      const status = sent.json?.data?.results?.[0]?.status
      if (!sent.ok || (status !== 'sent' && status !== 'already_invited')) {
        stop(sent.ok ? `${from.name} could not send ${job.title} to ${to.name}: ${status ?? 'no answer'}` : said(sent))
        return null
      }
      return id
    }
    chain.primeJobId = (await rung(chain.prime, chain.sub, 0.9)) ?? undefined
    if (!chain.primeJobId) return
    chain.subJobId = (await rung(chain.sub, chain.bench, 0.8)) ?? undefined
    if (chain.subJobId) sentDown++
  })

  const short = chains.length < want
  const says = [
    `Down the chain: ${sentDown} of ${chains.length} jobs chosen for a four-rung chain went from the client to a prime, from the prime to its sub-vendor and from the sub-vendor to its bench vendor, each on its own record with its own band (${want} chain hires asked for).`,
    short
      ? `The register holds only ${chains.length} four-rung chain${chains.length === 1 ? '' : 's'} on these jobs (a prime the client sent the job to, a sub-vendor selling to it, a bench vendor selling to that with somebody free), so the run walks those and invents no link.`
      : '',
    refused.size ? `Stopped on the way down: ${refused.toString()}.` : '',
  ].filter(Boolean).join(' ')
  const table = chains.length
    ? ['| Job | The chain, client first | Sent down |', '|---|---|---|',
       ...chains.map((c) => {
         const j = jobOf.get(c.jobId)!
         const plan = (j.extra?.chain ?? {}) as ChainPlan
         return `| ${j.title.replace(/\|/g, '/')} | ${chainWords(c).replace(/\|/g, '/')} | ${plan.subJobId ? 'to the bench vendor' : plan.primeJobId ? 'to the sub-vendor only' : 'not sent'} |`
       })]
    : undefined
  return { says, table }
}
