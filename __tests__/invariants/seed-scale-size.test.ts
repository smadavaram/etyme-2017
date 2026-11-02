/**
 * The generated world takes a size (2026-11-02): the founder's ratios of
 * ten clients, ten integrators, five MSPs and a hundred suppliers per two
 * thousand people, so a run can aim at 10,000 complete transactions on
 * this box (about 17,000 people) and at 100,000 elsewhere. The frame is
 * the architect's; each other folder sizes itself by `scaleSize()`.
 */
import { describe, it, expect } from 'vitest'
import { SCALE, FEWEST_PEOPLE, sizeFor, scaleSize } from '@/lib/seed-scale/types'
import { NAME_QUALIFIERS, STAFF_NUMBER_FROM, staffNumberFrom, stemAt } from '@/lib/seed-scale/kit'
import { buildFrame, frameSteps } from '@/lib/seed-scale/frame'
import { sharesFor, RATE_SHARES } from '@/lib/seed-scale/index'
import { planScaleTemplate, planTemplates } from '../../__integration__/templates'
import { parseArgs } from '../../scripts/simulate/args'

describe('The size of the generated world', () => {
  it('at two thousand people the world is exactly the one every test has read', () => {
    const s = sizeFor(2000)
    expect([s.clients, s.gsis, s.msps, s.suppliers, s.primes, s.subVendors, s.benchFirms, s.mspRuns])
      .toEqual([SCALE.clients, SCALE.gsis, SCALE.msps, SCALE.suppliers, SCALE.primes, SCALE.subVendors, SCALE.benchFirms, SCALE.mspRuns])
    expect(scaleSize({})).toEqual(s)
    expect(JSON.stringify(buildFrame(s).firms.map((f) => [f.id, f.name, f.seats.map((x) => x.email)]))).toBe(
      JSON.stringify(buildFrame().firms.map((f) => [f.id, f.name, f.seats.map((x) => x.email)])))
  })

  it('a world of seventeen thousand people holds firms in the founder’s ratios, each MSP running one client', () => {
    const s = sizeFor(17_000)
    expect([s.clients, s.gsis, s.msps, s.primes, s.subVendors, s.benchFirms, s.suppliers, s.mspRuns]).toEqual([85, 85, 43, 255, 340, 255, 850, 43])
    expect(scaleSize({ SCALE_PEOPLE: '17000' })).toEqual(s)
  })

  it('a world too small to hold one firm of each kind is refused in a sentence', () => {
    expect(() => sizeFor(FEWEST_PEOPLE - 1)).toThrow(/at least 400 people/)
    expect(() => sizeFor(2000.5)).toThrow(/whole number/)
  })

  it('every firm of a large world has a name of its own, and the plain names come first', () => {
    const frame = buildFrame(sizeFor(17_000))
    const names = frame.firms.map((f) => f.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    expect(frame.firms.filter((f) => f.kind === 'VENDOR')).toHaveLength(850)
    expect(stemAt(['Ashgrove', 'Birchmont'], 0)).toBe('Ashgrove')
    expect(stemAt(['Ashgrove', 'Birchmont'], 3)).toBe(`Birchmont ${NAME_QUALIFIERS[0]}`)
    expect(stemAt(['Ashgrove'], NAME_QUALIFIERS.length + 1)).toBeNull()
  })

  it('a staff address never shares a number with a person’s, whatever the size', () => {
    expect(staffNumberFrom(2000)).toBe(STAFF_NUMBER_FROM)
    for (const people of [6999, 7000, 7001, 17_000, 100_000]) expect(staffNumberFrom(people), String(people)).toBeGreaterThan(people)
    const frame = buildFrame(sizeFor(17_000))
    const staffNumbers = frame.firms.flatMap((f) => f.seats.map((x) => Number(x.email.split('@')[0].split('.').pop())))
    expect(Math.min(...staffNumbers)).toBeGreaterThan(17_000)
  })

  it('the steps grow with the world, so each stays under the queries a step may ask, and never shrink below the founder’s size', () => {
    expect(sharesFor(RATE_SHARES, sizeFor(2000))).toBe(RATE_SHARES)
    expect(sharesFor(RATE_SHARES, sizeFor(17_000))).toBe(34)
    expect(sharesFor(RATE_SHARES, sizeFor(400))).toBe(RATE_SHARES)
    expect(frameSteps(sizeFor(17_000)).length).toBeGreaterThan(frameSteps(sizeFor(2000)).length)
  })

  it('the template name carries the size, so two sizes seeded the same day never collide', () => {
    const plan = planTemplates()
    const a = planScaleTemplate(plan, 2000).name, b = planScaleTemplate(plan, 17_000).name
    expect(a).toMatch(/_p2000_/)
    expect(b).toMatch(/_p17000_/)
    expect(a).not.toBe(b)
    expect(b.length).toBeLessThanOrEqual(63)
  })

  it('a run asks for the size in people, which means the generated world', () => {
    const a = parseArgs(['--people', '17000'])
    expect([a.people, a.scale]).toEqual([17_000, true])
    expect(parseArgs([]).people).toBe(2000)
    expect(() => parseArgs(['--people', '300'])).toThrow(/400 or more/)
  })
})
