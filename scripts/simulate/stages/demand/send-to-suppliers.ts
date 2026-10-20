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
 * Two rules held on purpose, once per client:
 *   - a hiring manager raises a job and does not choose who sees it;
 *   - a firm the client reaches only through a prime is the prime's
 *     sub-vendor, and a job cannot be sent to it.
 */
import { defineStage, type JobFact } from '../../stage'
import { clientSeat, jobsInPlay, said, Said } from './common'

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

    const parts = [`${sentJobs} of ${jobs.length} published jobs sent to suppliers: ${invitations} invitations, each with its own rate band.`]
    for (const [slug, list] of lists) parts.push(`${ctx.world.companies[slug]?.name ?? slug} sends to ${list.length}.`)
    if (refused.size) parts.push(`Refused: ${refused.toString()}.`)
    return { closed: sentJobs, of: jobs.length, says: parts.join(' ') }
  },
})
