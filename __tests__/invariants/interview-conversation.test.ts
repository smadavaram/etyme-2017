import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { noticesFor, type NoticeContext } from '@/lib/interview-notices'
import { stateAfterConfirming, rowToInterview } from '@/lib/interviews'

/**
 * A round that moves, and the three people who have to hear about it.
 *
 * The model was right and the conversation was missing: a client
 * proposed a round and the supplier found out by opening the app; the
 * candidate answered and the note was addressed to the candidate; a
 * client said "next round" and nothing on the page let them set it up.
 *
 * Who hears what is decided once, in lib/interview-notices, and tested
 * there. What is pinned here is that the two routes that move a round
 * actually call it, that the candidate's own answer is written as their
 * own word rather than a flat CONFIRMED, and that the page the client
 * reads leads somewhere from both dead ends.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ACTIONS = read('src/app/api/interviews/[id]/route.ts')
const RESPOND = read('src/app/api/me/interviews/[id]/respond/route.ts')
const PAGE = read('src/app/dashboard/interviews/page.tsx')

const ctx: NoticeContext = {
  interviewId: 'iv1',
  submissionId: 'sub1',
  round: 2,
  stage: 'Technical',
  role: 'Workday integrator',
  consultant: { id: 'p-priya', name: 'Priya Raman' },
  client: { id: 'c-nike', name: 'Nike' },
  vendor: { id: 'c-cloudepa', name: 'CloudEPA' },
  requesterId: 'p-dana',
  vendorStaffIds: ['p-bench', 'p-recruiter'],
  slotCount: 3,
  when: new Date('2026-09-15T10:00:00Z'),
  reason: null,
  noShowBy: null,
  timezone: 'UTC',
}

describe('a round that moves is a round somebody hears about', () => {
  it('confirming a round tells the client who asked', () => {
    // The time that stuck is passed, because the route knows which slot
    // was picked and the notice is useless without it.
    expect(ACTIONS).toMatch(/void tell\('CONFIRMED', row\.id, \{ when: chosen\.start \}\)/)
    expect(noticesFor('CONFIRMED', ctx).map((n) => n.personId)).toEqual(['p-dana'])
  })

  it('calling a round off tells everybody, in the words of whoever called it off', () => {
    expect(ACTIONS).toMatch(/void tell\('CANCELLED', row\.id, \{ reason \}\)/)
    const heard = noticesFor('CANCELLED', { ...ctx, reason: 'The manager is out.' })
      .map((n) => n.personId).sort()
    expect(heard).toEqual(['p-bench', 'p-dana', 'p-priya', 'p-recruiter'])
  })

  it("the client's decision tells the supplier the outcome and never the notes", () => {
    expect(ACTIONS).toMatch(
      /outcome === 'ADVANCE' \? 'ADVANCED' : outcome === 'OFFER' \? 'OFFERED' : 'REJECTED'/
    )
    // feedback is the client's own file. Nothing may hand it to tell().
    expect(ACTIONS).not.toMatch(/tell\([^)]*feedback/)
    const rejected = noticesFor('REJECTED', ctx)
    expect(rejected.map((n) => n.personId).sort()).toEqual(['p-bench', 'p-recruiter'])
    expect(rejected.every((n) => !JSON.stringify(n).includes('feedback'))).toBe(true)
  })

  it('a no-show is told against whoever did not turn up', () => {
    expect(ACTIONS).toMatch(/void tell\('NO_SHOW', row\.id, \{ noShowBy: missed \}\)/)
  })

  it('every refusal the route already made still stands', () => {
    for (const code of ['FINISHED', 'SLOT_GONE', 'NO_REASON', 'NOT_YOURS', 'NO_FEEDBACK']) {
      expect(ACTIONS).toContain(`code: '${code}'`)
    }
    // And the submission still moves with the decision.
    expect(ACTIONS).toMatch(/status: 'REJECTED'/)
    expect(ACTIONS).toMatch(/status: 'OFFERED'/)
  })
})

describe('the candidate answering for themselves', () => {
  it("a candidate's answer reaches the client and the supplier, not the candidate", () => {
    expect(RESPOND).toMatch(/void tell\(accepting \? 'ANSWERED_YES' : 'ANSWERED_NO', id,/)
    // The old line addressed the note to the person who wrote it.
    expect(RESPOND).not.toContain('prisma.notification.create')
    expect(RESPOND).not.toMatch(/personId: caller\.person\.id/)

    const yes = noticesFor('ANSWERED_YES', ctx).map((n) => n.personId).sort()
    const no = noticesFor('ANSWERED_NO', { ...ctx, reason: 'I start a contract that week.' })
      .map((n) => n.personId).sort()
    expect(yes).toEqual(['p-bench', 'p-dana', 'p-recruiter'])
    expect(no).toEqual(['p-bench', 'p-dana', 'p-recruiter'])
    expect(yes).not.toContain('p-priya')
    expect(no).not.toContain('p-priya')
  })

  it('a candidate accepting a time is recorded as their own word, and the round is booked only when all three have said so', () => {
    expect(RESPOND).toContain("consultantConfirmedVia: 'SELF'")
    expect(RESPOND).toContain('consultantConfirmedAt: now')
    expect(RESPOND).toContain('scheduledAt: new Date(chosen)')
    expect(RESPOND).toMatch(/data\.state = stateAfterConfirming\(rowToInterview\(\{ \.\.\.interview, \.\.\.data \}\)\)/)
    // Never a flat CONFIRMED written by this route.
    expect(RESPOND).not.toMatch(/state: ?'CONFIRMED'/)

    const row = {
      round: 2, stage: 'Technical', mode: 'VIDEO', state: 'PROPOSED',
      proposedSlots: [], proposedAt: new Date(), durationMins: 60,
      clientConfirmedAt: new Date(), vendorConfirmedAt: null,
      scheduledAt: new Date('2026-09-15T10:00:00Z'),
      noShowBy: null, outcome: null,
    }
    const theirYes = { consultantConfirmedAt: new Date(), consultantConfirmedVia: 'SELF' }
    // The supplier has not said yes yet: two out of three is not booked.
    expect(stateAfterConfirming(rowToInterview({ ...row, ...theirYes }))).toBe('PROPOSED')
    // With the supplier in, and a time settled, it is in three diaries.
    expect(
      stateAfterConfirming(rowToInterview({ ...row, ...theirYes, vendorConfirmedAt: new Date() }))
    ).toBe('CONFIRMED')
  })

  it('declining keeps the round cancelled with the reason on the row, and still writes the automation log', () => {
    expect(RESPOND).toMatch(/state: 'CANCELLED', cancelledAt: now, cancelledReason: reason/)
    expect(RESPOND).toContain('prisma.automationLog.create')
    expect(RESPOND).toContain('reversible: false')
  })

  it('only the person the round is about may answer it, and only while it is still asking', () => {
    expect(RESPOND).toContain("code: 'FORBIDDEN'")
    expect(RESPOND).toContain("code: 'INVALID_STATE'")
    expect(RESPOND).toMatch(/interview\.submission\.personId !== caller\.person\.id/)
  })
})

describe('the interviews page, from the client chair', () => {
  it('after a round goes through, the client can set up the next one from the interviews page', () => {
    expect(PAGE).toContain('ProposeInterviewDialog')
    // And only for somebody who is hiring — the clerk sees no button.
    expect(PAGE).toMatch(/r\.you === 'CLIENT' && mayDecide && r\.outcome === 'ADVANCE' && !laterRoundExists/)
    expect(PAGE).toContain('Set up round {r.round + 1}')
    // The round after this one, for this candidate's submission.
    expect(PAGE).toMatch(/submissionId=\{proposingFor\.submissionId\}/)
    expect(PAGE).toMatch(/round=\{proposingFor\.round \+ 1\}/)
    expect(PAGE).toMatch(/candidate=\{proposingFor\.names\.consultant\}/)
    // And it goes away once that round exists, rather than proposing a
    // second round two.
    expect(PAGE).toMatch(/x\.submissionId === r\.submissionId && x\.round > r\.round/)
  })

  it('the button appears the moment the client says "next round", without a reload', () => {
    // The decision comes back as the row it produced; the list is
    // patched with it before the refetch lands.
    expect(PAGE).toMatch(/setRows\(\(prev\) => prev\.map\(\(r\) => \(r\.id === id \? \{ \.\.\.r, \.\.\.body\.data \} : r\)\)\)/)
  })

  it('what the proposal says is shown back in the same words', () => {
    expect(PAGE).toMatch(/onDone=\{\(says\) => \{/)
    expect(PAGE).toContain('setNote(says)')
  })

  it('the empty state leads somewhere', () => {
    expect(PAGE).toMatch(/Nothing booked\. Interviews start from/)
    expect(PAGE).toMatch(/<Link href="\/dashboard\/submissions"[\s\S]{0,120}a candidate on a role/)
  })

  it("the supplier's side still confirms a time from the row", () => {
    expect(PAGE).toMatch(/r\.you === 'VENDOR' && r\.state === 'PROPOSED'/)
    expect(PAGE).toMatch(/action: 'confirm', slotStart: s\.start, forConsultant: true/)
  })
})
