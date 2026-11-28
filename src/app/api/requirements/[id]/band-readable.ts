/**
 * Whether a firm may read a job's own rate band: only the firm that raised
 * it or the firm that pays for it. Every other firm reads the band on its
 * own invitation, never the job's (CLAUDE.md, "Rate bands live on
 * RequirementInvitation, never on Requirement where a recipient could read
 * another vendor's rate"). Pure, so a test reads the rule the route reads.
 */
export function jobBandReadable(job: { companyId: string; payerCompanyId: string | null }, companyId: string): boolean {
  return job.companyId === companyId || (job.payerCompanyId !== null && job.payerCompanyId === companyId)
}
