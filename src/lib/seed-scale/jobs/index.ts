/**
 * The generated world's jobs, written (etyme-demand): each client's job
 * requests and their approval chains, the primes' working records of
 * them, the invitations with each supplier's own band, the people put
 * forward and the interviews they sat.
 *
 * Five steps, in this order, each reading what exists once per table and
 * writing only what is missing in batches (`writeMissing` in the kit), so
 * a step re-walked after a deploy is a cheap no-op and a second seeding
 * writes nothing. The plan is pure (`./plan`) and every id in it is known
 * before anything is written.
 *
 * The jobs read the people, so they run after supply's people step. A
 * submission is written only for a person whose row exists: run before
 * the people, the step writes the jobs and the invitations and leaves the
 * submissions for the walk after the people land.
 */

import { prisma as db } from '@/lib/db'
import { existing, writeMissing } from '../kit'
import type { PersonFacts, ScaleFrame, Share } from '../types'
import { planJobs, type JobPlan } from './plan'

export { planJobs, jobIdForLine, supplierBand, PER_CLIENT } from './plan'
export type { JobPlan, JobRow, ApprovalRow, InvitationRow, SubmissionRow, InterviewRow } from './plan'

export interface JobStep {
  name: string
  run(frame: ScaleFrame): Promise<void>
}

/** The step names, in the order they run. For `index.ts` to wire after the people's steps. */
export const JOB_STEP_NAMES = [
  'scale:jobs:requests',
  'scale:jobs:approvals',
  'scale:jobs:invitations',
  'scale:jobs:submissions',
  'scale:jobs:interviews',
] as const

const cache = new WeakMap<readonly PersonFacts[], WeakMap<ScaleFrame, JobPlan>>()

/** The plan for this frame and these people, made once per pair. */
function planOf(frame: ScaleFrame, people: readonly PersonFacts[]): JobPlan {
  let byFrame = cache.get(people)
  if (!byFrame) cache.set(people, (byFrame = new WeakMap()))
  let plan = byFrame.get(frame)
  if (!plan) byFrame.set(frame, (plan = planJobs(frame, people)))
  return plan
}

/**
 * The job steps, given the people. `people` is supply's `buildPeople(frame)`
 * once it lands; until then a test passes `standInPeople(frame)`.
 */
export function jobSteps(people: () => readonly PersonFacts[]): JobStep[] {
  const steps: Record<(typeof JOB_STEP_NAMES)[number], (frame: ScaleFrame) => Promise<void>> = {
    // Client jobs before the primes' records of them, which point back.
    'scale:jobs:requests': async (frame) => {
      const plan = planOf(frame, people())
      await writeMissing(db.requirement, plan.jobs.filter((j) => !j.mirroredFromId))
      await writeMissing(db.requirement, plan.jobs.filter((j) => j.mirroredFromId))
    },
    'scale:jobs:approvals': async (frame) => {
      await writeMissing(db.requirementApproval, planOf(frame, people()).approvals)
    },
    'scale:jobs:invitations': async (frame) => {
      await writeMissing(db.requirementInvitation, planOf(frame, people()).invitations)
    },
    // Only for people who exist; the hop to a prime before the hop onward that points at it.
    'scale:jobs:submissions': async (frame) => {
      const plan = planOf(frame, people())
      const here = await existing(db.person, [...new Set(plan.submissions.map((s) => s.personId))])
      const rows = plan.submissions.filter((s) => here.has(s.personId))
      await writeMissing(db.submission, rows.filter((s) => !s.parentSubmissionId))
      await writeMissing(db.submission, rows.filter((s) => s.parentSubmissionId))
    },
    'scale:jobs:interviews': async (frame) => {
      const plan = planOf(frame, people())
      const here = await existing(db.submission, [...new Set(plan.interviews.map((i) => i.submissionId))])
      await writeMissing(db.interview, plan.interviews.filter((i) => here.has(i.submissionId)))
    },
  }
  return JOB_STEP_NAMES.map((name) => ({ name, run: steps[name] }))
}

/**
 * Every job step, one after another. Idempotent. The share is accepted
 * for the signature in `types.ts` and not needed: the largest step is a
 * few dozen queries.
 */
export async function seedJobs(frame: ScaleFrame, people: readonly PersonFacts[], _share?: Share): Promise<void> {
  for (const s of jobSteps(() => people)) await s.run(frame)
}

/** How many rows a plan holds, by table. For the report and the tests. */
export function planCounts(plan: JobPlan): Record<string, number> {
  return {
    jobs: plan.jobs.length, approvals: plan.approvals.length, invitations: plan.invitations.length,
    submissions: plan.submissions.length, interviews: plan.interviews.length,
  }
}
