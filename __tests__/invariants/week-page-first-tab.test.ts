import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { firstTab, waitingWords, linkLine } from '@/app/dashboard/weeks/[id]/first-tab'

const page = readFileSync(join(process.cwd(), 'src/app/dashboard/weeks/[id]/page.tsx'), 'utf8')

describe('the week page opens on the tab its address names (2026-11-14)', () => {
  it('the page opens on the tab its address names, whatever the client is', () => {
    expect(firstTab('EVIDENCE', false)).toBe('EVIDENCE')
    expect(firstTab('LINK', true)).toBe('LINK')
    expect(firstTab('evidence', false)).toBe('EVIDENCE')
  })

  it('with no tab named, a client not on Etyme opens on "Attach evidence" and a client on Etyme on "Approve by email"', () => {
    expect(firstTab(null, true)).toBe('EVIDENCE')
    expect(firstTab(null, false)).toBe('LINK')
    expect(firstTab('something-else', true)).toBe('EVIDENCE')
  })

  it('the page reads the address and the client’s standing, and a press on a tab still changes it', () => {
    expect(page).toContain("const asked = useSearchParams()?.get('mode') ?? null")
    expect(page).toContain('const mode = chosenMode ?? firstTab(asked, seen?.week.clientOffPlatform ?? false)')
    expect(page).not.toContain("useState<'LINK' | 'EVIDENCE'>('LINK')")
    expect(page).toContain("onClick={() => setMode('EVIDENCE')}")
  })
})

describe('a link nobody could email never reads "Link sent" (walk fdf, item 5)', () => {
  it('where no email can leave, an open link reads "Link not sent", and "Link sent, waiting" only where email leaves', () => {
    expect(waitingWords(false).label).toBe('Link not sent')
    expect(waitingWords(true).label).toBe('Link sent, waiting')
  })

  it('the line under the link says it was not sent because email is not set up, and names who asked', () => {
    expect(linkLine(false, 'Desmond Achebe, Brightmoor Staffing', 'Nov 14')).toBe(
      'link not sent, because email is not set up here. Asked for by Desmond Achebe, Brightmoor Staffing on Nov 14'
    )
    expect(linkLine(true, 'Desmond Achebe', 'Nov 14')).toBe('link sent by Desmond Achebe on Nov 14')
  })

  it('the page draws the chip and the line from whether email leaves, and never hard-codes "Link sent, waiting"', () => {
    expect(page).toContain("a.state === 'WAITING' ? waitingWords(seen.emailLeaves) : STATE_WORDS[a.state]")
    expect(page).toContain('linkLine(seen.emailLeaves ||')
    expect(page).not.toContain("'Link sent, waiting'")
    expect(page).toContain("'Email is not set up here, so no link can be sent yet. Attach the approval instead.'")
  })

  it('the week route tells the page whether email can leave, from the one answer every sentence reads', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/week-approvals/route.ts'), 'utf8')
    expect(route).toContain('{ data: { ...out.seen, emailLeaves: mailLeaves() } }')
  })
})
