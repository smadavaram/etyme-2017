/**
 * Stage: post-jobs. Owned by demand; written by the architect as the
 * worked example of a stage, for demand to take from here.
 *
 * Each client's hiring manager raises job requests through
 * `POST /api/requisitions`, one seat per job, spread evenly over the
 * three seeded clients. Every job copies a job the client has really
 * hired for in the seed — its title, skills, bill range, length, hours,
 * cost center and team — because the hiring manager knows what her
 * company hires; nothing is invented. The route decides whether the job
 * publishes itself or waits on approval, and the stage records which.
 *
 * And one rule held on purpose: the AP clerk may not raise a job.
 */
import { defineStage, type JobFact } from '../../stage'

interface Template {
  title: string
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  months: number | null
  hoursPerWeek: number | null
  costCenterId: string | null
  orgUnitId: string | null
  description: string | null
}

const DAY = 86_400_000

export default defineStage({
  name: 'post-jobs',
  domain: 'DEMAND',
  async run(ctx) {
    const managers = ctx.cast.where((s) => s.company?.kind === 'CLIENT' && /\/hiring$/.test(s.key))
    if (managers.length === 0) return { closed: 0, says: 'No client in this world seats a hiring manager.' }

    // What each client has hired for before: the hiring manager's own knowledge.
    const templates = new Map<string, Template[]>()
    for (const hm of managers) {
      const rows = await ctx.read.requirement.findMany({
        where: { companyId: hm.company!.id, NOT: { skills: { isEmpty: true } }, billMax: { not: null } },
        select: {
          title: true, skills: true, location: true, billMin: true, billMax: true, months: true,
          hoursPerWeek: true, costCenterId: true, orgUnitId: true, description: true, headcount: true,
        },
        orderBy: { createdAt: 'asc' },
      })
      // One seat per job: the batch roles ("six automation engineers") are copied as one seat of the same work.
      templates.set(hm.key, rows.map(({ headcount: _h, ...t }) => t))
    }
    const usable = managers.filter((hm) => (templates.get(hm.key) ?? []).length > 0)
    if (usable.length === 0) return { closed: 0, says: 'No client has a job in the seed to copy.' }

    const n = ctx.options.placements
    const plan = Array.from({ length: n }, (_, i) => {
      const hm = usable[i % usable.length]
      const list = templates.get(hm.key)!
      const t = list[Math.floor(i / usable.length) % list.length]
      return { hm, t, neededBy: new Date(Date.now() + (14 + (i % 4) * 7) * DAY).toISOString().slice(0, 10) }
    })

    let open = 0
    let waiting = 0
    await ctx.parallel(plan, async ({ hm, t, neededBy }) => {
      const res = await hm.post('/api/requisitions', {
        title: t.title,
        skills: t.skills,
        location: t.location,
        headcount: 1,
        billMin: t.billMin,
        billMax: t.billMax,
        months: t.months,
        hoursPerWeek: t.hoursPerWeek,
        costCenterId: t.costCenterId,
        orgUnitId: t.orgUnitId,
        description: t.description,
        neededBy,
      })
      if (!res.ok) return
      const r = res.json?.data?.requisition
      if (!r?.id) return
      const job: JobFact = {
        id: r.id, by: hm.key, clientSlug: hm.company!.slug, title: r.title, skills: t.skills,
        billMin: t.billMin, billMax: t.billMax, status: r.status, approvalState: r.approvalState,
        extra: { decision: res.json.data.decision?.state, summary: res.json.data.decision?.summary },
      }
      ctx.world.jobs.push(job)
      if (r.status === 'OPEN') open++
      else waiting++
    })

    // The rule, held on purpose: paying for a job is not raising one.
    const clerk = ctx.cast.at(usable[0].company!.slug, 'ap')
    if (clerk) {
      await ctx.expectRefusal(clerk, (a) => a.post('/api/requisitions', { title: 'Data engineer', skills: ['SQL'] }), 'whoever is hiring')
    }

    return {
      closed: ctx.world.jobs.length,
      of: n,
      says: `${ctx.world.jobs.length} of ${n} job requests raised: ${open} published themselves within plan, ${waiting} wait on approval.`,
    }
  },
})
