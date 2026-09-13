import { describe, it, expect } from 'vitest'
import {
  whoMayOpen, canRead, sideOf, whoHears, withAuthor, messageNotice, suppliersOnRole,
  type RoleFacts, type CandidateFacts,
} from '@/lib/threads'

/**
 * Conversations between a client and its suppliers.
 *
 * The founder, on the 2017 rule: "we did not want demand side to be
 * spammed and cold-messaged by supply side, but important conversations
 * initiated from demand side should be solved." So: demand opens, supply
 * answers, and a thread reaches nobody who is not on the deal.
 */

const nike = { id: 'c-nike', name: 'Nike' }
const cloudepa = { id: 'c-cloudepa', name: 'Cloudepa' }
const pinnacle = { id: 'c-pinnacle', name: 'Pinnacle' }
const stranger = { id: 'c-stranger', name: 'Somebody Else Staffing' }

const role: RoleFacts = {
  kind: 'REQUIREMENT',
  id: 'r1',
  title: 'Kinaxis planners',
  demandCompanyId: nike.id,
  supplierIds: [cloudepa.id, pinnacle.id],
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
    expect(whoMayOpen(role, nike, cloudepa)).toEqual({ ok: true, title: 'Kinaxis planners' })
  })

  it('a supplier cannot open one with the client; it is told to submit or answer the invitation instead', () => {
    const v = whoMayOpen(role, cloudepa, nike)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.code).toBe('SUPPLY_ANSWERS')
    expect(v.message).toBe(
      'Nike opens the conversation on Kinaxis planners; Cloudepa answers it. ' +
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
    const primesRole: RoleFacts = { ...role, demandCompanyId: pinnacle.id, supplierIds: [cloudepa.id] }
    expect(whoMayOpen(primesRole, pinnacle, cloudepa).ok).toBe(true)
    expect(whoMayOpen(primesRole, cloudepa, pinnacle)).toMatchObject({ ok: false, code: 'SUPPLY_ANSWERS' })
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
    const v = whoMayOpen(candidate, nike, cloudepa)
    expect(v).toMatchObject({ ok: false, code: 'NOT_ON_THE_ROLE' })
    if (!v.ok) expect(v.message).toBe('Mei-Lin Chao came from Pinnacle, not Cloudepa.')
  })
})

describe('who may read a thread', () => {
  const across = { companyId: nike.id, withCompanyId: pinnacle.id }
  const own = { companyId: nike.id, withCompanyId: null }

  it('both companies on the thread can read it, and nobody else', () => {
    expect(canRead(across, nike.id)).toBe(true)
    expect(canRead(across, pinnacle.id)).toBe(true)
    expect(canRead(across, cloudepa.id)).toBe(false)
    expect(canRead(across, null)).toBe(false)
  })

  it("a company's own notes are read by that company only — a supplier on the role never sees Discussion", () => {
    expect(canRead(own, nike.id)).toBe(true)
    expect(canRead(own, pinnacle.id)).toBe(false)
  })

  it('each side knows which side it is', () => {
    expect(sideOf(across, nike.id)).toBe('OPENED')
    expect(sideOf(across, pinnacle.id)).toBe('ANSWERS')
    expect(sideOf(across, cloudepa.id)).toBeNull()
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
        author: { name: 'Dana Whitlock', companyName: 'Nike' },
        threadTitle: 'Kinaxis planners',
        body: 'Can Mei-Lin start a week earlier?',
      })
    ).toEqual({
      title: 'Dana Whitlock at Nike on Kinaxis planners',
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
        invited: [pinnacle, cloudepa],
        submittedFrom: [pinnacle],
        cleared: [cloudepa, { id: 'c-tekwave', name: 'TekWave' }],
      }).map((f) => f.name)
    ).toEqual(['Cloudepa', 'Pinnacle', 'TekWave'])
  })
})
