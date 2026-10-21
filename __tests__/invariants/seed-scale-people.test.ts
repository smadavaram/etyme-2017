/**
 * The generated world's people (lib/seed-scale/people, supply), decided
 * without the database: who the two thousand are, where each sits, which
 * bench holds them by their own yes, and every line they worked or work.
 * The integration file (`__integration__/seed-scale.test.ts`) reads the
 * same rules off the written rows.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { anchorSeed, day } from '@/lib/seed-days'
import { STAY_CHOICES } from '@/lib/bench-stay'
import { daysFor, daysOnSite } from '@/lib/tenure-days'
import { buildFrame } from '@/lib/seed-scale/frame'
import { INDUSTRIES, skillsOf } from '@/lib/seed-scale/industries'
import { sharedTails } from '@/lib/seed-scale/kit'
import { CAREER_MIX, GSI_STAFF, NEAR_TIME_LIMIT_SHARE, SCALE, SCALE_EMAIL_SUFFIX, type ScaleFrame } from '@/lib/seed-scale/types'
import { buildPeople, careerCounts, peopleStepNames, planPeople, rungIds, tally, type PersonPlan } from '@/lib/seed-scale/people'
import { roleKeyOf, timeLimitMonths } from '@/lib/seed-scale/frame'

let frame: ScaleFrame
let people: PersonPlan[]

beforeAll(() => {
  anchorSeed(new Date('2026-10-20T00:00:00Z'))
  frame = buildFrame()
  people = planPeople(frame)
})

describe('the generated world’s two thousand people, before anything is written', () => {
  it('the career mix is the founder’s: freshers, ten-year engineers between projects, people with their own company, people looking while employed, people placed today, and the rest', () => {
    const t = tally(people)
    expect(people).toHaveLength(SCALE.people)
    expect(t.careers).toEqual(careerCounts())
    for (const [career, share] of Object.entries(CAREER_MIX)) {
      expect(Math.abs(t.careers[career as keyof typeof t.careers] - share * SCALE.people), career).toBeLessThanOrEqual(1)
    }
    expect(t.gsiStaff).toBe(GSI_STAFF)
    // About four hundred lines open today, as the frame expects, and a few more of people's own companies.
    expect(t.live).toBeGreaterThanOrEqual(400)
    expect(t.live).toBeLessThan(520)
  })

  it('healthcare, manufacturing and finance sit beside IT, each a real share of the people', () => {
    const t = tally(people)
    for (const i of INDUSTRIES) expect(t.industries[i.key], i.key).toBeGreaterThan(SCALE.people * 0.1)
    // Some have worked across two industries, and carry both trades' skills.
    const across = people.filter((p) => new Set(p.lines.map((l) => l.industry)).size > 1)
    expect(across.length).toBeGreaterThan(20)
  })

  it('the same frame gives the same people, ids, names and rates on every call', () => {
    const a = JSON.stringify(buildPeople(buildFrame()))
    const b = JSON.stringify(buildPeople(buildFrame()))
    expect(a).toBe(b)
  })

  it('every person has an address of their own at the reserved generated domain, and nobody shares a name', () => {
    const emails = new Set(people.map((p) => p.facts.email))
    expect(emails.size).toBe(people.length)
    for (const p of people) expect(p.facts.email.endsWith(SCALE_EMAIL_SUFFIX), p.facts.email).toBe(true)
    const staff = frame.firms.flatMap((f) => f.seats.map((s) => s.name))
    const names = [...people.map((p) => p.facts.name), ...staff]
    expect(new Set(names).size).toBe(names.length)
  })

  it('nobody employed at one firm shares a first name, a last name or its first four letters with a colleague there', () => {
    const at = new Map<string, string[]>()
    for (const f of frame.firms) at.set(f.id, f.seats.map((s) => s.name))
    for (const p of people) if (p.employment) at.get(p.employment.firmId)!.push(p.facts.name)
    for (const [firm, names] of at) {
      const first = names.map((n) => n.split(' ')[0])
      const last = names.map((n) => n.split(' ').slice(1).join(' '))
      const prefix = last.map((l) => l.toLowerCase().replace(/[^a-z]/g, '').slice(0, 4))
      expect(new Set(first).size, firm).toBe(names.length)
      expect(new Set(last).size, firm).toBe(names.length)
      expect(new Set(prefix).size, firm).toBe(names.length)
    }
  })

  it('every skill a person holds comes from the closed vocabulary, three to seven of them', () => {
    const vocabulary = new Set(INDUSTRIES.flatMap((i) => skillsOf(i.key)))
    for (const p of people) {
      expect(p.facts.skills.length, p.facts.name).toBeGreaterThanOrEqual(3)
      expect(p.facts.skills.length, p.facts.name).toBeLessThanOrEqual(7)
      for (const s of p.facts.skills) expect(vocabulary.has(s), `${p.facts.name}: ${s}`).toBe(true)
      for (const s of p.facts.role.skills) expect(p.facts.skills, p.facts.name).toContain(s)
    }
  })

  it('a listing is the person’s own yes, for a stay from the allowed list or until cancelled, at their firm or one it trades with', () => {
    const tradesWith = (a: string, b: string) => frame.trades.some((t) => (t.seller === a && t.buyer === b) || (t.seller === b && t.buyer === a))
    let live = 0
    for (const p of people) {
      for (const l of p.listings) {
        if (l.state !== 'GRANTED') {
          // Asked and not answered, or answered no: never on a bench.
          expect(l.revokedAt == null || l.state === 'DECLINED', p.facts.name).toBe(true)
          continue
        }
        expect(l.respondedAt, p.facts.name).not.toBeNull()
        expect(l.grantedAt >= l.invitedAt, p.facts.name).toBe(true)
        if (l.stayDays != null) expect(STAY_CHOICES as readonly number[]).toContain(l.stayDays)
        if (l.revokedAt) continue
        live++
        const home = p.facts.listing?.firmId ?? p.facts.firmId
        expect(l.firmId === home || tradesWith(home, l.firmId), `${p.facts.name} at ${l.firmId}`).toBe(true)
        if (l.stayDays != null) expect(l.grantedAt.getTime() + l.stayDays * 86_400_000).toBeGreaterThan(day(0).getTime())
      }
    }
    expect(live).toBeGreaterThan(SCALE.people / 2)
  })

  it('an integrator’s own staff are on its payroll with no listing, because the employment is the consent', () => {
    for (const p of people.filter((x) => x.gsiStaff)) {
      expect(p.listings, p.facts.name).toEqual([])
      expect(p.facts.listing).toBeNull()
      expect(frame.byId.get(p.employment!.firmId)!.position).toBe('GSI')
      for (const l of p.lines) expect(l.chain, p.facts.name).toEqual([p.employment!.firmId])
    }
  })

  it('every line runs through firms that trade with each other, and pays at or under what it bills at every rung', () => {
    const paper = new Set(frame.trades.filter((t) => t.agreementId).map((t) => `${t.seller}|${t.buyer}`))
    for (const p of people) {
      for (const l of p.lines) {
        l.chain.forEach((seller, r) => {
          const buyer = r === 0 ? l.clientId : l.chain[r - 1]
          if (!(l.ownCompany && r === l.chain.length - 1)) expect(paper.has(`${seller}|${buyer}`), `${p.facts.name} ${l.key} rung ${r}`).toBe(true)
          expect(l.rates[r].payCents).toBeLessThanOrEqual(l.rates[r].billCents)
          expect(l.rates[r].payCents).toBeGreaterThan(0)
          // The rung below bills exactly what this rung pays.
          if (r + 1 < l.chain.length) expect(l.rates[r + 1].billCents).toBe(l.rates[r].payCents)
        })
        expect(l.end >= l.start, p.facts.name).toBe(true)
        if (l.live) expect(l.end > day(0)).toBe(true)
        else expect(l.end <= day(0)).toBe(true)
      }
    }
  })

  it('at most one person in twenty sits within two months of a client’s time limit, some do, and nobody is past one', () => {
    let near = 0
    for (const p of people) {
      const at = new Map<string, { startDate: Date; endDate: Date }[]>()
      for (const l of p.lines) at.set(l.clientId, [...(at.get(l.clientId) ?? []), { startDate: l.start, endDate: l.end }])
      let isNear = false
      for (const [client, periods] of at) {
        const cap = daysFor(timeLimitMonths(frame.byId.get(client)!))
        const days = daysOnSite(periods, day(0))
        expect(days, p.facts.name).toBeLessThan(cap)
        if (days >= cap - 61) isNear = true
      }
      if (isNear) near++
    }
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThanOrEqual(NEAR_TIME_LIMIT_SHARE * SCALE.people)
  })

  it('nobody is on a firm’s record before the firm is, and every employee was seated after its Owner', () => {
    for (const p of people) {
      for (const l of p.lines) {
        for (const id of l.chain) {
          const f = frame.byId.get(id)
          if (f) expect(l.start > f.seats[0].grantedAt, `${p.facts.name} at ${f.name}`).toBe(true)
        }
      }
      if (p.employment) {
        const f = frame.byId.get(p.employment.firmId)!
        expect(p.employment.grantedAt > f.seats[f.seats.length - 1].grantedAt, `${p.facts.name} at ${f.name}`).toBe(true)
      }
    }
  })

  it('a fresher finished the bench firm’s course before saying yes to its bench', () => {
    for (const p of people.filter((x) => x.facts.career === 'FRESHER')) {
      expect(p.enrollment, p.facts.name).not.toBeNull()
      expect(frame.byId.get(p.enrollment!.firmId)!.position).toBe('BENCH')
      expect(p.listings[0].grantedAt > p.enrollment!.completedAt, p.facts.name).toBe(true)
      expect(p.lines).toEqual([])
    }
  })

  it('a résumé says what the person did and never says whether they may work in the US', () => {
    for (const p of people) {
      expect(p.resume, p.facts.name).toContain(p.facts.name)
      expect(p.resume.toLowerCase(), p.facts.name).not.toMatch(/authori[sz]ation|visa|citizen|green card|h-?1b|\bopt\b/)
    }
  })

  it('no discipline role is a role the demo doors open, and no two contracts share an invoice number’s tail', () => {
    for (const p of people.filter((x) => x.employment)) expect(roleKeyOf(p.facts.role.title), p.facts.role.title).toBeNull()
    const sells = people.flatMap((p) => p.lines.flatMap((l) => l.chain.map((_, r) => rungIds(p, l, r).sell)))
    expect(sharedTails(sells)).toEqual([])
  })

  it('the steps are named for the architect to run after the frame’s', () => {
    const names = peopleStepNames(frame)
    expect(names[0]).toBe('scale:people:persons')
    expect(names.at(-1)).toBe('scale:people:placements')
    expect(names.filter((n) => n.startsWith('scale:people:own-companies:')).length).toBeGreaterThan(1)
  })
})
