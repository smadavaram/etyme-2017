import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(process.cwd(), 'scripts/db-sync.mjs'), 'utf8')
const unflagged = src.slice(src.indexOf('if (!asked) {'), src.indexOf('if (!process.env.DATABASE_URL) {\n  console.error'))

describe('every build brings the database up to the schema without losing data', () => {
  it('a build without the flag still applies additive changes, so new code never ships against missing columns', () => {
    expect(unflagged).toContain("execSync('npx prisma db push --skip-generate'")
  })
  it('a build without the flag never accepts data loss', () => {
    expect(unflagged).not.toMatch(/execSync\([^)]*--accept-data-loss/)
  })
  it('a change that would lose data fails the build instead of shipping', () => {
    expect(unflagged).toMatch(/would lose data[\s\S]*process\.exit\(1\)/)
  })
  it('the security log guard is applied on the unflagged path too', () => {
    expect(unflagged).toContain('prisma/sql/append-only.sql')
  })
})
