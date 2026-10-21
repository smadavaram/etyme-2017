/**
 * Hand-built people in the shape `types.ts` signs (etyme-demand): what the
 * jobs were planned and tested against before supply's `buildPeople`
 * landed. The seed and its tests now plan against supply's two thousand;
 * this stays as a small world a planning test can use, and is never
 * written by the seed. Its keys (`sx/jobs-stand-in/...`) can never
 * collide with supply's people.
 */

import { industry } from '../industries'
import { NameBook, between, emailFor, idFor, keyed, pick } from '../kit'
import { day } from '@/lib/seed-days'
import type { Career, LineEnd, PersonFacts, ScaleFirm, ScaleFrame } from '../types'

/** People per supplier firm. */
export const STAND_IN_PER_FIRM = 6

/** The first number a stand-in's address carries: after the frame's staff (8001 on). */
const NUMBER_FROM = 6001

export function standInPeople(frame: ScaleFrame): PersonFacts[] {
  const names = new NameBook(frame.firms.flatMap((f) => f.seats.map((s) => s.name)))
  const clients = frame.byPosition('CLIENT')
  const panelOf = new Map(clients.map((c) => [c.id, new Set(frame.panelOf(c.id).map((f) => f.id))]))
  /** The clients a firm reaches: its own panels, or those of the firms it sells to. */
  const clientsOf = (f: ScaleFirm) => clients.filter((c) => {
    const panel = panelOf.get(c.id)!
    return panel.has(f.id) || frame.primesOf(f.id).some((x) => panel.has(x.id))
  })
  const out: PersonFacts[] = []
  let n = NUMBER_FROM
  for (const f of frame.firms) {
    if (!['GSI', 'PRIME', 'SUB_VENDOR', 'BENCH'].includes(f.position)) continue
    const reach = clientsOf(f)
    for (let i = 0; i < STAND_IN_PER_FIRM; i++) {
      const key = `jobs-stand-in/${f.id}/${i}`
      const r = keyed(key)
      const ind = industry(f.industries[i % f.industries.length])
      const role = ind.roles[(f.index + i) % ind.roles.length]
      const name = names.take(key, null)
      const career: Career = (['PLACED', 'BETWEEN_PROJECTS', 'BETWEEN_PROJECTS', 'FRESHER', 'LOOKING_WHILE_EMPLOYED', 'OTHER'] as const)[i]
      const lineEnds: LineEnd[] = []
      if (reach.length && (career === 'BETWEEN_PROJECTS' || career === 'LOOKING_WHILE_EMPLOYED')) {
        for (let k = 0; k < between(r, 1, 2); k++) {
          const start = day(-650 + k * 260 + between(r, 0, 60))
          lineEnds.push({ clientId: pick(r, reach).id, employerId: f.id, start, end: new Date(start.getTime() + between(r, 120, 220) * 86_400_000), live: false })
        }
      }
      if (reach.length && career === 'PLACED') {
        const start = day(-between(r, 30, 200))
        lineEnds.push({ clientId: pick(r, reach).id, employerId: f.id, start, end: day(between(r, 60, 240)), live: true })
      }
      out.push({
        id: idFor(key),
        email: emailFor(name, n++),
        name,
        career,
        industry: ind.key,
        role,
        skills: [...role.skills],
        workAuth: 'CITIZEN',
        country: 'US',
        firmId: f.id,
        // An integrator's own staff are its employees; everybody else is listed by their bench.
        listing: f.position === 'GSI' ? null : { firmId: f.id, tier: i === 5 ? 'RETAINED' : 'MARKETING', askFirst: false },
        lineEnds,
      })
    }
  }
  return out
}
