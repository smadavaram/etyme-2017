/**
 * Stage: submit. Owned by demand.
 *
 * Each supplier a job was sent to puts people forward through
 * `POST /api/submissions`, from its recruiting seat (a recruiter, an
 * account manager, a resource manager, else the owner). Who it puts
 * forward is what a recruiter knows about their own firm:
 *   - people on its bench who said yes to being marketed (a live,
 *     granted listing that does not ask to be asked first), and
 *   - its own employees between projects, who go as INTERNAL — the
 *     employment is the consent, and the person is told.
 * Nobody already working on a placement is offered, and a person is put
 * forward for work that fits their skills first. Two to three people per
 * job, across suppliers, at most two from one firm. The kind is never
 * sent: the route computes it.
 *
 * The chain, bottom up, first (the founder, 2026-11-08): on every job
 * send-to-suppliers sent down four rungs, the bench vendor puts forward a
 * person who said yes to it, onto the sub-vendor's record of the job; the
 * sub-vendor sends them on to the prime's record, and the prime sends them
 * on to the client's job (`POST /api/submissions/[id]/forward`, naming the
 * role the rung above sent it). It goes first so the chain's person
 * reaches the client first, and nobody else puts that person forward.
 *
 * The rule held on purpose: putting the same person forward for the same
 * job twice is refused — first submission wins. The route answers a
 * batch with a 200 and a result per person, so this station reads that
 * result and says what it found; refusals inside a batch are counted
 * here by their sentence.
 */
import { defineStage, type Ctx, type JobFact, type SubmissionFact } from '../../stage'
import { chainOf, chainWords, jobsInPlay, said, Said, skillFit, supplierSeat, type ChainPlan } from './common'

/** Roles that run a firm rather than being sold by it. */
const RUNS_THE_FIRM = new Set([
  'Owner', 'Admin', 'HR', 'AP & Payroll', 'Compliance Officer', 'Account Manager', 'Recruiter',
  'Resource Manager', 'Contract Manager', 'Accounts Receivable', 'Finance', 'Delivery Manager',
  'Program Manager', 'Member',
])

interface Candidate {
  personId: string
  name: string
  email: string
  supplierId: string
  supplierSlug: string
  internal: boolean
  skills: string[]
  roleName: string | null
  rateMin: number | null
  rateMax: number | null
}

function fit(job: JobFact, c: Candidate): number {
  let n = skillFit(job.skills, c.skills) * 2
  if (c.roleName) {
    const role = c.roleName.toLowerCase()
    const title = job.title.toLowerCase()
    if (title.includes(role) || role.includes(title)) n += 3
    else if (role.split(/\s+/).some((w) => w.length > 3 && title.includes(w))) n += 1
  }
  return n
}

function rateFor(job: JobFact, c: Candidate): number {
  const lo = job.billMin ?? job.billMax ?? 10000
  const hi = job.billMax ?? lo
  const want = c.rateMax ?? c.rateMin ?? Math.round((lo + hi) / 2)
  return Math.round(Math.min(hi, Math.max(lo, want)) / 100) * 100
}

