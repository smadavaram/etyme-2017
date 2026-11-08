import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as raiseRequisition } from '@/app/api/requisitions/route'

/**
 * A job raised at a client that keeps its books in rupees says its budget,
 * its estimate and its value in rupees; the same job at a client in
 * dollars reads as it always did. Only the words move: which jobs need
 * approval is not decided by the currency.
 */

const HIRING = 'world-corning-hiring@demo.etyme.local'
const s = { company: '' }

beforeAll(async () => {
  await freshWorld()
  const company = await prisma.company.findFirstOrThrow({ where: { slug: 'world-corning' }, select: { id: true } })
  s.company = company.id
}, 600_000)

const raise = async (title: string) => {
  as(HIRING)
  const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
    title, skills: ['PLC'], location: 'Elmira, NY', budget: 480_000_000, months: 12, headcount: 1, hoursPerWeek: 40,
  })))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}

describe('a job raised in its client’s own currency', () => {
  let dollars: any
  let rupees: any

  it('a client in dollars reads its budget in dollars, as before', async () => {
    dollars = await raise('Lehr controls lead')
    expect(dollars.valueSays).toBe('the $4,800,000 budget you stated')
    expect(dollars.annualValue).toBe(4_800_000)
  })

  it('a client in rupees reads the same figure in rupees, never with a dollar sign', async () => {
    await prisma.company.update({ where: { id: s.company }, data: { currency: 'INR' } })
    rupees = await raise('Lehr controls lead, Pune')
    expect(rupees.valueSays).toBe('the ₹4,800,000 budget you stated')
    expect(rupees.valueSays).not.toContain('$')
    expect(rupees.annualValue).toBe(4_800_000)
  })

  it('the currency changes the words and never whether the job needs approval', () => {
    expect(rupees.decision.state).toBe(dollars.decision.state)
    expect(rupees.valueBasis).toBe(dollars.valueBasis)
  })
})
