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
  it('the ask goes to the supplier that holds their consent on its bench, else whoever last put them forward — never the consultant', () => {
    expect(ask).toContain("prisma.benchListing.findMany({ where: { consultant: { personId: id }, state: 'GRANTED' }")
    expect(ask).toContain('if (firms.size === 0 && subs[0]) firms.set(subs[0].fromCompany.id, subs[0].fromCompany)')
    expect(ask).not.toContain('notify({\n    personId: person.id')
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
  it('the page says where the ask goes before the button is pressed', () => {
    expect(page).toContain('The ask goes to {data.representedBy.map((r) => r.name).join(\' and \')}')
    expect(page).toContain('Ask for them')
  })
})
