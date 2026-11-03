import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  whoMayOpen, canRead, sideOf, whoHears, withAuthor, messageNotice, suppliersOnRole,
  hearsForTopic, whoAtTheFirmHears, mayMessageSupplier, seatWritesFor, writesFor, PROGRAM_WRITES,
  type RoleFacts, type CandidateFacts,
} from '@/lib/threads'
import { rolesFor } from '@/lib/company-defaults'

/**
 * Conversations between a client and its suppliers.
 *
 * The founder, on the 2017 rule: "we did not want demand side to be
 * spammed and cold-messaged by supply side, but important conversations
 * initiated from demand side should be solved." So: demand opens, supply
 * answers, and a thread reaches nobody who is not on the deal.
 */

const nike = { id: 'c-nike', name: 'Northbend Athletic' }
const techpeple = { id: 'c-techpeple', name: 'Techpeple' }
const pinnacle = { id: 'c-pinnacle', name: 'Pinnacle' }
const stranger = { id: 'c-stranger', name: 'Somebody Else Staffing' }

const role: RoleFacts = {
  kind: 'REQUIREMENT',
  id: 'r1',
  title: 'Kinaxis planners',
  demandCompanyId: nike.id,
  supplierIds: [techpeple.id, pinnacle.id],
}

const candidate: CandidateFacts = {
  kind: 'SUBMISSION',
  id: 's1',
  roleTitle: 'Kinaxis planners',
  candidateName: 'Mei-Lin Chao',
  toCompanyId: nike.id,
  fromCompanyId: pinnacle.id,
  fromCompanyName: 'Pinnacle',
}

describe('who may open a conversation about a role', () => {
  it('the client can open one with a supplier it asked to work the role', () => {
    expect(whoMayOpen(role, nike, techpeple)).toEqual({ ok: true, title: 'Kinaxis planners' })
  })

  it('a supplier cannot open one with the client; it is told to submit or answer the invitation instead', () => {
    const v = whoMayOpen(role, techpeple, nike)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.code).toBe('SUPPLY_ANSWERS')
    expect(v.message).toBe(
      'Northbend Athletic opens the conversation on Kinaxis planners; Techpeple answers it. ' +
      'Submit a candidate, or answer the invitation, and they hear from you that way.'
    )
  })

  it('the client cannot message a firm that is not on the role, and is told to invite them', () => {
    const v = whoMayOpen(role, nike, stranger)
    expect(v).toMatchObject({ ok: false, code: 'NOT_ON_THE_ROLE' })
    if (!v.ok) expect(v.message).toContain('Invite them')
  })

  it('a firm with nothing to do with the role is refused in one line', () => {
    expect(whoMayOpen(role, stranger, nike)).toMatchObject({ ok: false, code: 'NOT_YOURS' })
  })

  it('a thread with yourself is a note, and the refusal says where notes go', () => {
    const v = whoMayOpen(role, nike, nike)
    expect(v).toMatchObject({ ok: false, code: 'SAME_SIDE' })
    if (!v.ok) expect(v.message).toContain('Discussion')
  })

  it('a prime that posted a role is the demand side toward its subs — the rule is a position, not a company kind', () => {
    const primesRole: RoleFacts = { ...role, demandCompanyId: pinnacle.id, supplierIds: [techpeple.id] }
    expect(whoMayOpen(primesRole, pinnacle, techpeple).ok).toBe(true)
    expect(whoMayOpen(primesRole, techpeple, pinnacle)).toMatchObject({ ok: false, code: 'SUPPLY_ANSWERS' })
  })
})

describe('who may open a conversation about a candidate', () => {
  it('the firm that received the candidate can open one with the firm that sent them, titled by both', () => {
    expect(whoMayOpen(candidate, nike, pinnacle)).toEqual({ ok: true, title: 'Mei-Lin Chao · Kinaxis planners' })
  })

  it('the firm that sent the candidate cannot open one; the status and the rounds are already theirs to read', () => {
    const v = whoMayOpen(candidate, pinnacle, nike)
    expect(v).toMatchObject({ ok: false, code: 'SUPPLY_ANSWERS' })
    if (!v.ok) expect(v.message).toContain('interview rounds are already yours to read')
  })

  it('the client cannot open one about this candidate with a different supplier', () => {
    const v = whoMayOpen(candidate, nike, techpeple)
    expect(v).toMatchObject({ ok: false, code: 'NOT_ON_THE_ROLE' })
    if (!v.ok) expect(v.message).toBe('Mei-Lin Chao came from Pinnacle, not Techpeple.')
  })
})

