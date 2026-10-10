/**
 * The conversation pages draw the shared layer (`@/components/ui`), and the
 * demo door can count a demo seat from the server.
 *
 * Founder's brief, 2026-10-10: Apple-level UX on the existing
 * architecture. Every screen draws one set of states, one page head, one
 * filter row and one form, so a refusal, a wait, an empty list and a
 * reply box read the same on every page. The sentences on these pages do
 * not change; only what draws them does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const create = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { event: { create: (...a: unknown[]) => create(...a) } } }))

import { countDemoStarted, countVisitorEvent } from '@/lib/events'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const TEXTS = read('src/app/dashboard/texts/page.tsx')
const INTERVIEWS = read('src/app/dashboard/interviews/page.tsx')
const CONVOS = read('src/app/dashboard/conversations/page.tsx')
const NOTICES = read('src/app/dashboard/notifications/page.tsx')

describe('the conversation pages draw the shared layer', () => {
  it('Bench check-ins is its refusal sentence alone, waits with a sentence, and heads itself with the shared page head and figures', () => {
    expect(TEXTS).toContain('if (refused) return <RefusedState says={refused} />')
    expect(TEXTS).toContain('if (loading) return <LoadingState says="Opening bench check-ins…" />')
    expect(TEXTS).toContain('<PageHead')
    expect(TEXTS).toContain('<Stat label="No email"')
    expect(TEXTS).toContain('says="Nothing sent yet"')
    expect(TEXTS).not.toContain('<header>')
  })

  it('Interviews is its refusal sentence alone, waits with a sentence, and says "Nothing booked" in the shared empty state', () => {
    expect(INTERVIEWS).toContain('if (refused) return <RefusedState says={refused} />')
    expect(INTERVIEWS).toContain('if (!read && loading) return <LoadingState says="Opening interviews…" />')
    expect(INTERVIEWS).toMatch(/<EmptyState[\s\S]{0,80}Nothing booked\. Interviews start from/)
    expect(INTERVIEWS).toContain('{error && <ErrorState says={error} />}')
    expect(INTERVIEWS).not.toContain('<header>')
  })

  it('Conversations heads itself with the shared page head, filters by topic with the shared chips, and says the reader’s own empty sentence from its framing', () => {
    expect(CONVOS).toContain('<PageHead')
    expect(CONVOS).toContain('<FilterChips')
    expect(CONVOS).toContain('{words.topics && !session.loading && (')
    expect(CONVOS).toContain('actions={!session.loading && words.mayStart ? (')
    expect(CONVOS).toContain('<EmptyState compact says="No conversations yet." detail={words.empty} />')
    expect(CONVOS).not.toContain('filter-tab')
    expect(CONVOS).not.toContain('bg-red-50')
  })

  it('a reply on a conversation is a labelled field that says who reads it, and a refused reply says the route’s sentence instead of vanishing', () => {
    expect(CONVOS).toMatch(/<Field\s+label="Reply"/)
    expect(CONVOS).toContain('? `${activeConvo.otherCompany.name} sees this. Nobody else does.`')
    expect(CONVOS).toContain("error={sendError ?? undefined}")
    expect(CONVOS).toContain('<SubmitButton pending={sending} pendingLabel="Sending…"')
    expect(CONVOS).not.toContain('// silent')
  })

  it('a new conversation is asked for in labelled fields, its refusal said under the form, and its button says it is starting', () => {
    expect(CONVOS).toMatch(/<Field label="What it is about">/)
    expect(CONVOS).toMatch(/<Field label="First note">/)
    expect(CONVOS).toContain('{error && <FormMessage tone="error">{error}</FormMessage>}')
    expect(CONVOS).toContain('pendingLabel="Starting…"')
  })

  it('Notifications heads itself with the shared page head and filters by the reader’s own kinds with the shared chips', () => {
    expect(NOTICES).toContain('<PageHead')
    expect(NOTICES).toContain('<FilterChips')
    expect(NOTICES).toContain('...framing.kinds')
    expect(NOTICES).toContain('<Chip tone={typeTone(n.type)}>{typeLabel(n.type)}</Chip>')
    expect(NOTICES).toContain('<LoadingState says="Opening notifications…" />')
    expect(NOTICES).not.toContain('filter-tab')
  })
})

describe('the demo door counts a demo seat from the server', () => {
  beforeEach(() => {
    create.mockReset()
    create.mockResolvedValue({ id: 'e1' })
  })

  it('a demo seat taken on the server writes the same visitor row the browser’s counter writes: no company, market.demo_started, the visit and the page', async () => {
    const visit = 'a'.repeat(32)
    const said = await countDemoStarted({ page: '/demo', visit })
    expect(said).toEqual({ counted: true, minted: false, says: 'Counted demo_started on /demo.' })
    expect(create).toHaveBeenCalledWith({
      data: {
        companyId: null,
        type: 'market.demo_started',
        subjectType: 'Visit',
        subjectId: visit,
        actorKind: 'VISITOR',
        payload: { page: '/demo', visit },
      },
    })
  })

  it('a demo seat with no visit id is still counted, under a random id made on the server, and says so', async () => {
    const said = await countDemoStarted()
    expect(said.counted).toBe(true)
    expect(said.minted).toBe(true)
    expect(create.mock.calls[0][0].data.subjectId).toMatch(/^[a-f0-9]{32}$/)
    expect(create.mock.calls[0][0].data.payload.page).toBe('/demo')
  })

  it('a page carrying a query string, or a thing the site does not count, is refused in market’s own sentence and nothing is written', async () => {
    const page = await countVisitorEvent('demo_started', { page: '/demo?email=a@b.com', visit: 'b'.repeat(32) })
    expect(page.counted).toBe(false)
    expect(page.says).toMatch(/no query string/)
    const what = await countVisitorEvent('signed_in', { page: '/demo', visit: 'b'.repeat(32) })
    expect(what.counted).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('a count the log could not store never throws, so the demo seat still opens', async () => {
    create.mockRejectedValueOnce(new Error('database is busy'))
    const said = await countDemoStarted({ visit: 'c'.repeat(32) })
    expect(said).toEqual({ counted: false, minted: false, says: 'Not counted. Nothing else is affected.' })
  })
})
