import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { submitFields, profileEditBody, wordFor } from '@/lib/bench-filter'
import { freeForJob } from '@/lib/match-pool'
import { stayEndedRow, renewAskText } from '@/lib/bench-stay'
import { historyLine } from '@/lib/shared-consultant'
import { sectionOfHref } from '@/lib/page-framing'

/**
 * The bench tester's findings of 2026-09-30, one by one, as sentences.
 */

const src = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const names = { person: 'Lucia Ferreira', firm: 'Techpeple' }

describe('1 · a prime puts a supplier’s person forward at two prices', () => {
  const fromSupplier = { rate: null, payRate: 10_500, offeredBy: 'techpeple' }

  it('sends what the supplier charges, prefilled from its listing, and what the prime bills', () => {
    expect(submitFields(fromSupplier, { bill: '128' }, names)).toEqual({ ok: true, rate: 12_800, payRate: 10_500 })
  })

  it('a supplier whose listing names no rate is asked about in a sentence, never sent as nothing', () => {
    const v = submitFields({ ...fromSupplier, payRate: null }, { bill: '128' }, names)
    expect(v).toEqual({ ok: false, says: 'Say what Techpeple charges you an hour for Lucia Ferreira. Its listing does not say.' })
    expect(submitFields({ ...fromSupplier, payRate: null }, { bill: '128', pay: '105' }, names)).toEqual({ ok: true, rate: 12_800, payRate: 10_500 })
  })

  it('a firm’s own person goes forward at one price', () => {
    expect(submitFields({ rate: 9_000, payRate: null, offeredBy: null }, {}, names)).toEqual({ ok: true, rate: 9_000, payRate: null })
  })

  it('the row shows both boxes where a supplier stands between', () => {
    const page = src('src/app/dashboard/requirements/[id]/matches.tsx')
    expect(page).toContain('{m.firm.name} charges you $')
    expect(page).toContain("{m.action.offeredBy ? 'You bill $' : '$'}")
    expect(page).not.toContain('payRate: m.action.payRate }')
  })
})

describe('2 · matching never offers somebody who is placed through the job’s start', () => {
  const start = d('2026-10-20')

  it('somebody placed and billing past the day the job starts is not offered', () => {
    expect(freeForJob([{ endsOn: d('2026-12-31') }], start).ok).toBe(false)
  })

  it('somebody rolling off before the job starts is offered, free from the day after', () => {
    const v = freeForJob([{ endsOn: d('2026-10-09') }], start)
    expect(v.ok && v.freeOn?.toISOString().slice(0, 10)).toBe('2026-10-10')
  })

  it('a placement with no end date never ends before anything', () => {
    expect(freeForJob([{ endsOn: null }], start).ok).toBe(false)
  })

  it('somebody on no placement keeps their own free date', () => {
    expect(freeForJob([], start)).toEqual({ ok: true, freeOn: null })
  })

  it('the availability reason reads a free date against today when the job names no start, so it agrees with the row', () => {
    const engine = src('src/lib/match-engine.ts')
    expect(engine).not.toContain('Availability unknown')
    expect(engine).toContain('const from = req.startDate ?? new Date()')
  })
})

describe('3 · somebody whose stay ended stays on the firm’s bench, said so', () => {
  it('reads "Stay ended on <date> · ask to renew"', () => {
    expect(stayEndedRow(d('2026-09-30'))).toBe('Stay ended on September 30, 2026 · ask to renew')
  })

  it('the ask to renew is theirs to answer, in one tap, and promises nothing else', () => {
    const l = renewAskText({ personName: 'Jonas Whitaker', firm: 'Brightmoor Staffing', endedOn: d('2026-09-30'), days: 15, url: 'https://x/renew' })
    expect(l.subject).toBe('Brightmoor Staffing would like you back on its bench')
    expect(l.body).toContain('stay another 15 days')
    expect(l.body).toContain('If you do nothing, nothing changes.')
  })

  it('the bench answer carries the ended stays, and the page shows them with Ask to renew', () => {
    expect(src('src/app/api/bench/route.ts')).toContain("where: { companyId, state: 'GRANTED', lapsedAt: { not: null } }")
    expect(src('src/app/dashboard/bench/page.tsx')).toContain('Ask to renew')
  })
})