describe('a firm seated in a client’s program writes to the client’s suppliers as the program does', () => {
  const aptiva = { id: 'c-aptiva', name: 'Aptiva Workforce' }
  const pmSeat = { clientCompanyId: nike.id, permissions: ['requirements.read', 'requirements.write', 'submissions.read'] }
  const apSeat = { clientCompanyId: nike.id, permissions: ['timesheets.read', 'payments.record'] }

  it('“Message <supplier>” is drawn for the firm the candidate was submitted to and for a seat in its program that writes for it, exactly where the route lets it open', () => {
    expect(mayMessageSupplier(candidate, nike.id)).toBe(true)
    expect(mayMessageSupplier(candidate, aptiva.id, pmSeat)).toBe(true)
    expect(whoMayOpen(candidate, aptiva, pinnacle, { seatedAt: nike, seatWrites: true })).toEqual({ ok: true, title: 'Mei-Lin Chao · Kinaxis planners' })
    // The same seat on a role: it writes to a supplier on the job as the client does.
    expect(whoMayOpen(role, aptiva, techpeple, { seatedAt: nike, seatWrites: true })).toEqual({ ok: true, title: 'Kinaxis planners' })
    // And never past the client's own rule: a supplier the candidate did not come from is still refused.
    expect(whoMayOpen(candidate, aptiva, techpeple, { seatedAt: nike, seatWrites: true })).toMatchObject({ ok: false, code: 'NOT_ON_THE_ROLE' })
  })

  it('a seat writes under the permission the client’s own program manager holds for it, and a seat whose role does not hold it is told, by name, that the client writes', () => {
    expect(PROGRAM_WRITES).toBe('requirements.write')
    expect(seatWritesFor(pmSeat, nike.id)).toBe(true)
    expect(seatWritesFor(apSeat, nike.id)).toBe(false)
    expect(seatWritesFor(pmSeat, 'c-another-client')).toBe(false)
    expect(mayMessageSupplier(candidate, aptiva.id, apSeat)).toBe(false)
    const v = whoMayOpen(candidate, aptiva, pinnacle, { seatedAt: nike, seatWrites: false })
    expect(v).toEqual({ ok: false, code: 'NOT_YOURS', message: 'Mei-Lin Chao was put forward to Northbend Athletic, so only Northbend Athletic writes to Pinnacle about them.' })
    const r = whoMayOpen(role, aptiva, techpeple, { seatedAt: nike, seatWrites: false })
    expect(r).toEqual({ ok: false, code: 'NOT_YOURS', message: 'Kinaxis planners is Northbend Athletic’s job, so only Northbend Athletic writes to Techpeple about it.' })
  })

  it('a firm with no seat there is never told whose candidate it is, and never offered the button', () => {
    for (const firm of [pinnacle, techpeple, aptiva, stranger]) {
      expect(mayMessageSupplier(candidate, firm.id), firm.name).toBe(whoMayOpen(candidate, firm, pinnacle).ok)
    }
    expect(whoMayOpen(candidate, stranger, pinnacle)).toMatchObject({ ok: false, message: 'Mei-Lin Chao was not submitted to or by you.' })
    expect(mayMessageSupplier(candidate, null)).toBe(false)
    // A seat at another client writes for that client only.
    expect(mayMessageSupplier(candidate, aptiva.id, { ...pmSeat, clientCompanyId: 'c-another-client' })).toBe(false)
  })

  it('the supplier always reads who wrote: a seat’s note says its own firm beside the client’s', () => {
    const sides = { company: nike, withCompany: pinnacle }
    expect(writesFor({ companyId: nike.id, asOffice: 'Aptiva Workforce' }, sides)).toBe('Aptiva Workforce, for Northbend Athletic')
    expect(writesFor({ companyId: nike.id }, sides)).toBe('Northbend Athletic')
    expect(writesFor({ companyId: pinnacle.id }, sides)).toBe('Pinnacle')
    expect(writesFor({ companyId: stranger.id }, sides)).toBeNull()
  })

  it('the thread a seat opens is the client’s, the seat is on it, every read of it is logged with the seat named, and the client’s own notes stay the client’s', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/conversations/route.ts'), 'utf8')
    expect(route).toContain('program = await programSideFor(caller, demandSideOf(facts))')
    expect(route).toContain('where: { companyId: side.id, withCompanyId: other.id, topic, topicId }')
    expect(route).toContain("companyName: asOffice ? `${asOffice}, for ${side.name}` : me.name, asOffice,")
    expect(route).toContain('noteSeatThreadRead(caller, [program.seat]')
    expect(route).toContain('{ companyId: { in: [...programIds] }, withCompanyId: { not: null } }')
    const messages = readFileSync(join(process.cwd(), 'src/app/api/conversations/messages/route.ts'), 'utf8')
    expect(messages).toMatch(/if \(!conversation\.withCompanyId \|\| caller\.region \|\| isConsultantSeat\(caller\)\) return notHere\s*const program = await programSideFor\(caller, conversation\.companyId\)\s*if \(!program\?\.writes\) return notHere\s*void noteSeatThreadRead/)
    const side = readFileSync(join(process.cwd(), 'src/app/api/conversations/program-side.ts'), 'utf8')
    expect(side).toContain("action: 'PROGRAM_READ'")
    expect(side).toContain('reason: seatTrail(seat,')
  })
})

