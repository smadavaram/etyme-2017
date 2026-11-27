import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')
const page = read('src/app/dashboard/companies/outreach/page.tsx')
const batchPage = read('src/app/dashboard/companies/outreach/[id]/page.tsx')

describe('outreach screens say a letter goes only where email can leave', () => {
  it('the batch screen never says the letters go on the next run without asking whether email can leave', () => {
    expect(batchPage).toContain('view.mail ?')
    expect(batchPage).not.toMatch(/Approved\. The letters go on the next run/)
  })
  it('the batch screen says no email can be sent from here yet when none can', () => {
    expect(batchPage).toContain('No email can be sent from here yet')
  })
  it('the page that raises a batch warns that letters wait where email cannot leave', () => {
    expect(page).toContain('setup.mail')
    expect(page).toContain('No email can be sent from here yet')
  })
  it('both outreach routes hand the screens the same mail answer from mailLeaves', () => {
    expect(read('src/app/api/outreach/batches/[id]/route.ts')).toContain('mail: mailLeaves()')
    expect(read('src/lib/outreach/batch.ts')).toContain('mail: mailLeaves()')
  })
  it('the dormant check-in counts a batch letter in its 180 days', () => {
    const s = read('src/lib/agents/dormant-outreach.ts')
    expect(s).toMatch(/A batch letter to that company counts too/)
    expect(s).toContain('outreachLetter.findMany')
  })
})
