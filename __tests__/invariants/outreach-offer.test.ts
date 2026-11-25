import { describe, it, expect } from 'vitest'
import { draftOffer, suggestHotList } from '@/lib/outreach/offer-rules'

describe('what an outreach letter offers', () => {
  it('a hot list carries skills and availability and never a name or a rate', () => {
    const r = draftOffer('Win Firm', 'HOT_LIST', { lines: [{ skills: 'Spark, Airflow, SQL', availability: 'from December 8' }] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.body).toContain('Spark, Airflow, SQL')
      expect(r.body).toContain('from December 8')
      expect(r.subject).toMatch(/^Win Firm: /)
    }
  })
  it('a hot list given any field other than skills and availability is refused before it is drafted', () => {
    for (const key of ['name', 'rate', 'email', 'headline']) {
      const r = draftOffer('Win Firm', 'HOT_LIST', { lines: [{ skills: 'SQL', availability: 'now', [key]: 'x' }] })
      expect(r.ok, key).toBe(false)
      if (!r.ok) expect(r.says).toMatch(/skills and availability only/)
    }
  })
  it('a hot list line that carries a rate or an email address in its words is refused', () => {
    expect(draftOffer('Win Firm', 'HOT_LIST', { lines: [{ skills: 'SQL at $85/hr', availability: 'now' }] }).ok).toBe(false)
    expect(draftOffer('Win Firm', 'HOT_LIST', { lines: [{ skills: 'SQL', availability: 'now, priya@mail.example' }] }).ok).toBe(false)
  })
  it('a hot list with no lines is refused in a sentence', () => {
    const r = draftOffer('Win Firm', 'HOT_LIST', { lines: [] })
    expect(r.ok).toBe(false)
  })
  it('a project pod letter states only the scope, duration and skills the person typed', () => {
    const r = draftOffer('Win Firm', 'PROJECT_POD', { scope: 'Move the nightly loads to Airflow', duration: '12 weeks', skills: 'Airflow, dbt' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.body).toContain('Move the nightly loads to Airflow')
      expect(r.body).toContain('12 weeks')
      expect(r.body).toContain('Airflow, dbt')
      expect(r.body).not.toMatch(/\$|rate/i)
    }
    expect(draftOffer('Win Firm', 'PROJECT_POD', { scope: 'x', duration: '', skills: 'y' }).ok).toBe(false)
  })
  it('an open job letter states the title, skills and place the person typed', () => {
    const r = draftOffer('Win Firm', 'OPEN_JOB', { title: 'Data engineer', skills: 'SQL', location: 'Columbus, OH' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.subject).toBe('Win Firm: Data engineer')
  })
  it('an offer kind Etyme does not know is refused', () => {
    expect(draftOffer('Win Firm', 'COURSE', {}).ok).toBe(false)
  })
  it('the suggested hot list is built from skills and availability alone, grouping people who are the same and saying how many', () => {
    const lines = suggestHotList([
      { skills: ['Spark', 'SQL'], daysUntilFree: 0, freeOn: '2026-11-25' },
      { skills: ['Spark', 'SQL'], daysUntilFree: 0, freeOn: '2026-11-25' },
      { skills: ['Java'], daysUntilFree: 14, freeOn: '2026-12-09' },
    ])
    expect(lines).toEqual([
      { skills: 'Spark, SQL (2 people)', availability: 'available now' },
      { skills: 'Java', availability: 'free from December 9' },
    ])
    expect(Object.keys(lines[0]).sort()).toEqual(['availability', 'skills'])
  })
})