export default defineStage({
  name: 'submit',
  domain: 'DEMAND',
  async run(ctx) {
    const jobs = await jobsInPlay(ctx, 'OPEN')
    if (jobs.length === 0) return { closed: 0, of: 0, says: 'No published job to put anybody forward for.' }

    // The chain first, so its person is first in at every rung.
    const up = await walkChainsUp(ctx, jobs)

    // Which suppliers each job reached.
    const invitedOf = new Map<string, string[]>()
    const missing = jobs.filter((j) => !Array.isArray(j.extra?.invited)).map((j) => j.id)
    if (missing.length) {
      const rows = await ctx.read.requirementInvitation.findMany({
        where: { requirementId: { in: missing }, status: { in: ['SENT', 'ACCEPTED'] } },
        select: { requirementId: true, toCompanyId: true },
      })
      for (const r of rows) invitedOf.set(r.requirementId, [...(invitedOf.get(r.requirementId) ?? []), r.toCompanyId])
    }
    for (const j of jobs) if (Array.isArray(j.extra?.invited)) invitedOf.set(j.id, j.extra!.invited as string[])

    const supplierIds = [...new Set([...invitedOf.values()].flat())]
    const slugOf = new Map(Object.values(ctx.world.companies).map((c) => [c.id, c.slug]))

    // What each recruiter knows: their bench, their own people, and who is working already.
    const now = new Date()
    const [listings, employees, busy] = await Promise.all([
      ctx.read.benchListing.findMany({
        where: {
          companyId: { in: supplierIds }, revokedAt: null, lapsedAt: null, state: 'GRANTED', askFirst: false,
          OR: [{ staysUntil: null }, { staysUntil: { gt: now } }],
        },
        select: {
          companyId: true, rateMin: true, rateMax: true,
          consultant: { select: { personId: true, skills: true, person: { select: { name: true, primaryEmail: true } } } },
        },
      }),
      ctx.read.context.findMany({
        where: {
          companyId: { in: supplierIds }, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          companyId: true, personId: true, role: { select: { name: true } },
          person: { select: { name: true, primaryEmail: true, consultant: { select: { skills: true } } } },
        },
      }),
      ctx.read.sellContract.findMany({
        where: { state: { in: ['IN_PROGRESS', 'DRAFT', 'PAUSED'] } },
        select: { personId: true },
        distinct: ['personId'],
      }),
    ])
    const working = new Set(busy.map((b) => b.personId))
    // Somebody already on a chain is that chain's, and nobody else's to put forward.
    for (const p of up.people) working.add(p)
    for (const a of ctx.world.awards) if (typeof a.extra?.personId === 'string') working.add(a.extra.personId)

    const poolBySupplier = new Map<string, Candidate[]>()
    const add = (c: Candidate) => {
      if (working.has(c.personId) || !c.supplierSlug) return
      const list = poolBySupplier.get(c.supplierId) ?? []
      if (!list.some((x) => x.personId === c.personId)) list.push(c)
      poolBySupplier.set(c.supplierId, list)
    }
    for (const l of listings) {
      add({
        personId: l.consultant.personId, name: l.consultant.person.name, email: l.consultant.person.primaryEmail ?? '',
        supplierId: l.companyId, supplierSlug: slugOf.get(l.companyId) ?? '', internal: false,
        skills: l.consultant.skills ?? [], roleName: null, rateMin: l.rateMin, rateMax: l.rateMax,
      })
    }
    for (const e of employees) {
      const role = e.role?.name ?? null
      if (role && RUNS_THE_FIRM.has(role)) continue
      if (!role) continue
      add({
        personId: e.personId, name: e.person.name, email: e.person.primaryEmail ?? '',
        supplierId: e.companyId!, supplierSlug: slugOf.get(e.companyId!) ?? '', internal: true,
        skills: e.person.consultant?.skills ?? [], roleName: role, rateMin: null, rateMax: null,
      })
    }

    // The plan: per job, the best fits across the suppliers it reached.
    const picked = new Map<string, number>()
    const plan: Array<{ job: JobFact; c: Candidate; fit: number }> = []
    let unmatched = 0
    for (const job of jobs) {
      const pool = (invitedOf.get(job.id) ?? []).flatMap((s) => poolBySupplier.get(s) ?? [])
      const ranked = pool
        .map((c) => ({ c, fit: fit(job, c) }))
        .sort((a, b) => b.fit - a.fit || (picked.get(a.c.personId) ?? 0) - (picked.get(b.c.personId) ?? 0))
      const chosen: Array<{ c: Candidate; fit: number }> = []
      const perFirm = new Map<string, number>()
      for (const r of ranked) {
        if (chosen.length >= 3) break
        if (chosen.some((x) => x.c.personId === r.c.personId)) continue
        if ((perFirm.get(r.c.supplierId) ?? 0) >= 2) continue
        // A recruiter sends people who fit; someone who fits nothing only to make up two.
        if (r.fit === 0 && chosen.length >= 2) break
        chosen.push(r)
        perFirm.set(r.c.supplierId, (perFirm.get(r.c.supplierId) ?? 0) + 1)
      }
      if (chosen.length === 0) unmatched++
      for (const x of chosen) {
        picked.set(x.c.personId, (picked.get(x.c.personId) ?? 0) + 1)
        plan.push({ job, c: x.c, fit: x.fit })
      }
    }

    // One person's submissions in turn (one hold per person per client); people in parallel.
    const byPerson = new Map<string, typeof plan>()
    for (const p of plan) byPerson.set(p.c.personId, [...(byPerson.get(p.c.personId) ?? []), p])

    const inBatch = new Said()
    const refused = new Said()
    let internal = 0
    let reasoned = 0
    let fitting = 0
    await ctx.parallel([...byPerson.values()], async (queue) => {
      for (const { job, c, fit: f } of queue) {
        const seat = supplierSeat(ctx, c.supplierSlug, c.internal)
        if (!seat) {
          refused.add(`${ctx.world.companies[c.supplierSlug]?.name ?? c.supplierSlug} seats nobody who puts people forward`)
          continue
        }
        const body: Record<string, unknown> = {
          requirementId: job.id, personIds: [c.personId], rate: rateFor(job, c), fromCompanyId: c.supplierId,
        }
        let res = await seat.post('/api/submissions', body)
        if (!res.ok) {
          refused.add(said(res))
          continue
        }
        let item = res.json?.data?.results?.[0]
        // Warned about the client's time limit: the recruiter gives the reason and presses again.
        if (item?.status === 'needs_reason') {
          inBatch.add(item.error)
          body.reason = `${c.name} is the strongest fit we have for ${job.title}; the client may weigh the time already served.`
          res = await seat.post('/api/submissions', body)
          item = res.json?.data?.results?.[0]
          if (item?.status === 'created') reasoned++
        }
        if (item?.status !== 'created') {
          inBatch.add(item?.error ?? `status ${item?.status}`)
          continue
        }
        const fact: SubmissionFact = {
          id: item.submissionId, by: seat.key, jobId: job.id, supplierSlug: c.supplierSlug,
          personId: c.personId, kind: item.kind,
          extra: { name: c.name, email: c.email, rate: body.rate, fit: f, warnings: [item.warning, item.tenureWarning, item.workAuthWarning, item.coverWarning].filter(Boolean) },
        }
        ctx.world.submissions.push(fact)
        if (item.kind === 'INTERNAL') internal++
        if (f > 0) fitting++
      }
    })

    // The rule, held on purpose: the same firm puts the same person forward again.
    const repeats = ctx.world.submissions.filter((s) => s.by !== 'seed').slice(0, 3)
    let firstWins = 0
    for (const s of repeats) {
      const seat = ctx.cast.seat(s.by)
      const res = await seat.post('/api/submissions', {
        requirementId: s.jobId, personIds: [s.personId], rate: Number(s.extra?.rate ?? 10000),
        fromCompanyId: ctx.world.companies[s.supplierSlug]?.id,
      })
      const item = res.json?.data?.results?.[0]
      if (item?.status === 'duplicate' && /First submission wins/.test(item.error ?? '')) firstWins++
      else ctx.log(`a second submission of the same person was not refused as a duplicate: ${item?.status ?? said(res)}`)
    }

    const made = ctx.world.submissions.filter((s) => s.by !== 'seed').length
    const jobsWith = new Set(ctx.world.submissions.map((s) => s.jobId)).size
    const parts = [
      `${made} people put forward on ${jobsWith} of ${jobs.length} jobs (${internal} as the firm's own employee, ${fitting} matching at least one skill or the role).`,
      `First submission wins held ${firstWins} of ${repeats.length} times a firm tried the same person twice.`,
    ]
    if (up.says) parts.push(up.says)
    if (reasoned) parts.push(`${reasoned} went ahead past the client's time limit with the reason written down.`)
    if (unmatched) parts.push(`${unmatched} jobs reached no supplier with anybody free on its bench.`)
    if (inBatch.size) parts.push(`Turned away inside the batch: ${inBatch.toString()}.`)
    if (refused.size) parts.push(`Refused: ${refused.toString()}.`)
    return { closed: made, of: plan.length, says: parts.join(' ') }
  },
})

