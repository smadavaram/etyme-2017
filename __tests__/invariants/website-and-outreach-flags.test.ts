import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  GRANDFATHERED_SITES, DARK_SITE_SAYS, WEBSITE_LEAD_SAYS, OUTREACH_TEMPLATES,
  siteRenders, websiteChecklist, outreachHeld, pluginsOfferedTo, isOn, PLUGINS,
} from '@/lib/plugins'
import { SUBMISSION_CHASE_TEMPLATE } from '@/lib/agents/submission-chase-rules'
import { OUTREACH_TEMPLATE } from '@/lib/agents/dormant-outreach-rules'
import { OUTREACH_BATCH_TEMPLATE } from '@/lib/outreach/batch-rules'
import { MONEY_OWED_CHASE_TEMPLATE, FINAL_NOTICE_TEMPLATE } from '@/lib/money/money-owed-chase'
import { TIMESHEET_CHASE_TEMPLATE } from '@/lib/notify/timesheet-chase-letter'
import { RENAMED_FIRMS } from '@/lib/seed-renames'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const all = { brandingApprovedAt: new Date('2026-11-20'), domainVerified: true, compliancePassRequired: true, compliancePassRecorded: true }

describe('Website and content and Outreach are plugins, off for every firm', () => {
  it('a client company is never offered the Website and content or Outreach switches', () => {
    expect(pluginsOfferedTo('CLIENT')).toEqual([])
  })
  it('every firm starts with Website and content off and Outreach off, Tapin included', () => {
    expect(isOn([], 'WEBSITE')).toBe(false)
    expect(isOn([], 'OUTREACH')).toBe(false)
    expect(PLUGINS.map((p) => p.key)).toContain('WEBSITE')
    expect(PLUGINS.map((p) => p.key)).toContain('OUTREACH')
  })
})

describe('the two sites that were live keep rendering', () => {
  it('the Tapin storefront renders with no switch ever written', () => {
    expect(siteRenders({ slug: 'tapin', pluginsOn: [], everSwitched: false })).toBe(true)
  })
  it('the second firm’s storefront renders under its renamed slug with no switch ever written', () => {
    const second = RENAMED_FIRMS.find((r) => r.on === '2026-10-04')!.toSlug
    expect(GRANDFATHERED_SITES).toContain(second)
    expect(siteRenders({ slug: second, pluginsOn: [], everSwitched: false })).toBe(true)
    expect(siteRenders({ slug: `world-${second}`, pluginsOn: [], everSwitched: false })).toBe(true)
  })
  it('every other firm’s site is dark until its Website switch is on', () => {
    expect(siteRenders({ slug: 'quillbrook', pluginsOn: [], everSwitched: false })).toBe(false)
    expect(siteRenders({ slug: 'quillbrook', pluginsOn: ['WEBSITE'], everSwitched: true })).toBe(true)
  })
  it('an Owner’s first switch-off of a grandfathered site takes it dark for good', () => {
    expect(siteRenders({ slug: 'tapin', pluginsOn: [], everSwitched: true })).toBe(false)
    expect(siteRenders({ slug: 'tapin', pluginsOn: ['WEBSITE'], everSwitched: true })).toBe(true)
  })
  it('a dark site reads the same as a firm that does not exist', () => {
    expect(DARK_SITE_SAYS).toBe('No company at that address.')
  })
  it('no real company’s name is spelled in the grandfather list', () => {
    expect(GRANDFATHERED_SITES.join(' ')).not.toMatch(/cloudepa/i)
  })
})

