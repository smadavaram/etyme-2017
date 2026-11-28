import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contactEmail, contactSays, NO_CONTACT_SAYS, heldCategories } from '@/lib/data-request'

/**
 * The Your data page, as round three of the sign-up walk read it
 * (docs/results/2026-10-08-signup-round-3.md, problems 7 and 8).
 *
 * A real person was told to write to privacy@etyme.example — an address
 * on a domain nobody can own — and read "A consultant own profile",
 * "a supplier own application" and "the signer own name".
 */

const saved = { privacy: process.env.ETYME_PRIVACY_EMAIL, staff: process.env.ETYME_STAFF_EMAILS }
afterEach(() => {
  if (saved.privacy === undefined) delete process.env.ETYME_PRIVACY_EMAIL
  else process.env.ETYME_PRIVACY_EMAIL = saved.privacy
  if (saved.staff === undefined) delete process.env.ETYME_STAFF_EMAILS
  else process.env.ETYME_STAFF_EMAILS = saved.staff
})

describe('where a question about your data goes', () => {
  it('with no privacy address and no staff address set, the page says no contact is set up rather than printing an address', () => {
    delete process.env.ETYME_PRIVACY_EMAIL
    delete process.env.ETYME_STAFF_EMAILS
    expect(contactEmail()).toBeNull()
    expect(contactSays()).toBe(NO_CONTACT_SAYS)
    expect(contactSays()).toMatch(/not set up yet/)
    expect(contactSays()).not.toMatch(/@/)
  })

  it('the privacy address set on the deployment is the one the page names', () => {
    process.env.ETYME_PRIVACY_EMAIL = 'privacy@etyme.ai'
    process.env.ETYME_STAFF_EMAILS = 'ops@etyme.ai'
    expect(contactEmail()).toBe('privacy@etyme.ai')
    expect(contactSays()).toBe('Questions about any of this go to privacy@etyme.ai.')
  })

  it('with no privacy address set, questions go to the first staff address that already hears about incidents', () => {
    delete process.env.ETYME_PRIVACY_EMAIL
    process.env.ETYME_STAFF_EMAILS = 'founder@etyme.ai, ops@etyme.ai'
    expect(contactEmail()).toBe('founder@etyme.ai')
  })

  it('an address on a domain nobody can own is treated as no address at all', () => {
    process.env.ETYME_PRIVACY_EMAIL = 'privacy@etyme.example'
    process.env.ETYME_STAFF_EMAILS = 'staff@demo.invalid,desk@corp.local'
    expect(contactEmail()).toBeNull()
    expect(contactSays()).toBe(NO_CONTACT_SAYS)
  })

  it('a reserved privacy address falls through to a real staff address', () => {
    process.env.ETYME_PRIVACY_EMAIL = 'privacy@etyme.example'
    process.env.ETYME_STAFF_EMAILS = 'ops@etyme.ai'
    expect(contactEmail()).toBe('ops@etyme.ai')
  })

  it('no file in the Your data path hard-codes the demo privacy address', () => {
    for (const f of ['src/lib/data-request.ts', 'src/app/api/me/data/route.ts', 'src/app/dashboard/my-data/page.tsx']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toContain('privacy@etyme.example')
    }
  })
})

describe('Your data reads with its possessives', () => {
  it('the consultant profile category reads "A consultant’s own profile" on the page', () => {
    // The key itself carries the possessive since the rename, in all five
    // files that match it by exact text; nothing corrects it on the way out.
    const names = heldCategories().map((h) => h.category)
    expect(names).toContain('A consultant’s own profile')
    expect(names).not.toContain('A consultant own profile')
  })

  it('the privacy notice and the retention schedule say "the signer’s own name", "a supplier’s own application" and "another person’s record"', () => {
    const notice = readFileSync(join(process.cwd(), 'src/lib/legal.ts'), 'utf8')
    expect(notice).toContain('the signer’s own name')
    expect(notice).toContain('a supplier’s own application')
    expect(notice).toContain('another person’s record')
  })

  it('no sentence in the notice or the schedule says a noun followed by "own" where a possessive belongs', () => {
    const pronouns = /^(their|its|his|her|your|our|my|own|the|and|on|in|of|an|a|to|at|or|from|with|for|is|by|whose|s)$/i
    for (const f of ['src/lib/legal.ts', 'src/lib/retention.ts']) {
      const text = readFileSync(join(process.cwd(), f), 'utf8')
      // Only the user-facing strings: single-quoted literals.
      const strings = text.match(/'[^'\n]*'/g) ?? []
      const bad = strings.flatMap((s) =>
        [...s.matchAll(/\b([a-z]+) own\b/gi)].map((m) => m[1]).filter((w) => !pronouns.test(w))
          .map((w) => `${w} own — ${s}`)
      )
      expect(bad, f).toEqual([])
      expect(text, f).not.toMatch(/\b(another|a|of a) person record\b/)
    }
  })

  /**
   * Round four, problem 11. The "own" sweep passed and the page still
   * read "somebody else week of hours signed off": the same missing
   * possessive, after "else" rather than before "own". The second sweep
   * found four more of the class — "somebody access", "somebody personal
   * data", "anybody permission", "somebody else data".
   */
  it('the notice says "somebody else’s week of hours signed off", never "somebody else week"', () => {
    const notice = readFileSync(join(process.cwd(), 'src/lib/legal.ts'), 'utf8')
    expect(notice).toContain('somebody else’s week of hours')
    expect(notice).not.toContain('somebody else week')
  })

  it('no sentence in the notice or the schedule says "somebody", "anybody" or "somebody else" straight before a thing they own', () => {
    // What may follow one of these words without a possessive: a verb or
    // a word that joins, never a noun. A noun here is a missing "’s".
    const follows = new Set([
      'who', 'whose', 'that', 'at', 'with', 'by', 'from', 'on', 'in', 'to', 'as', 'for', 'of', 'and', 'or', 'but',
      'it', 'here', 'there', 'else', 'nobody', 'already', 'safer', 'last', 'when', 'after', 'behind', 'before',
      'is', 'was', 'has', 'had', 'does', 'did', 'can', 'could', 'may', 'might', 'must', 'will', 'would', 'should',
      'ran', 'stood', 'returns', 'writes', 'decides', 'hopes', 'asks', 'audits', 'signs', 'sees', 'holds', 'reads',
      'needs', 'gets', 'says', 'knows', 'wants',
    ])
    const pronoun = /\b(somebody|someone|anybody|anyone|everybody|everyone|nobody)( else)? ([a-z]+)/gi
    for (const f of ['src/lib/legal.ts', 'src/lib/retention.ts']) {
      const text = readFileSync(join(process.cwd(), f), 'utf8')
      const strings = text.match(/'[^'\n]*'/g) ?? []
      const bad = strings.flatMap((s) =>
        [...s.matchAll(pronoun)]
          .filter((m) => !follows.has(m[3].toLowerCase()) && !/(ed|ing)$/i.test(m[3]))
          .map((m) => `${m[0]} — ${s}`)
      )
      expect(bad, f).toEqual([])
    }
  })
})
