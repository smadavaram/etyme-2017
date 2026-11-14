import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseInviteList, nameFor, inviteLineSays, inviteSummarySays, tooManyInvitesSays,
  resendListingId, drawsSignInLine, MAX_INVITES_AT_ONCE, type InviteLine,
} from '@/lib/consultant-portfolio/bench-invites'
import { INVITE_LINK_KEPT_SAYS } from '@/lib/bench-filter'

/**
 * Tapin's first week (the founder, 2026-11-14, records 68 and 69): invite
 * candidates, several at once, and every rule a single add holds. Found
 * by the walk: search for "invite" found nothing, Candidates had only
 * "Add consultant", one person at a time; a row reading "Asked, not
 * answered" had no way to ask again; and the Bench page called a route
 * HR may not use, three times, on load.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const CANDIDATES = read('src/app/dashboard/consultants/page.tsx')
const DIALOG = read('src/app/dashboard/consultants/invite-candidates.tsx')
const ROUTE = read('src/app/api/consultants/invite/route.ts')

describe('a recruiter invites several candidates in one box', () => {
  it('several addresses can be pasted at once, each with or without a name beside it', () => {
    const items = parseInviteList('Ana Ruiz <ana@example.com>\nben@example.com, Chloe Park chloe@example.com\nDev Rao, dev@example.com')
    expect(items).toEqual([
      { kind: 'EMAIL', email: 'ana@example.com', name: 'Ana Ruiz' },
      { kind: 'EMAIL', email: 'ben@example.com', name: null },
      { kind: 'EMAIL', email: 'chloe@example.com', name: 'Chloe Park' },
      { kind: 'EMAIL', email: 'dev@example.com', name: 'Dev Rao' },
    ])
  })

  it('a name typed after its address belongs to that address', () => {
    expect(parseInviteList('eve@example.com, Eve Stone')).toEqual([{ kind: 'EMAIL', email: 'eve@example.com', name: 'Eve Stone' }])
  })

  it('an address typed twice is asked once', () => {
    const items = parseInviteList('ANA@example.com\nana@example.com; Ana <ana@example.com>')
    expect(items.filter((i) => i.kind === 'EMAIL')).toHaveLength(1)
  })

  it('text that is not an email address is kept as its own line and said, never dropped', () => {
    const items = parseInviteList('ana@example.com\nnot-an-address\nben@')
    expect(items).toEqual([
      { kind: 'EMAIL', email: 'ana@example.com', name: null },
      { kind: 'NOT_AN_EMAIL', raw: 'not-an-address' },
      { kind: 'NOT_AN_EMAIL', raw: 'ben@' },
    ])
    expect(inviteLineSays({ state: 'NOT_AN_EMAIL', raw: 'ben@' })).toBe('“ben@” is not an email address. Nothing was sent.')
  })

  it('a candidate invited with no name is recorded under the part of her address before the @, and a typed name is kept', () => {
    expect(nameFor({ email: 'ana.ruiz@example.com', name: null })).toBe('ana.ruiz')
    expect(nameFor({ email: 'ana@example.com', name: 'Ana Ruiz' })).toBe('Ana Ruiz')
  })

  it('each address is answered in its own sentence: asked, already on your bench, already asked, or said no', () => {
    expect(inviteLineSays({ state: 'ASKED', mail: 'EMAILED' })).toBe('Asked to join your bench. The invitation went by email.')
    expect(inviteLineSays({ state: 'ASKED_ON_OWN_RECORD', mail: 'EMAILED' })).toBe('Already on Etyme, so asked on the record they have. The invitation went by email.')
    expect(inviteLineSays({ state: 'ALREADY_ON' })).toBe('Already on your bench. Nothing was sent.')
    expect(inviteLineSays({ state: 'ALREADY_ASKED' })).toBe('Already asked, and not answered yet. Nothing new was sent. Use Resend on their row.')
    expect(inviteLineSays({ state: 'SAID_NO' })).toBe('Said no to your bench. Nothing was sent; only they can change that.')
  })

  it('where no email can leave, the answers say the links are kept for staff and never that an email went', () => {
    const line = inviteLineSays({ state: 'ASKED', mail: 'KEPT' })
    expect(line).not.toMatch(/went by email/)
    expect(line).toContain('kept for staff')
    const lines: InviteLine[] = [{ email: 'a@example.com', asked: true, state: 'ASKED', says: line }]
    expect(inviteSummarySays(lines, false)).toContain(INVITE_LINK_KEPT_SAYS)
    expect(inviteSummarySays(lines, true)).not.toContain(INVITE_LINK_KEPT_SAYS)
  })

  it('the summary counts who was asked and says nobody is on the bench until they say yes', () => {
    const lines: InviteLine[] = [
      { email: 'a@example.com', asked: true, state: 'ASKED', says: '' },
      { email: 'b@example.com', asked: true, state: 'ASKED', says: '' },
      { email: 'c@example.com', asked: false, state: 'ALREADY_ON', says: '' },
    ]
    expect(inviteSummarySays(lines, true)).toBe('2 people were asked to join your bench. 1 line was not asked; each says why. Nobody is on your bench until they say yes.')
  })

  it(`more than ${MAX_INVITES_AT_ONCE} addresses in one press is refused in a sentence that says to send the rest after`, () => {
    expect(tooManyInvitesSays(25)).toBe(`That is 25 addresses. Invite at most ${MAX_INVITES_AT_ONCE} at a time, then the rest.`)
    expect(ROUTE).toContain('emails.length > MAX_INVITES_AT_ONCE')
  })

  it('every address goes through the one door a single add uses, and the answer returns no link', () => {
    expect(ROUTE).toContain('askOntoBench(')
    expect(ROUTE).toContain('mayAddConsultant(caller.permissions)')
    expect(ROUTE).toContain('mailLeaves()')
    expect(ROUTE).not.toMatch(/inviteUrl|url:/)
  })
})

describe('Candidates offers Invite candidates', () => {
  it('Candidates draws Invite candidates beside Add consultant, only for a seat whose route takes it', () => {
    const block = CANDIDATES.slice(CANDIDATES.indexOf('{mayAdd && ('), CANDIDATES.indexOf('Add consultant\n', CANDIDATES.indexOf('{mayAdd && (')))
    expect(block).toContain('Invite candidates')
    expect(CANDIDATES).toContain("searchParams.get('invite') === '1'")
    expect(DIALOG).toContain("fetch('/api/consultants/invite'")
  })

  it('the invite box is a browser page that imports no server-only file and never shows a link', () => {
    expect(DIALOG).not.toMatch(/@\/lib\/db|@\/app\/api\/|bench-ask|mail-leaves/)
    expect(DIALOG).not.toMatch(/\.url\b|href=/)
    expect(read('src/lib/consultant-portfolio/bench-invites.ts')).not.toMatch(/@\/lib\/db|prisma/)
  })
})

describe('a Candidates row that reads Asked, not answered can be asked again', () => {
  it('a row asked and not answered offers Resend on this firm’s listing, for a seat that may add', () => {
    const row = { standing: 'ASKED', listings: [{ id: 'l1', consent: 'INVITED' }] }
    expect(resendListingId(row, true)).toBe('l1')
    expect(resendListingId(row, false)).toBeNull()
    expect(resendListingId({ standing: 'ON_BENCH', listings: [{ id: 'l1', consent: 'GRANTED' }] }, true)).toBeNull()
    expect(resendListingId({ standing: 'ASKED', listings: [] }, true)).toBeNull()
  })

  it('Resend on Candidates uses the same door as Resend on the Bench tab, and shows its sentence, never its link', () => {
    expect(CANDIDATES).toContain('/api/bench/listings/${listingId}/nudge')
    expect(CANDIDATES).toContain('nudgeBody(false)')
    expect(CANDIDATES).toContain('resendListingId(row, mayAdd)')
    expect(CANDIDATES).not.toMatch(/data\??\.url/)
  })
})

describe('the Bench page calls no route its reader may not use', () => {
  it('a seat that may not give somebody a way to sign in never asks for the sign-in line', () => {
    expect(drawsSignInLine(['consultants.read', 'consultants.write'])).toBe(false)
    expect(drawsSignInLine(undefined)).toBe(false)
    expect(drawsSignInLine(['team.manage'])).toBe(true)
    expect(drawsSignInLine(['*'])).toBe(true)
  })

  it('every sign-in line on the Bench page is drawn only where the seat may give one', () => {
    for (const file of ['src/app/dashboard/bench/page.tsx', 'src/app/dashboard/bench/our-bench.tsx']) {
      const src = read(file)
      const uses = src.split('\n').filter((l) => l.includes('<SignInLink'))
      expect(uses.length, file).toBeGreaterThan(0)
      for (const line of uses) expect(line, file).toMatch(/drawsSignInLine\(|drawsSignIn &&/)
    }
    expect(read('src/app/dashboard/bench/page.tsx')).toContain('drawsSignIn={drawsSignInLine(permissions)}')
  })
})
