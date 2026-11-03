import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { greetsAsYou, youOffered, noticeHat, noticesForHat, type HatFacts } from '@/app/api/conversations/twin/hat'
import { partyOf } from '@/app/api/conversations/twin/ask'

/**
 * Ask Etyme, the chips and the mark follow the hat — the founder,
 * 2026-11-03, "One person, two hats, switched in the account menu": in a
 * firm hat the greeting is the firm's queue; in the You hat it is the
 * person's own week, pay and papers, and the chips are a worker's. One
 * person never sees two numbers for one hat.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ROUTE = read('src/app/api/conversations/twin/route.ts')
const CHAT = read('src/app/dashboard/conversations/ask-etyme.tsx')

/** Sharath at Tapin: the Owner, and on a placement of his own. */
const owner = (over: Partial<HatFacts> = {}): HatFacts => ({
  workerSeat: false, region: null, cookieHat: null, menuKind: 'VENDOR', worker: true, seatedAtClient: null, permissions: ['*'], ...over,
})

describe('which hat Ask Etyme greets', () => {
  it('an Owner who is also a worker is greeted as the firm until they put on the You hat', () => {
    expect(greetsAsYou(owner())).toBe(false)
    expect(greetsAsYou(owner({ cookieHat: 'firm' }))).toBe(false)
  })

  it('an Owner who is also a worker is greeted with their own week, pay and papers in the You hat', () => {
    expect(greetsAsYou(owner({ cookieHat: 'you' }))).toBe(true)
  })

  it('an Owner on no placement, submission or bench is greeted as the firm even where the cookie says "you"', () => {
    expect(greetsAsYou(owner({ cookieHat: 'you', worker: false }))).toBe(false)
  })

  it('a one-person firm is greeted as her firm whatever the cookie says, because she is the firm', () => {
    expect(greetsAsYou(owner({ cookieHat: 'you', menuKind: 'CONSULTANT_CORP' }))).toBe(false)
  })

  it('a seat that reads one region of a client is never greeted as a worker', () => {
    expect(greetsAsYou(owner({ cookieHat: 'you', menuKind: 'CLIENT', region: 'Latin America' }))).toBe(false)
    expect(greetsAsYou(owner({ workerSeat: true, region: 'Latin America' }))).toBe(false)
  })

  it('a worker’s own seat is greeted as a worker in either hat, as it always was', () => {
    expect(greetsAsYou(owner({ workerSeat: true, cookieHat: 'firm' }))).toBe(true)
    expect(greetsAsYou(owner({ workerSeat: true, cookieHat: null, worker: false }))).toBe(true)
    expect(youOffered(owner({ workerSeat: true }))).toBe(false)
  })
})

describe('the greeting, the chips and the mark read one hat', () => {
  it('the greeting and the mark ask the same question of the hat, so one hat never shows two numbers', () => {
    expect(ROUTE).toMatch(/if \(await asYou\(caller, request\)\) return workerGreeting\(caller, request\)/)
    expect(ROUTE).toMatch(/const worker = await asYou\(caller, request\)\n\s+if \(!worker && !caller\.company\)/)
    expect(ROUTE).not.toMatch(/asWorker\(caller\) && !caller\.region/)
  })

  it('a question asked in the You hat is answered from the person’s own work', () => {
    expect(ROUTE).toMatch(/export async function POST[\s\S]{0,300}if \(await asYou\(caller, request\)\) \{/)
  })

  it('the hat is read off the account menu’s own cookie and its own rule', () => {
    const hat = read('src/app/api/conversations/twin/hat.ts')
    expect(hat).toMatch(/readHatCookie\(request\.cookies\?\.get\(HAT_COOKIE\)\?\.value\)/)
    expect(hat).toMatch(/offersYouHat\(f\.menuKind, false, seatFactsOf\(f\)\)/)
  })

  it('the chat draws a worker’s chips before the route answers only in the You hat', () => {
    expect(CHAT).toMatch(/worker: desk\.isConsultant \|\| \(desk\.worker && desk\.hat === 'you'\)/)
    expect(partyOf({ companyKind: 'VENDOR', worker: false })).toBe('FIRM')
    expect(partyOf({ companyKind: 'VENDOR', worker: true })).toBe('WORKER')
  })
})

describe('"Since you last looked" says each notice in the hat it belongs to', () => {
  const notices = [
    { id: 'n1', href: '/dashboard/my-work', title: 'Your week of Oct 25 was signed' },
    { id: 'n2', href: '/dashboard/invoices/abc', title: 'Northbend paid bill INV-12' },
    { id: 'n3', href: '/dashboard/conversations', title: 'Ask Etyme asked you' },
  ]

  it('a notice that opens the person’s own work is said in the You hat and never in the firm hat', () => {
    expect(noticeHat(owner(), '/dashboard/my-work')).toBe('you')
    expect(noticesForHat(owner(), 'you', notices).map((n) => n.id)).toEqual(['n1'])
    expect(noticesForHat(owner(), 'firm', notices).map((n) => n.id)).toEqual(['n2', 'n3'])
  })

  it('a person with one hat hears every notice in it, as before', () => {
    expect(noticesForHat(owner({ worker: false }), 'firm', notices)).toHaveLength(3)
    expect(noticesForHat(owner({ workerSeat: true }), 'you', notices)).toHaveLength(3)
  })

  it('in the You hat the threads other companies wrote to the firm wait for the firm hat', () => {
    expect(ROUTE).toMatch(/const threads = own \? \{ shown: \[\], more: 0, noticeIds: \[\] \} : allThreads/)
  })
})
