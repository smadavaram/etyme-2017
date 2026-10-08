/**
 * The sentence a seat with no desk yet reads when it opens, by URL, a
 * page its menu does not offer it: Timesheets, Budget, Org view.
 *
 * It names no desk on purpose. Every desk the link is shown to reads the
 * page, so naming the desks that hold one permission would send somebody
 * to the wrong colleague; what is missing is a desk of any kind, and the
 * owner is who gives one. It never names a permission key
 * (`__tests__/invariants/the-desk-not-the-key.test.ts`), and it is the
 * same sentence `refusalSentence` in lib/refusal-words says to a seat it
 * cannot name a desk for.
 */
export function noDeskYet(what: string, company: string | null | undefined): string {
  const at = company?.trim() ? ` at ${company.trim()}` : ''
  return `${what} is not part of your seat${at}. Ask your company’s owner if you need it.`
}
