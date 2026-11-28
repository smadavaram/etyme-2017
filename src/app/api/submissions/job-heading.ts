import { jobApart, type SameTitleJob } from '@/app/api/requisitions/words'

/**
 * The heading of the Candidates page opened on one job (the screen walk,
 * 2026-11-03: Ask Etyme's "Open who applied" landed on "No submissions
 * yet" for a job with three candidates, because the list read the job's
 * rows as the ones the client had sent).
 *
 * The job is named only where the seat may open it: the job is its own
 * firm's, or the list already holds rows on it that the seat may read.
 * Anything else reads "this job", so a link typed by hand never learns a
 * title the seat has no business with. Pure.
 */
export interface JobHeadingJob extends SameTitleJob {
  title: string
  companyId: string
}

export function mayNameJob(job: { companyId: string } | null, deskId: string | null, rowsOnIt: number): boolean {
  if (!job) return false
  return (!!deskId && job.companyId === deskId) || rowsOnIt > 0
}

/** "HCM integration lead", or "HCM integration lead in Dayton" where another live job shares the title. */
export function jobNamed(job: JobHeadingJob, others: readonly JobHeadingJob[]): string {
  const alike = others.filter((o) => o.title === job.title && o.companyId === job.companyId)
  return `${job.title}${jobApart(job, alike)}`
}

/** "Who applied for HCM integration lead", or "Who applied for this job". */
export function whoAppliedSays(named: string | null): string {
  return named ? `Who applied for ${named}` : 'Who applied for this job'
}

/** The way back from one job to every job's candidates. */
export const EVERY_JOB_SAYS = 'See candidates for every job'
