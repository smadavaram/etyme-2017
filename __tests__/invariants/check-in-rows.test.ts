import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  whatEachWas, whatItWasSays, whyNotSent, notSentChip, NO_ADDRESS_REASON, checkInShown, bodyWaitsSays,
  RESENT_ACTION, RENEW_ACTION, REMINDED_ACTION, type CheckInRow, type CheckInWhat,
} from '@/lib/notify/check-in-rows'

/**
 * Bench check-ins names each row by what it was (fix list, layer five,
 * F3): the tester read a first invitation and a Resend as one check-in
 * listed twice, because both were drawn as "reply" with the same chip.
 */

const at = (min: number) => new Date(Date.UTC(2026, 10, 2, 9, min))
const row = (id: string, o: Partial<CheckInRow> = {}): CheckInRow => ({
  id, personId: 'p1', kind: 'LINK', direction: 'OUT', aboutType: 'LISTING', aboutId: 'L1', at: at(0), ...o,
})

describe('Bench check-ins names each row by what it was', () => {
  it('a first invitation and a resend are named apart on Bench check-ins', () => {
    const rows = [row('m2', { at: at(30) }), row('m1', { at: at(0) })]
    const what = whatEachWas(rows, {
      logs: [{ action: RESENT_ACTION, at: at(30), messageId: 'm2', listingId: 'L1' }],
      firstOnListing: new Map([['L1', 'm1']]),
    })
    expect(what.get('m1')).toBe('INVITED')
    expect(what.get('m2')).toBe('INVITED_AGAIN')
    expect(whatItWasSays('INVITED')).toBe('bench invitation')
    expect(whatItWasSays('INVITED_AGAIN')).toBe('bench invitation, sent again')
  })

  it('a later letter on the same listing that no log names is that invitation sent again, never a second first invitation', () => {
    const what = whatEachWas([row('m1'), row('m2', { at: at(20) })], { logs: [], firstOnListing: new Map([['L1', 'm1']]) })
    expect(what.get('m2')).toBe('INVITED_AGAIN')
  })

  it('an ask to renew and a stay reminder are named by the log written beside them', () => {
    const rows = [row('m1'), row('m2', { at: at(10) }), row('m3', { at: at(40) })]
    const what = whatEachWas(rows, {
      logs: [
        { action: RENEW_ACTION, at: at(10), messageId: 'm2', listingId: 'L1' },
        // Written a second after its send, with no message id.
        { action: REMINDED_ACTION, at: new Date(at(40).getTime() + 1000), messageId: null, listingId: 'L1' },
      ],
      firstOnListing: new Map([['L1', 'm1']]),
    })
    expect(what.get('m2')).toBe('RENEW_ASKED')
    expect(what.get('m3')).toBe('STAY_REMINDED')
    expect(whatItWasSays('RENEW_ASKED')).toBe('asked to renew their bench stay')
    expect(whatItWasSays('STAY_REMINDED')).toBe('reminded their bench stay ends soon')
  })

  it('a stay reminder log written long after a letter does not rename that letter', () => {
    const what = whatEachWas([row('m1'), row('m2', { at: at(10) })], {
      logs: [{ action: REMINDED_ACTION, at: at(59), messageId: null, listingId: 'L1' }],
      firstOnListing: new Map([['L1', 'm1']]),
    })
    expect(what.get('m2')).toBe('INVITED_AGAIN')
  })

  it('an outbound message is never labelled a reply', () => {
    const outbound: CheckInWhat[] = ['INVITED', 'INVITED_AGAIN', 'RENEW_ASKED', 'STAY_REMINDED', 'THANKED', 'MESSAGE', 'FRESHNESS', 'CONSENT', 'OUTCOME', 'PLACED']
    for (const w of outbound) expect(whatItWasSays(w), w).not.toMatch(/repl/i)
    const rows = ['FRESHNESS', 'CONSENT', 'OUTCOME', 'PLACED', 'LINK'].map((kind, i) => row(`o${i}`, { kind, aboutType: null, aboutId: null }))
    for (const [, w] of whatEachWas(rows, { logs: [], firstOnListing: new Map() })) expect(w).not.toBe('REPLIED')
    // The page draws the route's words and keeps no label of its own.
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/texts/page.tsx'), 'utf8')
    expect(page).not.toMatch(/LINK: 'reply'/)
    expect(page).toMatch(/\{m\.what\}/)
  })

  it('only a message the person sent reads replied, and the thank-you after it reads as a thank-you', () => {
    const rows = [
      row('in', { direction: 'IN', kind: 'FRESHNESS', at: at(0) }),
      row('thanks', { aboutType: null, aboutId: null, at: new Date(at(0).getTime() + 5000) }),
      row('other', { aboutType: null, aboutId: null, at: at(50) }),
    ]
    const what = whatEachWas(rows, { logs: [], firstOnListing: new Map() })
    expect(what.get('in')).toBe('REPLIED')
    expect(what.get('thanks')).toBe('THANKED')
    expect(what.get('other')).toBe('MESSAGE')
  })

  it('a try that did not send says why in the words every screen uses for an email that did not go', () => {
    expect(whyNotSent('SENT', null)).toBeNull()
    expect(notSentChip('SENT')).toBeNull()
    expect(whyNotSent('NOT_CONFIGURED', 'No email provider set up, so this was recorded and not sent.')).toBe('No email can be sent from here yet.')
    expect(whyNotSent('FAILED', 'Resend answered 403: The domain is not verified.')).toBe('Etyme’s email sender refused it, so nothing was sent. Etyme has been told.')
    expect(whyNotSent('FAILED', 'Resend answered 429: Too many requests')).toBe('Etyme’s email sender is busy. Try again in a few minutes.')
    expect(whyNotSent('FAILED', NO_ADDRESS_REASON)).toBe('There is no email address on their record, so nothing was sent.')
    expect(notSentChip('FAILED')).toBe('not sent')
    expect(notSentChip('NOT_CONFIGURED')).toBe('not sent')
  })

  it('the reason a person reads never carries the provider’s own words or a status code', () => {
    const says = whyNotSent('FAILED', 'Resend answered 403: The domain northwind-staffing.example is not verified.')!
    expect(says).not.toMatch(/Resend|403|northwind/)
  })
})

