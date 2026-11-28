import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { firstWords, askerOf, mayAnswerPageAsks, pageAskFromNotice, pageAskDecisions } from '@/lib/page-asks'
import { firmAskNotice } from '@/lib/public-site/firm-page'

/**
 * Record 102, item 1: a question asked on a firm's public page is kept
 * where the firm can find it. The pure words and rules here; the rows are
 * in __integration__/a-question-asked-on-a-firms-page.test.ts.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('who may read a question asked on the firm’s page', () => {
  it('the seats that put candidates forward and the Owner may read it, and nobody else', () => {
    expect(mayAnswerPageAsks(['submissions.create'])).toBe(true)
    expect(mayAnswerPageAsks(['*'])).toBe(true)
    expect(mayAnswerPageAsks(['timesheets.read', 'invoices.read'])).toBe(false)
    expect(mayAnswerPageAsks([])).toBe(false)
  })
})

describe('the card for a question nobody has taken', () => {
  it('a seat that may not answer, or has no firm, is shown no card and the database is not asked', async () => {
    const db = { pageAsk: { findMany: () => { throw new Error('asked') } } } as any
    expect(await pageAskDecisions({ permissions: ['timesheets.read'], company: { id: 'c1' } }, db)).toEqual([])
    expect(await pageAskDecisions({ permissions: ['*'], company: null }, db)).toEqual([])
  })

  it('the card names who asked and the first words, and offers Assign to me, Answered and Not now', async () => {
    const db = {
      pageAsk: {
        findMany: async () => [{ id: 'p1', asked: 'Do you have a Java developer free in January who can work onsite in Dayton?', replyTo: 'dana@corvane.example', name: 'Dana Whitfield', companyName: 'Corvane', createdAt: new Date('2026-11-18T10:00:00Z') }],
      },
    } as any
    const [card] = await pageAskDecisions({ permissions: ['submissions.create'], company: { id: 'c1' } }, db)
    expect(card.title).toBe('Dana Whitfield asked on your page: Do you have a Java developer free in…')
    expect(card.type).toBe('PAGE_ASK')
    expect(card.entityId).toBe('p1')
    expect(card.answerUrl).toBe('/api/page-asks/p1')
    expect(card.acts.map((a) => a.label)).toEqual(['Assign to me', 'Answered', 'Not now'])
  })

  it('a card for a question with no name says her address', () => {
    expect(askerOf({ name: null, replyTo: 'dana@corvane.example' })).toBe('dana@corvane.example')
    expect(firstWords('Short question')).toBe('Short question')
  })

  it('a card asks only for open questions nobody has taken, at the caller’s own firm', async () => {
    let where: any
    const db = { pageAsk: { findMany: async (a: any) => { where = a.where; return [] } } } as any
    await pageAskDecisions({ permissions: ['*'], company: { id: 'firm-1' } }, db)
    expect(where).toEqual({ companyId: 'firm-1', status: 'OPEN', assigneePersonId: null })
  })
})

describe('reading the stored notice back as a question', () => {
  const made = (a: { email: string; asked: string; name: string | null; companyName: string | null }) => {
    const n = firmAskNotice(a)
    return pageAskFromNotice({ ...n, data: { pageAsk: 'FIRST', replyTo: a.email }, companyId: 'c1', createdAt: new Date('2026-11-18T10:00:00Z') })
  }

  it('a notice with a name and a company gives the words, the address, the name and the company', () => {
    expect(made({ email: 'dana@corvane.example', asked: 'Who is free in January?', name: 'Dana Whitfield', companyName: 'Corvane' }))
      .toMatchObject({ asked: 'Who is free in January?', replyTo: 'dana@corvane.example', name: 'Dana Whitfield', companyName: 'Corvane' })
  })

  it('a notice with only a company leaves the name empty rather than guessing it', () => {
    expect(made({ email: 'a@corvane.example', asked: 'Hello', name: null, companyName: 'Corvane' }))
      .toMatchObject({ name: null, companyName: 'Corvane' })
  })

  it('a notice with neither keeps the words and the address and invents no name', () => {
    expect(made({ email: 'a@corvane.example', asked: 'Hello there', name: null, companyName: null }))
      .toMatchObject({ asked: 'Hello there', replyTo: 'a@corvane.example', name: null, companyName: null })
  })

  it('a long question is read from the body, whole, never from the shortened title', () => {
    const asked = 'x'.repeat(200)
    expect(made({ email: 'a@corvane.example', asked, name: null, companyName: null })?.asked).toBe(asked)
  })

  it('a notice that is not a question is left alone, not guessed at', () => {
    expect(pageAskFromNotice({ title: 'Something', body: 'No address here', data: null, companyId: 'c1', createdAt: new Date() })).toBeNull()
    expect(pageAskFromNotice({ title: 't', body: 'q\n\nWrite back to a@b.example. x', data: null, companyId: null, createdAt: new Date() })).toBeNull()
  })
})

describe('the routes that carry it', () => {
  it('the page-ask routes ask the one caller check and refuse through the one refusal that waits for its row', () => {
    for (const p of ['src/app/api/page-asks/route.ts', 'src/app/api/page-asks/[id]/route.ts']) {
      expect(read(p)).toMatch(/getCallerContext/)
      expect(read(p)).toMatch(/refuseUnlessMayAnswer/)
    }
    expect(read('src/app/api/page-asks/door.ts')).toMatch(/await recordRefusal/)
  })

  it('no route takes the firm from the request: the firm is the caller’s own', () => {
    for (const p of ['src/app/api/page-asks/route.ts', 'src/app/api/page-asks/[id]/route.ts']) {
      expect(read(p)).not.toMatch(/companyId['"]?\)|body\.companyId|searchParams\.get\('company/)
    }
  })

  it('every foreign key on the record has an index', () => {
    const s = read('prisma/schema.prisma')
    const model = s.slice(s.indexOf('model PageAsk {'), s.indexOf('enum PageAskStatus'))
    for (const fk of ['assigneePersonId', 'closedById']) expect(model).toContain(`@@index([${fk}])`)
    expect(model).toContain('@@index([companyId, status, createdAt])')
  })
})