describe('who may read a thread', () => {
  const across = { companyId: nike.id, withCompanyId: pinnacle.id }
  const own = { companyId: nike.id, withCompanyId: null }

  it('both companies on the thread can read it, and nobody else', () => {
    expect(canRead(across, nike.id)).toBe(true)
    expect(canRead(across, pinnacle.id)).toBe(true)
    expect(canRead(across, techpeple.id)).toBe(false)
    expect(canRead(across, null)).toBe(false)
  })

  it("a company's own notes are read by that company only — a supplier on the role never sees Discussion", () => {
    expect(canRead(own, nike.id)).toBe(true)
    expect(canRead(own, pinnacle.id)).toBe(false)
  })

  it('each side knows which side it is', () => {
    expect(sideOf(across, nike.id)).toBe('OPENED')
    expect(sideOf(across, pinnacle.id)).toBe('ANSWERS')
    expect(sideOf(across, techpeple.id)).toBeNull()
  })
})

describe('who hears when somebody writes', () => {
  const dana = { personId: 'p-dana', name: 'Dana Whitlock', companyId: nike.id }
  const marcus = { personId: 'p-marcus', name: 'Marcus Oyelaran', companyId: nike.id }
  const ravi = { personId: 'p-ravi', name: 'Ravi Iyer', companyId: pinnacle.id }

  it("the client's first note reaches the supplier's staff, because nobody there is on the thread yet", () => {
    expect(
      whoHears({ authorId: dana.personId, authorCompanyId: nike.id, participants: [dana], otherSideStaffIds: ['p-ravi', 'p-asha'] }).sort()
    ).toEqual(['p-asha', 'p-ravi'])
  })

  it('once somebody at the supplier has answered, the thread is theirs and the rest of the firm is left alone', () => {
    expect(
      whoHears({ authorId: dana.personId, authorCompanyId: nike.id, participants: [dana, ravi], otherSideStaffIds: ['p-ravi', 'p-asha'] })
    ).toEqual(['p-ravi'])
  })

  it('a colleague on the thread hears too, and the writer never hears about their own note', () => {
    expect(
      whoHears({ authorId: ravi.personId, authorCompanyId: pinnacle.id, participants: [dana, marcus, ravi], otherSideStaffIds: [] }).sort()
    ).toEqual(['p-dana', 'p-marcus'])
  })

  it('answering puts you on the thread once, not every time', () => {
    const once = withAuthor([dana], ravi, new Date('2026-09-12T10:00:00Z'))
    expect(once.map((p) => p.personId)).toEqual(['p-dana', 'p-ravi'])
    expect(once[1].joinedAt).toBe('2026-09-12T10:00:00.000Z')
    expect(withAuthor(once, ravi)).toBe(once)
  })
})

describe('what the notice says', () => {
  it('names who wrote, at which firm, about what, and opens with what they said', () => {
    expect(
      messageNotice({
        author: { name: 'Dana Whitlock', companyName: 'Northbend Athletic' },
        threadTitle: 'Kinaxis planners',
        body: 'Can Mei-Lin start a week earlier?',
      })
    ).toEqual({
      title: 'Dana Whitlock at Northbend Athletic on Kinaxis planners',
      body: 'Can Mei-Lin start a week earlier?',
    })
  })

  it('a long note is cut to a line in the bell; the thread holds the rest', () => {
    const n = messageNotice({ author: { name: 'A', companyName: 'B' }, threadTitle: null, body: 'x'.repeat(300) })
    expect(n.title).toBe('A at B')
    expect(n.body.length).toBe(140)
    expect(n.body.endsWith('…')).toBe(true)
  })
})

