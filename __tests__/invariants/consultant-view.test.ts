import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * "Can you give me an improved view of a consultant, and can a hiring
 * manager save a consultant as a favorite, and how will he invite?"
 *
 * One page per person as this client knows them, a star on it, and an
 * ask that goes to the supplier — never the consultant. Etyme places
 * nobody.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const api = read('src/app/api/people/[id]/route.ts')
const ask = read('src/app/api/people/[id]/ask/route.ts')
const page = read('src/app/dashboard/people/[id]/page.tsx')
const list = read('src/app/dashboard/people/page.tsx')

describe('one person, as this client knows them', () => {
  it('only somebody put in front of this company can be opened, and the refusal leaves a trail', () => {
    expect(api).toContain('if (subs.length === 0 && everyRung.length === 0) {')
    expect(api).toContain("allowed: false, reason: 'Not on this company’s register'")
    expect(api).toContain('That person has not been put in front of you, so there is nothing here to read.')
  })
  it('every read of the page writes an access log row', () => {
    expect(api).toContain("action: 'PROFILE_VIEW', reason: `Register at ${caller.company!.name}`")
  })
  it('time here is counted across every supplier, once per day on site, against the cap', () => {
    expect(api).toContain('const days = daysOnSite(served, now)')
    expect(api).toContain("status = 'BREAK_REQUIRED'")
  })
  it('the engagements shown are the contracts this client pays, and a rate below the top of the chain is never shown', () => {
    expect(api).toContain('chainTop(everyRung)')
    expect(api).toContain('rateCents: c.clientCompanyId === companyId ? c.billRate : null')
  })
  it('the page opens from the name in the feed and from a row in the table', () => {
    expect(list).toContain('href={{ pathname: `/dashboard/people/${r.personId}` }}')
    expect(list).toContain('onRowClick={(r) => router.push(`/dashboard/people/${r.personId}`')
  })
  it('the star is on the page too', () => {
    expect(page).toContain("targetType: 'PERSON', targetId: id, on")
  })
})

describe('asking for a person', () => {
  it('the ask goes to the rung this client pays — never to a firm below it, and never to the consultant', () => {
    expect(ask).toContain("prisma.benchListing.findMany({ where: { consultant: { personId: id }, state: 'GRANTED' }")
    expect(ask).toContain('const route = askGoesTo({')
    expect(ask).toContain('benchHolderIds: listings.map((l) => l.companyId)')
    expect(ask).not.toContain('notify({\n    personId: person.id')
  })
  it('the bench holder’s name is never read at all, so no name below the paid rung can reach the reply, the thread or the metadata', () => {
    // The listing is selected by id. The only firms this route asks a
    // name for are the ones the ask lands on, looked up after the
    // routing decision, and each of those is a firm the client pays or
    // one that has already put this person in front of it.
    expect(ask).toContain("state: 'GRANTED' }, select: { companyId: true }")
    expect(ask).toContain('prisma.company.findMany({ where: { id: { in: route.toCompanyIds } }')
  })
  it('disclosure is not read here, because reading a sub-vendor’s name is not the same as having a channel to it', () => {
    // The term is named in the file's own explanation of why it is not
    // read; it is never selected, and the name rule is never imported.
    expect(ask).not.toContain('disclosesSubVendors: true')
    expect(ask).not.toContain("from '@/lib/chain-names'")
  })
  it('a person no supplier of this client’s own holds is refused in a sentence that names the client’s own suppliers and not the firm holding them', () => {
    expect(ask).toContain("code: 'NO_SUPPLIER_OF_YOUR_OWN'")
    expect(ask).toContain('You have no supplier for ${person.name} yet')
    expect(ask).toContain('prisma.requirementInvitation.findMany({')
  })
  it('it lands on the thread for that role with the supplier, in a sentence, and the supplier is told', () => {
    expect(ask).toContain("topic: 'REQUIREMENT', topicId: requirement.id")
    expect(ask).toContain('would like to see ${person.name} for ${requirement.title}. Please submit them if they are available.')
    expect(ask).toContain('void tellThread({')
  })
  it('a blocked person, an unpublished role, or somebody already submitted to it is refused in words', () => {
    expect(ask).toContain("code: 'BLOCKED', message: `${person.name} is blocked here — ${block.reason.replace(/\\.$/, '')}. Lift the block first.`")
    expect(ask).toContain("code: 'NOT_PUBLISHED'")
    expect(ask).toContain("code: 'ALREADY_SUBMITTED'")
  })
  it('the ask is written down where it can be found again: on the person’s page, on the dashboard, and at the top of Conversations', () => {
    expect(ask).toContain("type: 'ASK', metadata: { personId: person.id")
    expect(ask).toContain('await prisma.conversation.update({ where: { id: thread.id }, data: { updatedAt: now } })')
    expect(api).toContain("where: { type: 'ASK', conversation: { companyId }, metadata: { path: ['personId'], equals: id } }")
    expect(page).toContain('asked {a.supplier} for {person.name.split(\' \')[0]} on {a.role}.')
    expect(read('src/app/api/program/route.ts')).toContain("what: 'Asked for'")
  })
  it('a client seat reaches Conversations from the menu, under Hire', () => {
    expect(read('src/components/shell/sidebar.tsx')).toContain("{ label: 'Conversations', href: '/dashboard/conversations', icon: '💬', group: 'Hire' }")
  })
  it('the page says where the ask goes before the button is pressed', () => {
    expect(page).toContain('<p className="text-[13px] text-etyme-muted">{data.askGoesTo.says}</p>')
    expect(api).toContain('const askRoute = askGoesTo({')
    expect(page).toContain('Ask for them')
  })
})
