import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Courses on a storefront (record 120, answer 3): hidden while the plugin
 * is off, and hidden always for a firm that chose it.
 */

type Row = Record<string, any>
const h = vi.hoisted(() => ({ company: null as Row | null, courses: [] as Row[], courseReads: 0 }))

vi.mock('@/lib/db', () => ({
  prisma: {
    company: { findFirst: async () => h.company },
    person: { findMany: async () => [] },
    sellContract: { count: async () => 0, findMany: async () => [] },
    consultantProfile: { findMany: async () => [] },
    verification: { findMany: async () => [] },
    pluginSwitch: { count: async () => 0 },
    course: { findMany: async () => { h.courseReads++; return h.courses } },
    requirement: { findMany: async () => [] },
    submission: { findMany: async () => [] },
    invoice: { findMany: async () => [] },
    benchListing: { findMany: async () => [] },
    context: { findMany: async () => [] },
  },
}))

import { publicSite } from '@/lib/public-site'
import { coursesShown } from '@/lib/training/courses-shown'
import { factsThatLeave } from '@/app/api/settings/site/write'
import type { SiteFacts } from '@/lib/site-voice'

function firm(over: Row = {}): Row {
  return {
    id: 'f1', name: 'Northwind Staffing', slug: 'northwind', kind: 'VENDOR', supplierPosture: 'BENCH',
    siteLiveAt: new Date('2026-10-29T00:00:00Z'), networkVerifiedAt: null, domain: null, domainVerified: false,
    claimedAt: new Date('2026-10-17T00:00:00Z'), _count: { contexts: 3 },
    siteTagline: null, siteIntro: null, siteHeadings: null, siteWrittenBy: null,
    phone: null, accountsEmail: null, showPeopleOnPage: false, peopleInCharge: [],
    locations: [], pluginsOn: ['WEBSITE'], coursesHiddenOnStorefront: false,
    ...over,
  }
}

beforeEach(() => {
  h.company = firm()
  h.courses = [{ title: 'Spark for data engineers', duration: 12 }]
  h.courseReads = 0
})

describe('the one reader of whether a firm’s courses are shown', () => {
  it('courses are shown only when Train to bench is on and the firm has not hidden them', () => {
    expect(coursesShown({ pluginsOn: ['TRAIN_TO_BENCH'], coursesHiddenOnStorefront: false })).toBe(true)
  })
  it('courses are not shown while Train to bench is off', () => {
    expect(coursesShown({ pluginsOn: [], coursesHiddenOnStorefront: false })).toBe(false)
    expect(coursesShown({ pluginsOn: ['PODS'] })).toBe(false)
    expect(coursesShown(null)).toBe(false)
  })
  it('courses are not shown for a firm that hid them, even with the plugin on', () => {
    expect(coursesShown({ pluginsOn: ['TRAIN_TO_BENCH'], coursesHiddenOnStorefront: true })).toBe(false)
  })
})

describe('a storefront and the courses a firm runs', () => {
  it('a storefront lists no course while the plugin is off, and does not even read them', async () => {
    h.company = firm({ pluginsOn: ['WEBSITE'] })
    const site = (await publicSite('northwind'))!
    expect(site.courses).toEqual([])
    expect(h.courseReads).toBe(0)
  })

  it('a firm that hides courses lists none even while the plugin is on', async () => {
    h.company = firm({ pluginsOn: ['WEBSITE', 'TRAIN_TO_BENCH'], coursesHiddenOnStorefront: true })
    const site = (await publicSite('northwind'))!
    expect(site.courses).toEqual([])
    expect(JSON.stringify(site)).not.toContain('Spark for data engineers')
  })

  it('a firm with the plugin on and courses not hidden lists its public courses', async () => {
    h.company = firm({ pluginsOn: ['WEBSITE', 'TRAIN_TO_BENCH'] })
    const site = (await publicSite('northwind'))!
    expect(site.courses).toEqual([{ title: 'Spark for data engineers', hours: 12 }])
  })
})

describe('what the page writer is told about courses', () => {
  const facts: SiteFacts = {
    name: 'Northwind', kind: 'VENDOR', posture: 'BENCH', skills: [], locations: [], placements: 0, activeNow: 0,
    clients: 0, openPositions: 0, comingFree: 0, trainingCourses: 2,
  }
  it('the writer is told nothing about courses where the reader says they are not shown', () => {
    expect(factsThatLeave({ ...facts, trainingCourses: 0, coursesShown: false })).not.toContain('Training courses they run')
  })
  it('the writer is told the number of courses where the reader says they are shown', () => {
    expect(factsThatLeave({ ...facts, coursesShown: true })).toContain('Training courses they run: 2')
  })
})
