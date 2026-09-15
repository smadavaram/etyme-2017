import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The screens and routes that carry a conversation across a deal.
 *
 * The rule — demand opens, supply answers — is decided in lib/threads
 * and tested there as sentences. What is pinned here is that the routes
 * actually ask it, that the pages put the door where the thing is (the
 * role, the candidate), that a supplier is offered an answer box and
 * never a start button, and that nothing on a screen says an enum.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const OPEN = read('src/app/api/conversations/route.ts')
const MESSAGES = read('src/app/api/conversations/messages/route.ts')
const NOTICES = read('src/lib/thread-notices.ts')
const THREAD = read('src/components/thread.tsx')
const REQ_PAGE = read('src/app/dashboard/requisitions/[id]/page.tsx')
const SUBS_PAGE = read('src/app/dashboard/submissions/page.tsx')
const CONVOS = read('src/app/dashboard/conversations/page.tsx')
const HEADER = read('src/components/shell/header.tsx')
const BELL = read('src/components/notification-bell.tsx')
const SUBMIT = read('src/app/api/submissions/route.ts')
const INVITE = read('src/app/api/access/invite/route.ts')
const RATE = read('src/app/api/me/submissions/[id]/rate/route.ts')

describe('the routes ask the rule, and answer in its words', () => {
  it('opening a thread with another company goes through whoMayOpen, and a refusal is the sentence it wrote', () => {
    expect(OPEN).toContain('const verdict = whoMayOpen(facts, me, other)')
    expect(OPEN).toMatch(/if \(!verdict\.ok\) \{\s*return NextResponse\.json\(\{ error: \{ code: verdict\.code, message: verdict\.message \} \}, \{ status: 403 \}\)/)
  })

  it('the suppliers on a role are everybody invited, cleared, or already submitting', () => {
    expect(OPEN).toContain('...r.invitations.map((i) => i.toCompanyId)')
    expect(OPEN).toContain('...r.submissions.map((s) => s.fromCompanyId)')
    expect(OPEN).toContain('...(r.clearedSupplierIds ?? [])')
  })

  it('a thread across a deal is about a role or a candidate — never a free message to a company', () => {
    expect(OPEN).toContain("if ((topic !== 'REQUIREMENT' && topic !== 'SUBMISSION') || typeof topicId !== 'string' || !topicId)")
    expect(OPEN).toContain('A conversation with another company is about a role or a candidate. Open it from there.')
  })

  it('reading and writing a thread checks both companies on it, and a stranger is told nothing is there', () => {
    expect(MESSAGES).toContain("!canRead(conversation, caller.company?.id)")
    expect(MESSAGES).toContain("(isConsultantSeat(caller) && !inIt)")
    expect(MESSAGES).toContain("message: 'That conversation is not here.'")
    expect(MESSAGES).toMatch(/\{ status: 404 \}/)
  })

  it('the list shows mine and the ones opened with me, and says which side I am on', () => {
    expect(OPEN).toContain('where.OR = [{ companyId: me }, { withCompanyId: me }]')
    expect(OPEN).toContain('const side = sideOf(c, me)')
    expect(OPEN).toContain("otherCompany: side === 'OPENED' ? c.withCompany : side === 'ANSWERS' ? c.company : null")
  })

  it('names on a thread come from seats at the company, never from the request body', () => {
    expect(OPEN).toContain('where: { companyId: me.id, revokedAt: null, personId: { in: askedIds } }')
    expect(OPEN).not.toMatch(/participants:\s*participantList\s*\?\s*participants/)
  })

  it('every note rings the bell through one helper, and the bell opens the thread itself', () => {
    expect(OPEN.match(/void tellThread\(/g)?.length).toBeGreaterThanOrEqual(2)
    expect(MESSAGES).toContain('void tellThread(')
    expect(NOTICES).toContain("type: 'CONVERSATION' as const")
    expect(NOTICES).toContain('entityId: thread.id')
    expect(BELL).toContain("if (entityId && type === 'CONVERSATION') {")
    expect(BELL).toContain('return `/dashboard/conversations?open=${entityId}`')
  })

  it("the consultant's rate thread is the vendor's own, not the one a client opened about them", () => {
    expect(RATE).toContain("withCompanyId: null")
  })
})

describe('the door is where the thing is', () => {
  it('a requisition shows its own Discussion and a thread per supplier on the role, from one component', () => {
    expect(REQ_PAGE).toContain("import { Thread, OWN_NOTES_ON_A_ROLE, toSupplierAboutRole } from '@/components/thread'")
    expect(REQ_PAGE).toContain('<SupplierThreads')
    expect(REQ_PAGE).toContain('suppliers={suppliersOnRole({')
    // Whoever is hiring or runs the program opens; the AP clerk reads.
    expect(REQ_PAGE).toContain("canOpen={hasPermission(permissions, 'requirements.write') || hasPermission(permissions, 'requirements.distribute')}")
  })

  it('a supplier is offered a firm by name and told what will happen — they answer, they cannot start', () => {
    expect(REQ_PAGE).toContain('They answer on the same thread; they cannot start one.')
    expect(REQ_PAGE).toContain('Nobody is on this role yet. Send it to suppliers and you can write to each of them here.')
  })

  it('a candidate row opens a thread with the firm that sent them; the firm that sent them gets an answer box, not a start button', () => {
    expect(SUBS_PAGE).toContain("{direction === 'received' ? `Message ${row.fromCompany.name}` : 'Messages'}")
    expect(SUBS_PAGE).toContain("canOpen={direction === 'received'}")
    expect(SUBS_PAGE).toContain('answeringDemand(talk.toCompany.name, talk.person.name)')
    // Not for an internal move: there is no other firm to write to.
    expect(SUBS_PAGE).toContain("{row.kind !== 'INTERNAL' && (")
  })

  it('the supplier side is told, in a sentence, why there is no box yet', () => {
    expect(THREAD).toContain('closed: `${client} opens the conversation about ${about}; you answer it here when they do.`')
    expect(THREAD).toContain('const mayWrite = threadId !== null || canOpen')
  })

  it('the thread says who sees what is typed, under the box', () => {
    expect(THREAD).toContain('foot: `${supplier} sees this. Nobody else does.`')
    expect(THREAD).toContain('foot: `${supplier} sees this. ${candidate} does not.`')
    expect(THREAD).toContain("foot: 'Your own people only. Suppliers never see this.'")
  })
})

describe('the Conversations page and the plus menu tell the truth', () => {
  it('the new-conversation form posts the two fields the route reads, and nothing it does not', () => {
    expect(CONVOS).toContain("body: JSON.stringify({ topic: 'GENERAL', title: form.title.trim(), initialMessage: form.body.trim() })")
    expect(CONVOS).not.toContain('recipientIds')
    expect(CONVOS).not.toContain("channel: form.channel")
  })

  it('the form says how the other kind of conversation starts, from each side', () => {
    expect(CONVOS).toContain('To write to a supplier, open the role or the candidate and message them from there')
    expect(CONVOS).toContain('a supplier does not start one')
  })

  it('a thread across a deal is marked with the firm on the far end, and the topic is said in trade words', () => {
    expect(CONVOS).toContain('with {c.otherCompany.name}')
    expect(CONVOS).toContain("REQUIREMENT: 'a role'")
    expect(CONVOS).toContain("SUBMISSION:  'a candidate'")
    // The enum used to sit on the chip.
    expect(CONVOS).not.toMatch(/\{c\.topic\}<\/span>/)
  })

  it('the bell lands on the thread it rang about', () => {
    expect(CONVOS).toContain("const openId = searchParams.get('open')")
  })

  it('the plus menu no longer promises to message a client or a vendor from nowhere', () => {
    expect(HEADER).not.toContain('Message a client or candidate')
    expect(HEADER).not.toContain('Message a vendor or contractor')
    expect(HEADER.match(/description: 'A note among your own people'/g)?.length).toBe(2)
  })
})

describe('two refusals that used to speak in codes', () => {
  it('a submission to a role paused for re-approval is refused in a sentence, before any hold is placed', () => {
    expect(SUBMIT).toContain("if (requirement.approvalState === 'PENDING_APPROVAL') {")
    expect(SUBMIT).toContain('is paused while ${requirement.company.name} re-approves the money. ')
    expect(SUBMIT).toContain('You will be told when it is open again.')
    expect(SUBMIT.indexOf("approvalState === 'PENDING_APPROVAL'")).toBeLessThan(SUBMIT.indexOf('const toCompanyId ='))
  })

  it('an invitation refused says who can invite, not which permission is missing', () => {
    expect(INVITE).toContain('Only the account owner or an admin at ${caller.company.name} can invite somebody.')
    expect(INVITE).not.toContain('needs team.manage')
  })
})