describe('which suppliers a client may write to on a role', () => {
  it('everybody invited, cleared or submitting — once each, by name', () => {
    expect(
      suppliersOnRole({
        invited: [pinnacle, techpeple],
        submittedFrom: [pinnacle],
        cleared: [techpeple, { id: 'c-tekwave', name: 'TekWave' }],
      }).map((f) => f.name)
    ).toEqual(['Pinnacle', 'Techpeple', 'TekWave'])
  })
})

/**
 * The desk that acts is the desk that hears. Found by the release pass,
 * 2026-10-19: a client's first note on a job reached every seat at the
 * supplier with any desk, so Pinnacle's AP & Payroll clerk was told
 * about a question on "HCM integration lead" she could not answer.
 * The permissions here are the shipped supplier roles, not copies.
 */
describe('who at a supplier hears a client\'s first note', () => {
  const vendor = (name: string) => {
    const r = rolesFor('VENDOR').find((x) => x.name === name)
    if (!r) throw new Error(`no shipped supplier role called ${name}`)
    return r.permissions as string[]
  }
  const client = (name: string) => {
    const r = rolesFor('CLIENT').find((x) => x.name === name)
    if (!r) throw new Error(`no shipped client role called ${name}`)
    return r.permissions as string[]
  }

  it("a client's question about a job reaches the supplier's recruiter, resource manager and account manager, and not its AP & Payroll clerk", () => {
    expect(hearsForTopic(vendor('Recruiter'), 'REQUIREMENT')).toBe(true)
    expect(hearsForTopic(vendor('Resource Manager'), 'REQUIREMENT')).toBe(true)
    expect(hearsForTopic(vendor('Account Manager'), 'REQUIREMENT')).toBe(true)
    expect(hearsForTopic(vendor('AP & Payroll'), 'REQUIREMENT')).toBe(false)
  })

  it("a client's question about a candidate reaches the people who read submissions, and not the AP & Payroll clerk", () => {
    expect(hearsForTopic(vendor('Recruiter'), 'SUBMISSION')).toBe(true)
    expect(hearsForTopic(vendor('Account Manager'), 'SUBMISSION')).toBe(true)
    expect(hearsForTopic(vendor('AP & Payroll'), 'SUBMISSION')).toBe(false)
  })

  it("HR, Accounts Receivable, Finance, Compliance and the contract manager at a supplier are not told of a client's question about a job, because none of them works one", () => {
    for (const desk of ['HR', 'Accounts Receivable', 'Finance', 'Compliance Officer', 'Contract Manager']) {
      expect(hearsForTopic(vendor(desk), 'REQUIREMENT'), desk).toBe(false)
    }
  })

  it('the owner and the admin hold every permission, so they are told', () => {
    expect(hearsForTopic(vendor('Owner'), 'REQUIREMENT')).toBe(true)
    expect(hearsForTopic(vendor('Admin'), 'SUBMISSION')).toBe(true)
    // The seeded and self-made owner holds the wildcard rather than a list.
    expect(hearsForTopic(['*'], 'REQUIREMENT')).toBe(true)
  })

  it('a colleague who holds no permission yet is still not told, and neither is a worker who reads only their own work', () => {
    expect(hearsForTopic([], 'REQUIREMENT')).toBe(false)
    expect(hearsForTopic(['assignments.read', 'timesheets.read'], 'REQUIREMENT')).toBe(false)
  })

  it('everyone who may act is told: three recruiters at one supplier all hear, and seats that cannot act do not push them out of the count', () => {
    const seats = [
      ...Array.from({ length: 12 }, (_, i) => ({ personId: `ap-${i}`, permissions: vendor('AP & Payroll') })),
      { personId: 'rec-1', permissions: vendor('Recruiter') },
      { personId: 'rec-2', permissions: vendor('Recruiter') },
      { personId: 'rec-3', permissions: vendor('Recruiter') },
      { personId: 'hr', permissions: vendor('HR') },
    ]
    expect(whoAtTheFirmHears(seats, { topic: 'REQUIREMENT', answers: true })).toEqual(['rec-1', 'rec-2', 'rec-3'])
  })

  it("the client's side hears a supplier's note by the old rule, any seat with a desk, so its AP clerk is not dropped", () => {
    const seats = [
      { personId: 'pm', permissions: client('Program Manager') },
      { personId: 'ap', permissions: client('AP Clerk') },
      { personId: 'member', permissions: [] },
    ]
    expect(whoAtTheFirmHears(seats, { topic: 'REQUIREMENT', answers: false })).toEqual(['pm', 'ap'])
  })
})
