/**
 * The sentence a seat with no desk yet reads when it opens, by URL, a
 * page its menu does not offer it.
 *
 * Moved here from demand's `app/api/program/no-desk` (8ea50d138) when the
 * one door in `lib/api-context` started saying it for every route, so the
 * door and the three routes that said it first say it in one voice.
 *
 * It names no desk on purpose. Every desk the link is shown to reads the
 * page, so naming the desks that hold one permission would send somebody
 * to the wrong colleague; what is missing is a desk of any kind, and the
 * owner is who gives one. It never names a permission key
 * (`__tests__/invariants/the-desk-not-the-key.test.ts`).
 */
export function noDeskYet(what: string, company: string | null | undefined): string {
  const at = company?.trim() ? ` at ${company.trim()}` : ''
  return `${what} is not part of your seat${at}. Ask your company’s owner if you need it.`
}