describe('the Website switch refuses until three checks hold, and names each one missing', () => {
  it('with nothing set it names the branding, the domain, and says the lead sentence', () => {
    const r = websiteChecklist({ brandingApprovedAt: null, domainVerified: false, compliancePassRequired: false, compliancePassRecorded: false })
    expect(r.missing.map((m) => m.check)).toEqual(['BRANDING', 'DOMAIN'])
    expect(r.says).toContain(WEBSITE_LEAD_SAYS)
  })
  it('it refuses when the branding has not been approved by the Owner', () => {
    expect(websiteChecklist({ ...all, brandingApprovedAt: null }).missing.map((m) => m.check)).toEqual(['BRANDING'])
  })
  it('it refuses when the firm’s domain is not pointed and verified', () => {
    expect(websiteChecklist({ ...all, domainVerified: false }).missing.map((m) => m.check)).toEqual(['DOMAIN'])
  })
  it('it refuses when a required compliance pass is not recorded', () => {
    expect(websiteChecklist({ ...all, compliancePassRecorded: false }).missing.map((m) => m.check)).toEqual(['COMPLIANCE_PASS'])
  })
  it('a firm that does not require a compliance pass is never asked for one', () => {
    expect(websiteChecklist({ ...all, compliancePassRequired: false, compliancePassRecorded: false }).says).toBeNull()
  })
  it('it may go on when all three hold', () => {
    expect(websiteChecklist(all)).toEqual({ missing: [], says: null })
  })
  it('both switch routes ask the checklist when Website goes on, and never when it goes off', () => {
    for (const f of ['src/app/api/settings/plugins/route.ts', 'src/app/api/superadmin/plugins/route.ts']) {
      expect(read(f)).toMatch(/if \(on && plugin === 'WEBSITE'\)[\s\S]*websiteOnRefusal[\s\S]*status: 422/)
    }
  })
})

describe('Outreach holds only the letters that sell', () => {
  it('while Outreach is off the batch send, its follow-ups and the dormant-company check-in are held', () => {
    expect(outreachHeld([], OUTREACH_BATCH_TEMPLATE)).toBe(true)
    expect(outreachHeld([], OUTREACH_TEMPLATE)).toBe(true)
  })
  it('the submission chase, the money-owed chase, the timesheet chase and the availability ping stay open while Outreach is off', () => {
    for (const t of [SUBMISSION_CHASE_TEMPLATE, MONEY_OWED_CHASE_TEMPLATE, FINAL_NOTICE_TEMPLATE, TIMESHEET_CHASE_TEMPLATE, 'freshness-ping']) {
      expect(outreachHeld([], t)).toBe(false)
    }
  })
  it('the held and open names are the templates the mail door carries', () => {
    expect([...OUTREACH_TEMPLATES.held].sort()).toEqual([OUTREACH_BATCH_TEMPLATE, OUTREACH_TEMPLATE].sort())
    expect(OUTREACH_TEMPLATES.open).toEqual(expect.arrayContaining([SUBMISSION_CHASE_TEMPLATE, MONEY_OWED_CHASE_TEMPLATE, TIMESHEET_CHASE_TEMPLATE]))
  })
  it('with Outreach on nothing is held', () => {
    expect(outreachHeld(['OUTREACH'], OUTREACH_BATCH_TEMPLATE)).toBe(false)
  })
})

describe('the Owner’s stored checks', () => {
  it('the schema stores the branding approval with who and when, a per-firm compliance setting, and a pass with person, date and document', () => {
    const s = read('prisma/schema.prisma')
    expect(s).toMatch(/siteBrandingApprovedAt\s+DateTime\?/)
    expect(s).toMatch(/siteBrandingApprovedById\s+String\?/)
    expect(s).toMatch(/siteCompliancePassRequired\s+Boolean\s+@default\(false\)/)
    expect(s).toMatch(/model SiteCompliancePass \{[\s\S]*passedAt[\s\S]*recordedById[\s\S]*documentId[\s\S]*\}/)
  })
  it('only an Owner approves the branding or records a pass, and every act is on the ledger', () => {
    const r = read('src/app/api/settings/website-checks/route.ts')
    expect(r).toContain('maySwitchPlugin')
    for (const e of ['site.branding_approved', 'site.branding_withdrawn', 'site.compliance_pass_required_set', 'site.compliance_pass_recorded']) expect(r).toContain(e)
  })
})