describe('Bench check-ins before her yes reads only what the firm typed (batch five, the walk of 2026-11-16)', () => {
  const letter = { personName: 'Daniel Osei', direction: 'OUT', body: 'Hello Daniel,\nNorthwind Staffing would like to list you on its bench.' }

  it('Bench check-ins names a person asked and not answered by the name the firm typed, never the name on her own record', () => {
    const shown = checkInShown(letter, 'Theo Marchetti')
    expect(shown.name).toBe('Theo Marchetti')
    expect(JSON.stringify(shown)).not.toMatch(/Daniel|Osei/)
  })

  it('before her yes the letter that greets her by her own name is not shown to the firm, and the row says when it will be', () => {
    const shown = checkInShown(letter, 'Theo Marchetti')
    expect(shown.body).toBeNull()
    expect(shown.bodyWaits).toBe('This letter is shown here once Theo Marchetti says yes. Until then you read only what you typed.')
  })

  it('before her yes a reply she wrote is not shown either, because her words are not what the firm typed', () => {
    const shown = checkInShown({ personName: 'Daniel Osei', direction: 'IN', body: 'No thanks. Daniel' }, 'Theo Marchetti')
    expect(shown.body).toBeNull()
    expect(shown.bodyWaits).toBe(bodyWaitsSays('Theo Marchetti', 'IN'))
    expect(shown.bodyWaits).toBe('What Theo Marchetti wrote is shown here once they say yes. Until then you read only what you typed.')
  })

  it('where the firm typed no name, the row names her by the address it asked at', () => {
    const shown = checkInShown(letter, 'daniel.osei@harborline-tech.example')
    expect(shown.name).toBe('daniel.osei@harborline-tech.example')
    expect(shown.body).toBeNull()
  })

  it('after her yes, or where the firm reads her record, the row reads her name and the letter as it went', () => {
    expect(checkInShown(letter, null)).toEqual({ name: 'Daniel Osei', body: letter.body, bodyWaits: null })
  })

  it('the line in place of a letter stays under twenty-five words a sentence at a long name', () => {
    const says = bodyWaitsSays('Alexandria Konstantinopoulou-Whitfield', 'OUT')
    for (const sentence of says.split(/(?<=\.)\s+/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(25)
  })

  it('the Bench check-ins route reads every name and body through the one reader of what a firm reads before her yes', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/texts/route.ts'), 'utf8')
    expect(route).toMatch(/firmReadsAt\(/)
    expect(route).toMatch(/checkInShown\(/)
    expect(route).not.toMatch(/person: m\.person,/)
    expect(route).not.toMatch(/body: m\.body,/)
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/texts/page.tsx'), 'utf8')
    expect(page).toMatch(/m\.bodyWaits/)
  })
})
