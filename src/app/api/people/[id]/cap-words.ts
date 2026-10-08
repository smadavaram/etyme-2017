/**
 * The article before a number, said the way the number is spoken.
 * Pure: no database.
 *
 * Sign-up walk, round seven (2026-10-08), problem 15. The client's person
 * page read "14 months into a 18-month cap": the article was picked for
 * the letter "1" rather than for "eighteen". A number takes "an" when it
 * is spoken starting with a vowel sound — eight, eleven, eighteen,
 * eighty-anything, eight hundred — and "a" otherwise.
 */
export function articleForNumber(n: number): 'a' | 'an' {
  if (!Number.isFinite(n) || n < 0) return 'a'
  const digits = String(Math.floor(n))
  if (digits.startsWith('8')) return 'an'
  // 11 and 18, and the same at each thousand: 11,000 · 18 million.
  if (digits.length % 3 === 2 && (digits.startsWith('11') || digits.startsWith('18'))) return 'an'
  return 'a'
}

/** "14 months into an 18-month cap across every supplier." */
export function onSiteAgainstCapSays(name: string, monthsWord: string, capMonths: number): string {
  return `${name} is on site now, ${monthsWord} into ${articleForNumber(capMonths)} ${capMonths}-month cap across every supplier.`
}