/**
 * Bottom up: the bench vendor's person, put forward to the sub-vendor,
 * sent on to the prime, sent on to the client. Each rung names the role
 * the rung above sent it, so the person lands on that rung's own record
 * and never on a copy. Every refusal is a sentence on the ledger and
 * stops that chain where it was said.
 */
async function walkChainsUp(ctx: Ctx, jobs: JobFact[]): Promise<{ says: string; people: Set<string> }> {
  const chains = jobs.map((j) => ({ job: j, chain: chainOf(j) })).filter(
    (x): x is { job: JobFact; chain: ChainPlan } => !!x.chain?.subJobId && !x.chain.stopped
  )
  const people = new Set<string>()
  if (chains.length === 0) return { says: '', people }

  // Who each bench vendor may put forward now, after bench-and-consent:
  // a live, granted, marketed listing, and not working on a placement.
  const now = new Date()
  const [listings, busy] = await Promise.all([
    ctx.read.benchListing.findMany({
      where: {
        companyId: { in: [...new Set(chains.map((c) => c.chain.bench.id))] }, revokedAt: null, lapsedAt: null,
        state: 'GRANTED', askFirst: false, OR: [{ staysUntil: null }, { staysUntil: { gt: now } }],
      },
      select: {
        companyId: true, rateMin: true, rateMax: true,
        consultant: { select: { personId: true, skills: true, person: { select: { name: true, primaryEmail: true } } } },
      },
      orderBy: { id: 'asc' },
    }),
    ctx.read.sellContract.findMany({ where: { state: { in: ['IN_PROGRESS', 'DRAFT', 'PAUSED'] } }, select: { personId: true }, distinct: ['personId'] }),
  ])
  const working = new Set(busy.map((b) => b.personId))
  for (const a of ctx.world.awards) if (typeof a.extra?.personId === 'string') working.add(a.extra.personId)

  // One person per chain, the best fit on that bench, chosen in job order.
  const fitOf = new Map<string, number>()
  for (const { job, chain } of chains) {
    const best = listings
      .filter((l) => l.companyId === chain.bench.id && !working.has(l.consultant.personId) && !people.has(l.consultant.personId))
      .map((l) => ({ l, fit: skillFit(job.skills, l.consultant.skills) }))
      .sort((a, b) => b.fit - a.fit)[0]
    if (!best) {
      chain.stopped = `${chain.bench.name} had nobody free on its bench for ${job.title} by the time it could put somebody forward`
      continue
    }
    people.add(best.l.consultant.personId)
    chain.personId = best.l.consultant.personId
    chain.personName = best.l.consultant.person.name
    chain.email = best.l.consultant.person.primaryEmail ?? ''
    fitOf.set(chain.jobId, best.fit)
  }

  const stopped = new Said()
  let reachedClient = 0
  await ctx.parallel(chains.filter((c) => c.chain.personId), async ({ job, chain }) => {
    const stop = (why: string) => {
      chain.stopped = why
      stopped.add(why)
      // Put forward nowhere yet, so free for any other firm's submission.
      if (!chain.benchSubmissionId && chain.personId) people.delete(chain.personId)
    }
    // What each rung asks of the one above: the client's band at the top,
    // a tenth less at the prime, a fifth less at the sub-vendor.
    const lo = job.billMin ?? job.billMax ?? 10000
    const hi = job.billMax ?? lo
    const top = Math.round((lo + hi) / 2 / 100) * 100
    const atPrime = Math.round((top * 0.9) / 100) * 100
    const atSub = Math.round((top * 0.8) / 100) * 100

    // 1. The bench vendor puts its person forward to the sub-vendor.
    const bench = supplierSeat(ctx, chain.bench.slug)
    if (!bench) return stop(`${chain.bench.name} seats nobody who puts people forward`)
    const body: Record<string, unknown> = {
      requirementId: chain.subJobId, personIds: [chain.personId], rate: atSub, fromCompanyId: chain.bench.id,
    }
    let res = await bench.post('/api/submissions', body)
    let item = res.json?.data?.results?.[0]
    if (res.ok && item?.status === 'needs_reason') {
      body.reason = `${chain.personName} is the strongest fit on our bench for ${job.title}; the client may weigh the time already served.`
      res = await bench.post('/api/submissions', body)
      item = res.json?.data?.results?.[0]
    }
    if (!res.ok) return stop(said(res))
    if (item?.status !== 'created') return stop(item?.error ?? `status ${item?.status}`)
    chain.benchSubmissionId = item.submissionId

    // 2. The sub-vendor sends them on to the prime, onto the prime's record.
    const sub = supplierSeat(ctx, chain.sub.slug)
    if (!sub) return stop(`${chain.sub.name} seats nobody who sends a candidate on`)
    const onToPrime = await sub.post(`/api/submissions/${chain.benchSubmissionId}/forward`, {
      via: 'ONWARD', toCompanyId: chain.prime.id, requirementId: chain.primeJobId, rate: atPrime,
    })
    const primeSub: string | undefined = onToPrime.json?.data?.childSubmissionId
    if (!onToPrime.ok || !primeSub) return stop(onToPrime.ok ? `${chain.sub.name} sent ${chain.personName} on and no submission came back at ${chain.prime.name}` : said(onToPrime))
    chain.subSubmissionId = primeSub

    // 3. The prime sends them on to the client's own job.
    const prime = supplierSeat(ctx, chain.prime.slug)
    if (!prime) return stop(`${chain.prime.name} seats nobody who sends a candidate on`)
    const onToClient = await prime.post(`/api/submissions/${primeSub}/forward`, {
      via: 'ONWARD', toCompanyId: chain.client.id, requirementId: job.id, rate: top,
    })
    const topSub: string | undefined = onToClient.json?.data?.childSubmissionId
    if (!onToClient.ok || !topSub) return stop(onToClient.ok ? `${chain.prime.name} sent ${chain.personName} on and no submission came back at ${chain.client.name}` : said(onToClient))
    chain.topSubmissionId = topSub
    reachedClient++

    const fact: SubmissionFact = {
      id: topSub, by: prime.key, jobId: job.id, supplierSlug: chain.prime.slug, personId: chain.personId!,
      extra: {
        name: chain.personName, email: chain.email, rate: top, fit: fitOf.get(chain.jobId) ?? 0,
        chain: true, rungs: 4, chainWords: chainWords(chain),
      },
    }
    ctx.world.submissions.push(fact)
  })

  const tried = chains.length
  const says = [
    `Up the chain: ${reachedClient} of ${tried} people a bench vendor put forward reached the client through a sub-vendor and a prime, each rung sending them on to the role the rung above sent it.`,
    stopped.size ? `Stopped on the way up: ${stopped.toString()}.` : '',
  ].filter(Boolean).join(' ')
  return { says, people }
}
