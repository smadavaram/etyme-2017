import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  threadIdOf, titleIn, conversationList, conversationHref, UNTITLED, NOT_YOUR_CONVERSATION, NO_TITLE_MATCHES,
  type ListedConversation,
} from '@/app/api/conversations/twin/thread-id'
import { askHref } from '@/app/dashboard/conversations/ask-href'

/**
 * Ask Etyme keeps its conversations and lists them (founder, 2026-11-03,
 * "Conversations are kept and listed"), in the left column of "One app,
 * two tabs" (2026-11-08). The record is lib/ask-etyme-thread's; this is
 * the list, the address and the screen over it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ASK = '/dashboard/conversations/etyme'

const THREADS: ListedConversation[] = [
  { id: 'thr_new_000001', title: null, lastTurnAt: null, createdAt: '2026-11-08T10:00:00Z' },
  { id: 'thr_bills_0002', title: 'Which bills are unpaid?', lastTurnAt: '2026-11-08T09:00:00Z', createdAt: '2026-11-07T10:00:00Z' },
  { id: 'thr_bench_0003', title: 'Who is on the bench?', lastTurnAt: '2026-11-06T09:00:00Z', createdAt: '2026-11-05T10:00:00Z' },
]

describe('a conversation named on the address is taken only as an id', () => {
  it('a conversation’s id on the address or in the body is the conversation named', () => {
    expect(threadIdOf('cmh1x2y3z0000abcd')).toBe('cmh1x2y3z0000abcd')
    expect(threadIdOf('  cmh1x2y3z0000abcd ')).toBe('cmh1x2y3z0000abcd')
  })

  it('anything that is not an id reads as no conversation named, so the newest is read and nothing odd reaches the record', () => {
    for (const raw of [null, undefined, '', 'short', 42, {}, "x'; drop table", 'a'.repeat(65), '../../etc']) {
      expect(threadIdOf(raw), String(raw)).toBeNull()
    }
  })
})

describe('the column lists the seat’s conversations, newest first, each titled by its first question', () => {
  it('a conversation is titled by its first question, and one with no question yet reads “New conversation”', () => {
    expect(titleIn({ title: 'Which bills are unpaid?' })).toBe('Which bills are unpaid?')
    expect(titleIn({ title: null })).toBe(UNTITLED)
    expect(titleIn({ title: '   ' })).toBe('New conversation')
    expect(titleIn({ title: 'Who is\n  on the bench?' })).toBe('Who is on the bench?')
  })

  it('the list keeps the record’s order, an empty conversation just made leading', () => {
    expect(conversationList(THREADS).map((c) => c.shownTitle)).toEqual(['New conversation', 'Which bills are unpaid?', 'Who is on the bench?'])
  })

  it('the conversation open is marked, and where none is named the newest is the one open, as the route reads it', () => {
    expect(conversationList(THREADS, { openId: 'thr_bench_0003' }).filter((c) => c.open).map((c) => c.id)).toEqual(['thr_bench_0003'])
    expect(conversationList(THREADS).filter((c) => c.open).map((c) => c.id)).toEqual(['thr_new_000001'])
  })

  it('the search reads the seat’s own titles, in any case, and an empty search lists them all', () => {
    expect(conversationList(THREADS, { query: 'BENCH' }).map((c) => c.id)).toEqual(['thr_bench_0003'])
    expect(conversationList(THREADS, { query: '  ' })).toHaveLength(3)
    expect(conversationList(THREADS, { query: 'payroll' })).toEqual([])
    expect(NO_TITLE_MATCHES).toBe('No conversation of yours matches that.')
  })

  it('opening a conversation puts it on the address, so a reload keeps the conversation that was open', () => {
    expect(conversationHref(ASK, 'thr_bills_0002')).toBe('/dashboard/conversations/etyme?thread=thr_bills_0002')
    expect(conversationHref(ASK, null)).toBe(ASK)
  })

  it('a pinned question pressed in a conversation already open goes in that conversation', () => {
    expect(askHref('Who applied?', 'thr_bills_0002')).toBe('/dashboard/conversations/etyme?ask=Who%20applied%3F&thread=thr_bills_0002')
    expect(askHref('Who applied?')).toBe('/dashboard/conversations/etyme?ask=Who%20applied%3F')
  })

  it('a link to somebody else’s conversation is refused in one sentence that says where the reader’s own are', () => {
    expect(NOT_YOUR_CONVERSATION).toBe('That conversation is not one of yours, so it is not shown. Your own conversations are in the list on the left.')
    expect(NOT_YOUR_CONVERSATION).not.toMatch(/sorry|desk|program office/i)
  })
})

describe('the route and the screen name the conversation open, and the mark never reads a conversation', () => {
  const route = read('src/app/api/conversations/twin/route.ts')
  const chat = read('src/app/dashboard/conversations/ask-etyme.tsx')
  const page = read('src/app/dashboard/conversations/page.tsx')

  it('the list of conversations is read with nothing marked seen and no greeting built', () => {
    expect(route).toContain("if (request.nextUrl.searchParams.get('only') === 'threads') return conversationsOnly(caller)")
    const only = route.slice(route.indexOf('async function conversationsOnly'), route.indexOf('async function newConversation'))
    expect(only).toContain('listThreads(caller')
    expect(only).not.toContain('markNoticesSeen')
    expect(only).not.toContain('today(')
  })

  it('several conversations never split one queue: the mark’s number is read from the decisions and never from a conversation', () => {
    const owed = route.slice(route.indexOf('async function owedCount'), route.indexOf('async function workerGreeting'))
    expect(owed).not.toMatch(/listThreads|readThread|threadNamed/)
    // And the mark is answered before any conversation is named.
    expect(route.indexOf("=== 'owed') return owedCount")).toBeLessThan(route.indexOf('nameThread(caller, request)'))
  })

  it('a conversation named that is not the seat’s own is refused before anything is answered or kept, on every method', () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const body = route.slice(route.indexOf(`export async function ${method}(`))
      const refusedAt = body.indexOf('await refusedConversation(caller)')
      const acts = ['keep(caller', 'clearThread(caller', 'markCard(caller', 'appendTurn(caller', 'today(readers', 'workerGreeting(caller']
        .map((a) => body.indexOf(a)).filter((i) => i >= 0)
      expect(refusedAt, method).toBeGreaterThan(0)
      expect(refusedAt, method).toBeLessThan(Math.min(...acts))
    }
  })

  it('New conversation is made through the route, whatever hat the person wears, before any question is read', () => {
    const post = route.slice(route.indexOf('export async function POST('))
    expect(post.indexOf('if (body?.start === true) return newConversation(caller)')).toBeLessThan(post.indexOf('asYou(caller, request)'))
  })

  it('a question and its answer go in one conversation, fixed before the first line is kept', () => {
    const keep = route.slice(route.indexOf('async function keep('), route.indexOf('async function newestId'))
    expect(keep).toContain("let threadId = threadNamed(caller) ?? (await newestId(caller))")
    expect(keep).toContain("speaker: 'PERSON', text: question, threadId")
    expect(keep).toContain('cardApprovalIds: cardIdsOf(answer), threadId')
  })

  it('the chat names the conversation open on every read and write, and Clear clears that one', () => {
    expect(chat).toContain('fetch(named(THREAD))')
    expect(chat).toContain("fetch(named(THREAD), { method: 'DELETE' })")
    expect(chat).toContain('...(threadId ? { threadId } : {})')
    expect(route).toContain('clearThread(caller, { threadId: threadNamed(caller) })')
  })

  it('a link to another person’s conversation is drawn as the route’s refusal, never as an empty chat', () => {
    expect(chat).toContain('(res.status === 404 && threadId)) { setRefused(')
  })

  it('the column holds New conversation and search on top, and the seat’s own conversations first, the threads with other people under them', () => {
    expect(page).toContain('onClick={() => void newAskConversation()}')
    expect(page).toContain("body: JSON.stringify({ start: true })")
    const slot = page.slice(page.indexOf('<RailSlot name="conversations">'))
    expect(slot.indexOf('<AskConversationList')).toBeLessThan(slot.indexOf('filtered.map('))
  })

  it('a new conversation opens on its own address, and its first message is the greeting', () => {
    expect(page).toContain('key={askThread ?? \'newest\'}')
    expect(page).toContain('threadId={askThread}')
    expect(page).toContain('conversationHref(ASK_ETYME_HREF, id)')
  })

  it('on a phone the list is one screen behind a back arrow, and the chat is the other', () => {
    expect(chat).toContain('Your conversations')
    expect(chat).toMatch(/onShowList && \(\s*<div className="flex items-center border-b border-etyme-rule\/60 px-2 py-1\.5 md:hidden">/)
    expect(page).toContain('showAsk && phoneList ? (')
  })

  it('the route’s own description no longer speaks of a thread key', () => {
    expect(route).not.toContain('threadKey')
  })

  it('nothing on the list says desk or program office', () => {
    const list = read('src/app/dashboard/conversations/ask-list.tsx') + read('src/app/api/conversations/twin/thread-id.ts')
    expect(list).not.toMatch(/\bdesk\b|program office/i)
  })
})
