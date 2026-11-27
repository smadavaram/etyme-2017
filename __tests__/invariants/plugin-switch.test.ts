import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const roleName = vi.hoisted(() => ({ name: 'Admin' as string | null }))
vi.mock('@/lib/db', () => ({
  prisma: {
    role: { findFirst: async () => (roleName.name ? { name: roleName.name } : null) },
    company: { findUnique: async () => ({ name: 'Quillbrook Staffing', ownerProofRequiredAt: null, ownerVerifiedAt: null }) },
  },
}))

import { PLUGINS, isOn, maySwitchPlugin } from '@/lib/plugins'
import { pluginOffSays } from '@/lib/plugin-gate'
import { getNavForKind, menuFor } from '@/lib/nav-table'
import { mayWrite } from '@/lib/domains'

/**
 * Record 120: plugins are off by default for every firm, switched by the
 * Owner or by Etyme's staff on the switch alone, and hide without deleting.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const firm = { id: 'c1', name: 'Quillbrook Staffing' }
const seat = (roleId: string | null) => ({ company: firm, context: { roleId } })
const hrefs = (sections: ReturnType<typeof getNavForKind>) => sections.flatMap((s) => s.items.map((i) => i.href))

describe('every plugin starts off', () => {
  it('every company starts with every plugin off', () => {
    expect(read('prisma/schema.prisma')).toMatch(/pluginsOn\s+String\[\]\s+@default\(\[\]\)/)
    for (const p of PLUGINS) expect(isOn([], p.key)).toBe(false)
  })
  it('there are five plugins, read as Train to bench, Project teams, Website and content, Outreach, and Public-sector proposals', () => {
    expect(PLUGINS.map((p) => p.label)).toEqual(['Train to bench', 'Project teams', 'Website and content', 'Outreach', 'Public-sector proposals'])
  })
})

describe('the fifth plugin and the edition columns', () => {
  it('public-sector proposals is the fifth plugin, last in the order, off until switched on', () => {
    expect(PLUGINS.map((p) => p.key)).toEqual(['TRAIN_TO_BENCH', 'PODS', 'WEBSITE', 'OUTREACH', 'PUBLIC_SECTOR'])
    expect(isOn([], 'PUBLIC_SECTOR')).toBe(false)
  })
  it('a company starts as a free user with no trial clock and no payment recorded', () => {
    const schema = read('prisma/schema.prisma')
    expect(schema).toMatch(/enum Edition \{\s+USER\s+STARTER\s+ENTERPRISE\s+\}/)
    expect(schema).toMatch(/edition\s+Edition\s+@default\(USER\)/)
    expect(schema).toMatch(/activatedAt\s+DateTime\?/)
    expect(schema).toMatch(/paidThrough\s+DateTime\?/)
    expect(schema).toMatch(/billingExempt\s+Boolean\s+@default\(false\)/)
  })
  it('the Superadmin screen offers every plugin there is', () => {
    const page = read('src/app/dashboard/superadmin/page.tsx')
    for (const p of PLUGINS) expect(page).toContain(`value="${p.key}"`)
  })
})

describe('who may switch a plugin', () => {
  it('an Admin cannot switch a plugin', async () => {
    roleName.name = 'Admin'
    expect(await maySwitchPlugin(seat('r-admin'))).toMatchObject({ ok: false, code: 'NOT_OWNER' })
  })
  it('the twin cannot switch a plugin, even on an Owner’s seat', async () => {
    roleName.name = 'Owner'
    expect(await maySwitchPlugin({ ...seat('r-owner'), twin: true })).toMatchObject({ ok: false, code: 'AGENT' })
    expect(await maySwitchPlugin({ ...seat('r-owner'), agent: true })).toMatchObject({ ok: false, code: 'AGENT' })
    expect(await maySwitchPlugin({ ...seat('r-owner'), actorKind: 'TWIN' })).toMatchObject({ ok: false, code: 'AGENT' })
  })
  it('an Owner may switch a plugin', async () => {
    roleName.name = 'Owner'
    expect(await maySwitchPlugin(seat('r-owner'))).toEqual({ ok: true })
  })
  it('a switch waits for a verified Owner, as every Owner-only act does', () => {
    expect(read('src/lib/plugins.ts')).toContain("needsVerifiedOwnerAt(caller.company.id, 'PLUGIN_SWITCH')")
  })
})

describe('what a firm reads while a plugin is off', () => {
  it('the refusal is one sentence naming the firm and the Owner', () => {
    expect(pluginOffSays('TRAIN_TO_BENCH', 'Quillbrook Staffing')).toBe('Train to bench is off for Quillbrook Staffing. The Owner turns it on in Settings.')
  })
  it('the training routes refuse while the plugin is off, each after its caller check and before it reads', () => {
    for (const f of ['src/app/api/training/route.ts', 'src/app/api/training/enrollments/route.ts', 'src/app/api/training/enrollments/[id]/route.ts']) {
      const src = read(f)
      const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? []
      expect((src.match(/pluginGate\(caller, 'TRAIN_TO_BENCH'\)/g) ?? []).length, f).toBe(handlers.length)
      for (const part of src.split(/export async function /).slice(1)) {
        expect(part.indexOf('staffOnly'), f).toBeLessThan(part.indexOf('pluginGate'))
        expect(part.indexOf('pluginGate'), f).toBeLessThan(part.indexOf('prisma.'))
      }
    }
  })
  it('a refusal is written to the access log before it is sent', () => {
    expect(read('src/lib/plugin-gate.ts')).toMatch(/await recordRefusal\(/)
  })
  it('the Training page shows the route\'s sentence alone, and the route sends only an Owner to Settings', () => {
    const page = read('src/app/dashboard/training/page.tsx')
    expect(page).toContain('body.error?.message')
    expect(page).not.toContain('Open Settings')
    expect(read('src/lib/plugin-gate.ts')).toContain('The Owner turns it on in Settings.')
    expect(read('src/lib/plugin-gate.ts')).toContain("role?.name === 'Owner' ? { href: '/dashboard/settings' }")
  })
  it('the Training link is not drawn while the plugin is off, and is drawn when it is on', () => {
    const facts = { permissions: ['consultants.read', 'requirements.read'] }
    expect(hrefs(getNavForKind('VENDOR', false, facts))).not.toContain('/dashboard/training')
    expect(hrefs(getNavForKind('VENDOR', false, { ...facts, plugins: [] }))).not.toContain('/dashboard/training')
    expect(hrefs(getNavForKind('VENDOR', false, { ...facts, plugins: ['PODS'] }))).not.toContain('/dashboard/training')
    expect(hrefs(getNavForKind('VENDOR', false, { ...facts, plugins: ['TRAIN_TO_BENCH'] }))).toContain('/dashboard/training')
    expect(menuFor('VENDOR', false, facts).flatMap((g) => g.links).flatMap((l) => l.covers.map((c) => c.href))).not.toContain('/dashboard/training')
  })
  it('the + button and search read the same answer as the menu', () => {
    const header = read('src/components/shell/header.tsx')
    expect((header.match(/plugins: session\.company\?\.pluginsOn \?\? \[\]/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(header).toContain('plugins: more.plugins')
  })
})

describe('switching hides and never deletes', () => {
  it('switching off deletes no course or enrollment: no route here removes a training row', () => {
    for (const f of ['src/app/api/settings/plugins/route.ts', 'src/app/api/superadmin/plugins/route.ts']) {
      const src = read(f)
      expect(src, f).not.toMatch(/\.(delete|deleteMany)\(/)
      expect(src, f).not.toMatch(/prisma\.(course|enrollment)|tx\.(course|enrollment)/)
    }
  })
})

describe('the ledger and who sees it', () => {
  it('a staff switch is shown to the Owner as Etyme staff, never an address', () => {
    const src = read('src/app/api/settings/plugins/route.ts')
    expect(src).toContain("const WHO_STAFF = 'Etyme staff'")
    expect(src).toContain('r.byStaff ? WHO_STAFF')
    expect(src).not.toMatch(/primaryEmail|email/i)
  })
  it('the staff route writes the row as staff, returns the switch alone and reads no tenant data', () => {
    const src = read('src/app/api/superadmin/plugins/route.ts')
    expect(src).toContain('byStaff: true')
    expect(src).toContain('{ data: { plugin, on } }')
    expect(src).not.toMatch(/prisma\.(person|context|course|enrollment|benchListing)/)
  })
  it('the Owner’s route writes the flag and the row in one transaction', () => {
    const src = read('src/app/api/settings/plugins/route.ts')
    expect(src).toMatch(/\$transaction[\s\S]*company\.update[\s\S]*pluginSwitch\.create/)
  })
  it('the ledger is append-only: no route updates or deletes a switch row', () => {
    for (const f of ['src/app/api/settings/plugins/route.ts', 'src/app/api/superadmin/plugins/route.ts']) {
      expect(read(f), f).not.toMatch(/pluginSwitch\.(update|delete|upsert)/)
    }
  })
  it('the schema indexes the ledger on company, plugin and time', () => {
    expect(read('prisma/schema.prisma')).toMatch(/model PluginSwitch[\s\S]*@@index\(\[companyId, plugin, at\]\)/)
  })
})

describe('the files are registered', () => {
  it('the architect may write the two plugin libraries', () => {
    expect(mayWrite('etyme-architect', 'src/lib/plugins.ts').mayWrite).toBe(true)
    expect(mayWrite('etyme-architect', 'src/lib/plugin-gate.ts').mayWrite).toBe(true)
  })
  it('CLAUDE.md says Training sits under Candidates where the plugin is on', () => {
    expect(read('CLAUDE.md')).toContain('Training → Candidates, where the plugin is on.')
  })
})

describe('Project teams does not open yet (record 120, ruling 3)', () => {
  it('switching Project teams on is refused in one sentence, and Train to bench is unaffected', async () => {
    const { switchOnRefusal } = await import('@/lib/plugins')
    expect(switchOnRefusal('PODS')).toBe('Project teams opens once client-safe billing is finished.')
    expect(switchOnRefusal('TRAIN_TO_BENCH')).toBeNull()
  })
  it('both switch routes ask the refusal only when turning on, so off always works', () => {
    for (const f of ['src/app/api/settings/plugins/route.ts', 'src/app/api/superadmin/plugins/route.ts']) {
      expect(read(f)).toContain('on ? switchOnRefusal(plugin) : null')
    }
  })
})
