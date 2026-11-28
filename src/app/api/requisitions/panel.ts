/**
 * The interview panel a job request carries: the names typed on the job
 * form, each once, blanks dropped, the same way the edit route
 * (`requisitions/[id]`) keeps an edited panel.
 *
 * The raise never read it (found 2026-11-02 by the field contract between
 * the job form and the raise, `every-question-has-a-field-demand.test.ts`):
 * the form asked for the panel and the job was written without it, so the
 * first interview form opened empty. Pure.
 */
export function panelFrom(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return [...new Set(raw.map((n) => String(n).trim()).filter(Boolean))]
}
