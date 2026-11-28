import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(join(process.cwd(), 'src/app/api/people/[id]/route.ts'), 'utf8')

describe('a person’s page reads the company’s own window for near the time limit', () => {
  it('the page reads the company’s widest warning, the one the Tenure page and Ask Etyme read', () => {
    expect(route).toContain('Math.max(0, ...(await ruleSetFor(companyId)).tenureWarnAtDays) || null')
    expect(route).toContain('{ capMonths, breakDays, warnWithinDays }')
  })
})