describe('4 · a firm’s desks edit a person’s skills, free date and rate floor', () => {
  it('skills are a comma list, the free date a day, the rate floor dollars sent as cents', () => {
    expect(profileEditBody({ skills: 'HCM integration, Boomi, , Boomi', availableFrom: '2026-10-05', rateFloor: '95' }, true))
      .toEqual({ ok: true, body: { skills: ['HCM integration', 'Boomi'], availableFrom: '2026-10-05', rateFloor: 9_500 } })
  })

  it('a desk that does not read pay cannot set the rate floor, and is told whose it is', () => {
    const v = profileEditBody({ skills: '', availableFrom: '', rateFloor: '95' }, false)
    expect(v.ok).toBe(false)
    const ok = profileEditBody({ skills: 'ERP finance', availableFrom: '', rateFloor: '' }, false)
    expect(ok).toEqual({ ok: true, body: { skills: ['ERP finance'], availableFrom: null } })
  })

  it('the consultant page offers the edit to a seat that may change the record', () => {
    const page = src('src/app/dashboard/consultants/page.tsx')
    expect(page).toContain("mayEdit={hasPermission(session.permissions, 'consultants.write')}")
    expect(page).toContain('<ProfileEditor')
  })
})

describe('5 · an invitation nobody has answered', () => {
  it('is counted as "Invited, waiting" and never as marketing', () => {
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).toContain('label="Invited, waiting"')
    expect(page).toContain("entries.filter((e) => agreed(e) && e.tier === 'MARKETING')")
  })

  it('offers Resend and Copy link, through one door that sends only what it may', () => {
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).toContain('>Resend<')
    expect(page).toContain('>Copy link<')
    const route = src('src/app/api/bench/listings/[id]/nudge/route.ts')
    expect(route).toContain("action: 'BENCH_INVITATION_RESENT'")
    expect(route).toContain("said yes and is on your bench. There is nothing to send.")
  })
})

describe('6 · the words', () => {
  it('no screen prints a tier, a kind or a visibility as an enum', () => {
    expect(wordFor('MARKETING')).toBe('Shown to our partners')
    expect(wordFor('NETWORK')).toBe("A partner's bench")
    expect(wordFor('BENCH')).toBe('Our bench')
    expect(wordFor('TRAVEL')).toBe('Travel')
    expect(wordFor(null)).toBe('Not set')
    expect(src('src/app/dashboard/consultants/page.tsx')).toContain('{wordFor(row.tier)}')
  })

  it('the consultants, training and bench eyebrows are the section the reader’s own menu puts them under', () => {
    expect(src('src/app/dashboard/consultants/page.tsx')).not.toContain('<p className="eyebrow">Sell</p>')
    expect(src('src/app/dashboard/training/page.tsx')).not.toContain('<p className="eyebrow">Talent</p>')
    expect(src('src/app/dashboard/bench/page.tsx')).not.toContain('>Procure</div>')
    expect(sectionOfHref('VENDOR', '/dashboard/consultants')).toBe(sectionOfHref('VENDOR', '/dashboard/bench'))
    expect(sectionOfHref('VENDOR', '/dashboard/training')).not.toBeNull()
  })

  it('an owner reads their own consultants’ rates, and a seat that may not is told who does', () => {
    const page = src('src/app/dashboard/consultants/page.tsx')
    expect(page).toContain("setHasCostPermission(hasPermission(session.permissions, 'consultants.cost'))")
    expect(page).not.toContain('>Restricted<')
  })

  it('a placement on a person’s own list never also reads "not sent on yet"', () => {
    expect(historyLine({ status: 'PLACED', client: 'Northbend Athletic', sentOnTo: null })).toBe('placed at Northbend Athletic')
    expect(historyLine({ status: 'SUBMITTED', client: 'Northbend Athletic', sentOnTo: null })).toBe('still with them — not sent on yet')
    expect(historyLine({ status: 'SUBMITTED', client: 'Northbend Athletic', sentOnTo: 'Northbend Athletic' })).toBe('sent on to Northbend Athletic')
  })
})
