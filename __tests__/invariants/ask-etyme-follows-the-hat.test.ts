import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { greetsAsYou, youOffered, noticeHat, noticesForHat, firmHatWithNothing, nothingOfTheFirm, type HatFacts } from '@/app/api/conversations/twin/hat'
import { hearsPaperNotice } from '@/app/api/conversations/twin/notices'
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

  it('a worker’s own consultant seat is greeted as a worker whatever the cookie says, and has no firm hat', () => {
    expect(greetsAsYou(owner({ workerSeat: true, consultantSeat: true, cookieHat: 'firm' }))).toBe(true)
    expect(youOffered(owner({ workerSeat: true, consultantSeat: true }))).toBe(false)
  })

  it('a seat with no role of its own and no work of its own is greeted as a worker, because it has nothing of the firm’s to read', () => {
    expect(greetsAsYou(owner({ workerSeat: true, cookieHat: null, worker: false, permissions: [] }))).toBe(true)
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
    expect(noticesForHat(owner({ workerSeat: true, consultantSeat: true }), 'you', notices)).toHaveLength(3)
  })

  it('in the You hat the threads other companies wrote to the firm wait for the firm hat', () => {
    expect(ROUTE).toMatch(/const threads = own \? \{ shown: \[\], more: 0, noticeIds: \[\] \} : allThreads/)
  })
})

/**
 * The fourth screen walk, 2026-11-03: Karthik Menon, Teleworld's own
 * engineer placed at Corveldt, switched to the Teleworld hat and Ask
 * Etyme still read his own week and the worker's chips, and listed
 * colleagues' paper uploads. This reverses the call of f7692126c that a
 * seat with no role of its own is greeted as a worker in either hat.
 */
describe('Karthik Menon, an integrator’s own engineer with no role on the firm’s book', () => {
  const karthik = (over: Partial<HatFacts> = {}): HatFacts => ({
    workerSeat: true, consultantSeat: false, region: null, cookieHat: null, menuKind: 'GSI',
    worker: true, seatedAtClient: null, permissions: ['assignments.read', 'timesheets.read'], ...over,
  })

  it('Karthik Menon in his firm hat reads a firm greeting that says nothing of the firm’s is addressed to him', () => {
    const f = karthik({ cookieHat: 'firm' })
    expect(youOffered(f)).toBe(true)
    expect(greetsAsYou(f)).toBe(false)
    expect(firmHatWithNothing(f)).toBe(true)
    expect(nothingOfTheFirm('Teleworld')).toBe('Nothing of Teleworld’s is addressed to you; your own work is under You, in the account menu.')
    expect(nothingOfTheFirm('Teleworld Solutions')).toBe('Nothing of Teleworld Solutions’ is addressed to you; your own work is under You, in the account menu.')
    expect(ROUTE).toMatch(/if \(await inFirmHatWithNothing\(caller, request\)\) return nothingOfTheFirmGreeting\(caller, request\)/)
    // No chips and no number in that hat: nothing of the firm's is his to decide.
    expect(ROUTE).toMatch(/party: 'FIRM', client: null, chips: \[\]/)
    expect(ROUTE).toMatch(/inFirmHatWithNothing\(caller, request\)\)\) return NextResponse\.json\(\{ data: \{ total: 0 \} \}\)/)
  })

  it('Karthik Menon in his You hat reads his own week, pay and papers', () => {
    expect(greetsAsYou(karthik({ cookieHat: 'you' }))).toBe(true)
    expect(firmHatWithNothing(karthik({ cookieHat: 'you' }))).toBe(false)
    // Before he chooses, he opens in his own hat, as the account menu does.
    expect(greetsAsYou(karthik())).toBe(true)
  })

  it('a firm seat that holds a role is never told it has nothing of the firm’s', () => {
    expect(firmHatWithNothing(owner({ cookieHat: 'firm' }))).toBe(false)
  })
})

describe('a colleague’s paper is said only to the roles that examine papers', () => {
  const colleague = { subjectPersonId: 'deepa' }

  it('a colleague’s paper upload is never said to a seat without the paper’s permission, in either hat', () => {
    expect(hearsPaperNotice({ personId: 'karthik', permissions: ['assignments.read', 'timesheets.read'] }, colleague)).toBe(false)
    expect(hearsPaperNotice({ personId: 'karthik', permissions: [] }, colleague)).toBe(false)
    // The filter runs before either hat's greeting, and what it holds back is marked read with the rest.
    expect(ROUTE).toMatch(/\.\.\.all\.withheld/)
    expect(ROUTE).toMatch(/\[\.\.\.allNotices\.withheld\]/)
    expect(ROUTE).toMatch(/\.\.\.\(notices\.withheld \?\? \[\]\)/)
  })

  it('HR, the compliance officer and the Owner still hear a colleague’s paper', () => {
    expect(hearsPaperNotice({ personId: 'farah', permissions: ['consultants.read'] }, colleague)).toBe(true)
    expect(hearsPaperNotice({ personId: 'owner', permissions: ['*'] }, colleague)).toBe(true)
  })

  it('a person always hears about their own paper', () => {
    expect(hearsPaperNotice({ personId: 'deepa', permissions: [] }, colleague)).toBe(true)
  })
})
