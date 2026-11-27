import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { daysOffRead, holidaysRead } from '@/lib/skills/checkers/calendar'

const DIR = path.join(process.cwd(), 'src/lib/skills/checkers')

describe('a checker reads the firm’s calendar through the client it was handed', () => {
  it('the days off come from the firm’s own row on the injected client, not from the global one', async () => {
    const read: any = { company: { findUnique: async () => ({ daysOff: [5, 6] }) } }
    expect(await daysOffRead(read, 'c1')).toEqual([5, 6])
  })

  it('a firm that said nothing about its days off reads Saturday and Sunday', async () => {
    const read: any = { company: { findUnique: async () => null } }
    expect(await daysOffRead(read, 'c1')).toEqual([0, 6])
  })

  it('the holidays come from the injected client’s own rows', async () => {
    const read: any = { holiday: { findMany: async () => [{ date: new Date('2026-12-25T00:00:00Z'), isRecurring: false, country: null }] } }
    expect((await holidaysRead(read, 'c1', 2026)).has('2026-12-25')).toBe(true)
  })

  it('no checker file calls the days-off or holiday readers except through the calendar helper', () => {
    const bad = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts') && f !== 'calendar.ts')
      .filter((f) => /daysOffFor|weekSettingsFor|loadCompanyHolidays/.test(fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
    expect(bad).toEqual([])
  })
})
