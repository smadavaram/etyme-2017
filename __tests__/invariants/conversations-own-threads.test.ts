import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readsOnlyOwnThreads, isOnThread, hearsForTheFirm } from '@/lib/threads'

/**
 * Sign-up walk, round four: the one door lets a seat with no desk open
 * Conversations, because its menu shows the page — what is addressed to
 * it lands there. The route then handed that seat every thread at the
 * company, with the last message and who is on each. A company's inbox
 * is a desk's reading. These sentences pin that a seat with no desk
 * reads only the threads that name it, the way a consultant already did.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const LIST = read('src/app/api/conversations/route.ts')
const MESSAGES = read('src/app/api/conversations/messages/route.ts')
const NOTICES = read('src/lib/thread-notices.ts')
const TEXTS = read('src/app/api/texts/route.ts')

describe('who reads only the threads that name them', () => {
  it('a colleague seated with no desk reads only the threads they are on', () => {
    expect(readsOnlyOwnThreads({ consultant: false, permissions: [], holdsProgramSeat: false })).toBe(true)
  })

  it('a consultant reads only the threads they are on, as before', () => {
    expect(readsOnlyOwnThreads({ consultant: true, permissions: [], holdsProgramSeat: false })).toBe(true)
  })

  it('a seat holding any desk reads every thread at its company, unchanged', () => {
    expect(readsOnlyOwnThreads({ consultant: false, permissions: ['requirements.read'], holdsProgramSeat: false })).toBe(false)
  })

  it('a seat with no desk at home whose firm runs a client’s program office is not narrowed, because it reads under the client’s role', () => {
    expect(readsOnlyOwnThreads({ consultant: false, permissions: [], holdsProgramSeat: true })).toBe(false)
  })

  it('a seat whose permissions are unknown is not mistaken for a seat with no desk', () => {
    expect(readsOnlyOwnThreads({ consultant: false, permissions: undefined, holdsProgramSeat: false })).toBe(false)
  })
})

describe('being named on a thread', () => {
  it('a person on the thread’s participant list is on it', () => {
    expect(isOnThread([{ personId: 'a', name: 'Ana' }, { personId: 'mo', name: 'Mo' }], 'mo')).toBe(true)
  })

  it('a person missing from the list is not on it, and a thread with no list names nobody', () => {
    expect(isOnThread([{ personId: 'a', name: 'Ana' }], 'mo')).toBe(false)
    expect(isOnThread(null, 'mo')).toBe(false)
    expect(isOnThread([null, 'mo'], 'mo')).toBe(false)
  })
})

describe('nobody is told about a thread they cannot open', () => {
  it('a colleague with no desk is not among the staff told of a first note from another company', () => {
    expect(hearsForTheFirm([])).toBe(false)
    expect(hearsForTheFirm(['submissions.read'])).toBe(true)
    expect(NOTICES).toContain('hearsForTheFirm(')
  })
})

describe('the routes ask the rule', () => {
  it('the conversations list narrows through readsOnlyOwnThreads and asks for a program-office seat only for a seat with no desk', () => {
    expect(LIST).toContain('readsOnlyOwnThreads({')
    expect(LIST).toMatch(/isDeskless\(caller\.permissions\) && !isConsultantSeat\(caller\)\s*\? Boolean\(await seatFor\(caller, null\)\)/)
    expect(LIST).toContain('isOnThread(c.participants, caller.person.id)')
  })

  it('the list applies its limit after narrowing, so a reader’s own threads are not lost behind others', () => {
    expect(LIST).toContain('...(onlyMine ? {} : { take: limit })')
    expect(LIST).toContain('.slice(0, limit)')
  })

  it('opening or writing on a company thread a seat with no desk is not on is refused in the door’s own sentence', () => {
    expect(MESSAGES).toContain("noDeskYet('That conversation', caller.company?.name)")
    expect(MESSAGES).toContain("code: 'NO_DESK'")
  })

  it('a stranger to both companies on a thread is still told it is not here', () => {
    expect(MESSAGES).toContain("message: 'That conversation is not here.'")
    expect(MESSAGES).toContain('if (!conversation || !canRead(conversation, caller.company?.id)) return notHere')
  })

  it('bench check-ins already refuse any seat that holds none of the desks that read them, so they need no narrowing', () => {
    expect(TEXTS).toContain('if (!hasAnyPermission(caller.permissions, CHECK_IN_READERS))')
  })
})
