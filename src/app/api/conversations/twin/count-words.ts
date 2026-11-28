/**
 * A count said in words (the Owner walk, 2026-11-12: "10 things need you"
 * opened a sentence with a figure while "Three things need you" and "Six
 * things need you" were spelled out). One helper for every number the
 * greeting can say, so no headline is spelled up to nine and printed in
 * figures after it.
 *
 * Spelled in full up to 999 ("Ten", "Forty-two", "One hundred twelve");
 * past that, figures with commas ("1,204"), because a count that long is
 * read, not said. Nought is "No", as in "No things need you" never being
 * said: callers say "Nothing needs you today" for nought.
 */

const ONES = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function underHundred(n: number): string {
  if (n < 20) return ONES[n]
  const t = TENS[Math.floor(n / 10)]
  return n % 10 === 0 ? t : `${t}-${ONES[n % 10]}`
}

/** "no", "one", "ten", "forty-two", "one hundred twelve", "1,204". Lower case, for inside a sentence. */
export function countWordLower(n: number): string {
  if (!Number.isInteger(n) || n < 0) return String(n)
  if (n >= 1000) return n.toLocaleString('en-US')
  if (n < 100) return underHundred(n)
  const h = `${ONES[Math.floor(n / 100)]} hundred`
  return n % 100 === 0 ? h : `${h} ${underHundred(n % 100)}`
}

/** "No", "One", "Ten", "Forty-two", "1,204". Sentence case, for a count that opens a sentence. */
export function countWord(n: number): string {
  const w = countWordLower(n)
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/** "One thing needs you.", "Ten things need you.", "Nothing needs you today." */
export function thingsNeedYou(n: number): string {
  return n <= 0 ? 'Nothing needs you today.' : `${countWord(n)} thing${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} you.`
}
