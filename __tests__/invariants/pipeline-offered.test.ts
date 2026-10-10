import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pipelineSays } from '@/lib/consultant-portfolio'

/**
 * What a candidate's own pipeline says once a client has made an offer.
 *
 * It said "They made an offer." and nothing else — which reads as a job
 * offer the person could accept, when there is nothing for them to
 * accept: the award is the client's. It now says what the candidate's
 * email says (`lib/interview-notices`).
 */

const names = { client: 'Northbend Athletic', supplier: 'Techpeple' }

describe('a candidate reads an offer on their own page', () => {
  it('an offered candidate is told they are placed when the client awards the position, and who will be in touch', () => {
    expect(pipelineSays('OFFERED', 2, names)).toBe(
      'You are placed when Northbend Athletic awards the position. Techpeple will be in touch about your start date and terms.'
    )
  })

  it('the offer sentence names no rate', () => {
    const says = pipelineSays('OFFERED', 0, names)
    expect(says).not.toMatch(/\$|\d+\s*\/\s*h|rate/i)
  })

  it('the offer sentence on the page is the one the candidate’s email already uses', () => {
    const email = readFileSync(join(__dirname, '../../src/lib/interview-notices.ts'), 'utf8')
    expect(email).toContain('awards the position. ${c.vendor.name} will be in touch about your start date and terms.')
  })

  it('the pipeline names the client that awards and the firm that put them forward', () => {
    const route = readFileSync(join(__dirname, '../../src/app/api/me/pipeline/route.ts'), 'utf8')
    expect(route).toContain('client: s.requirement.endClientCompany?.name ?? s.requirement.company.name')
    expect(route).toContain('supplier: s.fromCompany.name')
  })
})
