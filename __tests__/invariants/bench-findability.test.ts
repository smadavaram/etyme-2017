import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { candidateRecordHref, openFromAddress, NOT_ON_THIS_LIST_SAYS, CANDIDATES_PATH } from '@/lib/consultant-portfolio/open-from-link'
import { nudgeLogSummary } from '@/lib/consultant-portfolio/nudge-words'
import { tierInWords, ADD_TIER_OPTION, TIER_WORD, INVITE_LINK_KEPT_SAYS, INVITE_NOT_EMAILED_LOG, savingSays, listingRates } from '@/lib/bench-filter'
import { askSummary } from '@/lib/consultant-portfolio/bench-ask'
import { ADDS_CONSULTANTS } from '@/lib/consultant-portfolio/who-adds'

/**
 * Fix list, batch four (findability and access), on the bench's screens.
 * C4: the Bench card of somebody asked and not answered leads to her
 * record. D1: the bench's resend row says what the send did. And three
 * sentences a walker reported on 2026-11-14. Every person and firm here is
 * made up.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const BENCH = read('src/app/dashboard/bench/page.tsx')
const CANDIDATES = read('src/app/dashboard/consultants/page.tsx')
const NUDGE = read('src/app/api/bench/listings/[id]/nudge/route.ts')

describe('a name on Bench leads to her record on Candidates', () => {
  it('the name of somebody asked and not answered, in the Asked list, is a link to her record', () => {
    const asked = BENCH.slice(BENCH.indexOf('{ASKED_HEADING}'), BENCH.indexOf("{scope === 'payroll' ? ("))
    expect(asked).toContain('<Link href={candidateRecordHref(a.consultantId)}')
  })

  it('an Invited row in the bench table leads to her record too', () => {
    expect(BENCH).toMatch(/row\.consent === 'INVITED' && readsCandidates\s*\?\s*<Link href=\{candidateRecordHref\(row\.consultantId\)\}/)
  })

  it('the link is drawn only for a seat the Candidates page’s own route takes', () => {
    expect(BENCH).toContain("const readsCandidates = hasPermission(session.permissions, 'consultants.read')")
    expect(read('src/app/api/consultants/route.ts')).toContain("if (!hasPermission(caller.permissions, 'consultants.read')) {")
  })

  it('the link carries the record’s id in the address and never her name or email', () => {
    const href = String(candidateRecordHref('cm-rec-42'))
    expect(href).toBe(`${CANDIDATES_PATH}?open=cm-rec-42`)
    expect(href).not.toMatch(/name|email|@/i)
    // An odd id is encoded, never let loose in the address.
    expect(String(candidateRecordHref('a b&c'))).toBe(`${CANDIDATES_PATH}?open=a%20b%26c`)
    // The page builds it from the id alone.
    expect(BENCH).not.toMatch(/candidateRecordHref\([^)]*(name|email)/)
  })
})

describe('Candidates opens a record from the address', () => {
  const rows = [{ id: 'c1', name: 'Wren Abernathy' }, { id: 'c2', name: 'Tomas Ilyin' }]

  it('opens the drawer for an id on the list the page already loaded, with the row the list returned', () => {
    const opened = openFromAddress(rows, 'c2')
    expect(opened).toEqual({ open: rows[1] })
    expect(opened && 'open' in opened && opened.open).toBe(rows[1])
  })

  it('for an id not on this firm’s list it opens nothing and says so in one sentence that names nobody', () => {
    expect(openFromAddress(rows, 'somebody-elses')).toEqual({ says: NOT_ON_THIS_LIST_SAYS })
    // A stranger's id and an id that does not exist read the same.
    expect(openFromAddress(rows, 'never-made')).toEqual(openFromAddress([], 'somebody-elses'))
    expect(NOT_ON_THIS_LIST_SAYS).toBe('That record is not on this list, so there is nothing to open.')
    expect(NOT_ON_THIS_LIST_SAYS.split(/(?<=\.)\s/).length).toBe(1)
  })

  it('an address that asks for nothing does nothing', () => {
    expect(openFromAddress(rows, null)).toBeNull()
    expect(openFromAddress(rows, '')).toBeNull()
  })

  it('the page reads ?open only after the seat and the list have loaded, and picks from the rows it holds', () => {
    const at = CANDIDATES.indexOf("const openId = searchParams.get('open')")
    expect(at).toBeGreaterThan(-1)
    const effect = CANDIDATES.slice(at, CANDIDATES.indexOf('}, [session.loading, firstRead, counted, refused, openId, consultants, router])', at))
    expect(effect).toContain('if (session.loading || !firstRead || !openId) return')
    expect(effect).toContain('openFromAddress(consultants, openId)')
    // It reads nothing new: before her yes, the drawer holds only what the firm typed.
    expect(effect).not.toContain('fetch(')
    expect(CANDIDATES).toContain('{openSays}{\' \'}')
  })
})

describe('the bench’s resend row says what the send did', () => {
  it('a bench invitation sent again reads as sent again where the email went', () => {
    expect(nudgeLogSummary({ actor: 'Noor Haddad', shown: 'Wren Abernathy', act: 'RESEND', status: 'SENT' }))
      .toBe('Noor Haddad sent Wren Abernathy the bench invitation again.')
  })

  it('where the email did not go, the row reads as a try, never as sent', () => {
    for (const status of ['FAILED', 'NOT_CONFIGURED'] as const) {
      const says = nudgeLogSummary({ actor: 'Noor Haddad', shown: 'Wren Abernathy', act: 'RESEND', status })
      expect(says).toBe('Noor Haddad tried to send Wren Abernathy the bench invitation again; the email did not go.')
      expect(says).not.toMatch(/ sent /)
    }
  })

  it('an ask to renew a stay reads as asked only where the email went, and as a try where it did not', () => {
    expect(nudgeLogSummary({ actor: 'Noor Haddad', shown: 'Tomas Ilyin', act: 'RENEW', status: 'SENT' }))
      .toBe('Noor Haddad asked Tomas Ilyin to renew their stay on the bench.')
    expect(nudgeLogSummary({ actor: 'Noor Haddad', shown: 'Tomas Ilyin', act: 'RENEW', status: 'FAILED' }))
      .toBe('Noor Haddad tried to ask Tomas Ilyin to renew their stay on the bench; the email did not go.')
  })

  it('the resend door writes both rows from the send’s own result, and has no sending limit to count against', () => {
    expect(NUDGE).toContain("summary: nudgeLogSummary({ actor: caller.person.name, shown, act: 'RESEND', status: sent.status }),")
    expect(NUDGE).toContain("summary: nudgeLogSummary({ actor: caller.person.name, shown, act: 'RENEW', status: sent.status }),")
    expect(NUDGE).not.toContain('the bench invitation again.`')
    // No cap here, so nothing can be counted against one (founder, 2026-11-15).
    expect(NUDGE).not.toMatch(/countsAgainstCap|PER_HOUR|automationLog\.count|textMessage\.count/)
  })
})

describe('a bench row on the activity log says the tier in words', () => {
  it('before her yes it reads the Add consultant form’s words, never MARKETING or RETAINED', () => {
    expect(tierInWords('MARKETING', true)).toBe('shown to our partners once they say yes')
    expect(tierInWords('RETAINED', true)).toBe('kept to us')
    expect(ADD_TIER_OPTION.MARKETING.toLowerCase()).toBe(tierInWords('MARKETING', true))
    const says = askSummary({ door: 'ADD_CONSULTANT', personName: 'Wren Abernathy', firm: 'Northwind Staffing', path: 'NEW', tier: 'RETAINED', mailOn: true })
    expect(says).toBe('"Wren Abernathy" asked onto Northwind Staffing’s bench (kept to us). Pending their yes from the letter.')
    expect(says).not.toMatch(/MARKETING|RETAINED/)
  })

  it('after her yes it reads the bench’s words, and a tier nobody knows says nothing rather than a machine word', () => {
    expect(tierInWords('MARKETING', false)).toBe(TIER_WORD.MARKETING.toLowerCase())
    expect(tierInWords('RETAINED', false)).toBe('kept to us')
    expect(tierInWords('SOMETHING_NEW', true)).toBeNull()
    expect(askSummary({ door: 'ADD_CONSULTANT', personName: 'Wren Abernathy', firm: 'Northwind Staffing', path: 'NEW', tier: 'SOMETHING_NEW', mailOn: true }))
      .toBe('"Wren Abernathy" asked onto Northwind Staffing’s bench. Pending their yes from the letter.')
  })

  it('a listing asked for, granted or taken back writes the tier in words on its row', () => {
    for (const f of ['src/app/api/bench/listings/route.ts', 'src/app/api/bench/listings/[id]/grant/route.ts', 'src/app/api/bench/listings/[id]/revoke/route.ts']) {
      const src = read(f)
      expect(src, f).toContain('tierInWords(')
      expect(src, f).not.toMatch(/summary: `[^`]*\$\{(listing\.)?tier\}/)
    }
  })
})

describe('where no email can leave, the sentence says what she can do now', () => {
  it('Add consultant and the bench’s answer point to Copy link on Bench, never to a notice or staff', () => {
    expect(INVITE_LINK_KEPT_SAYS).toBe('No email can be sent from here yet. Press Copy link beside their name on Bench, then send it to them yourself.')
    expect(INVITE_LINK_KEPT_SAYS).not.toMatch(/notice|staff/i)
    expect(savingSays('Wren Abernathy', false)).toContain(INVITE_LINK_KEPT_SAYS)
    expect(read('src/app/api/bench/listings/route.ts')).toContain("(mail === 'KEPT' ? ` ${INVITE_LINK_KEPT_SAYS}` : '')")
  })

  it('the sentence shows, copies and returns no link', () => {
    for (const s of [INVITE_LINK_KEPT_SAYS, INVITE_NOT_EMAILED_LOG]) {
      expect(s).not.toMatch(/https?:|\/bench-invite\/|token/i)
    }
  })

  it('every seat that reads it may press Copy link, and Bench draws Copy link beside every unanswered name', () => {
    expect(ADDS_CONSULTANTS).toBe('consultants.write')
    expect(NUDGE).toContain("if (!hasPermission(caller.permissions, 'consultants.write')) {")
    const asked = BENCH.slice(BENCH.indexOf('{ASKED_HEADING}'), BENCH.indexOf("{scope === 'payroll' ? ("))
    expect(asked).toContain('nudge(a.listingId, true)}')
    expect(asked).toContain('>Copy link</button>')
  })

  it('the activity log says the same fact without telling its reader to press anything', () => {
    expect(INVITE_NOT_EMAILED_LOG).toBe('No email can be sent from here yet, so none went. The invitation link can be copied from Bench.')
    expect(askSummary({ door: 'ADD_CONSULTANT', personName: 'Wren Abernathy', firm: 'Northwind Staffing', path: 'NEW', tier: 'MARKETING', mailOn: false }))
      .toContain(`Waiting on their yes. ${INVITE_NOT_EMAILED_LOG}`)
  })
})

describe('Add consultant marks the rate range optional', () => {
  it('the lowest and highest rate say they are optional in the label', () => {
    expect(CANDIDATES).toContain('mb-1">Lowest rate ($/hr, optional)</label>')
    expect(CANDIDATES).toContain('mb-1">Highest rate ($/hr, optional)</label>')
  })

  it('the rate check is unchanged: blank is no rate, and the lowest above the highest is refused', () => {
    expect(listingRates({ min: '', max: '' }, null)).toEqual({ ok: true, rateMin: null, rateMax: null })
    expect(listingRates({ min: '90', max: '60' }, null)).toEqual({ ok: false, says: 'The lowest rate is above the highest. Swap them.' })
    expect(CANDIDATES).toContain('const rates = listingRates({ min: form.rateMin, max: form.rateMax }, null, currency)')
  })
})
