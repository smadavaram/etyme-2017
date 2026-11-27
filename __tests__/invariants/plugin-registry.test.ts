import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { PLUGIN_REGISTRY, PLUGIN_KEYS, declOf, pluginOfAgent, pluginOfRoute, pluginDoors, isOfferedTo, agentPausedSays, actFenceSays } from '@/lib/plugin-registry'
import { PLUGINS, pluginsOfferedTo, isPluginKey, switchOnRefusal, PODS_CLOSED_SAYS } from '@/lib/plugins'
import { getNavForKind, menuFor } from '@/lib/nav-table'
import { FIRM_AGENTS } from '@/lib/decision-queue'
import { TWIN_ACTS } from '@/lib/autonomy'
import { foldUsage } from '@/lib/plugin-usage'
import { pluginTaskPausedSays, pluginOffTaskSays } from '@/lib/agents/tasks'

/**
 * The plugin framework (records 120 to 124, 132, 133): one declaration per
 * plugin, and everything else derives from it. These tests fail when
 * something that belongs to a plugin is not declared, and when a declared
 * thing is not gated.
 */

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function walk(dir: string, match: (f: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(root, rel)).isDirectory()) walk(rel, match, out)
    else if (match(rel)) out.push(rel)
  }
  return out
}
const apiPath = (file: string) => '/' + file.replace(/^src\/app\//, '').replace(/\/route\.ts$/, '')
const matrixText = read('src/lib/matrix.ts')

describe('every plugin is declared once, in full', () => {
  it('there are five plugins, each with a key, a label, a sentence, an order and its matrix row', () => {
    expect(PLUGIN_REGISTRY.map((p) => p.key)).toEqual(['TRAIN_TO_BENCH', 'PODS', 'WEBSITE', 'OUTREACH', 'PUBLIC_SECTOR'])
    for (const p of PLUGIN_REGISTRY) {
      expect(p.label.length, p.key).toBeGreaterThan(3)
      expect(p.says.length, p.key).toBeGreaterThan(30)
      expect(p.matrixRow, p.key).toMatch(/^L3\.\d+\.\d+\.\d+$/)
    }
    expect(new Set(PLUGIN_REGISTRY.map((p) => p.order)).size).toBe(PLUGIN_REGISTRY.length)
  })
  it('each plugin names a matrix row that exists', () => {
    for (const p of PLUGIN_REGISTRY) expect(matrixText, `${p.key} names ${p.matrixRow}`).toContain(`code: '${p.matrixRow}'`)
  })
  it('the list every screen reads is the registry in its declared order', () => {
    expect(PLUGINS.map((p) => p.key)).toEqual([...PLUGIN_REGISTRY].sort((a, b) => a.order - b.order).map((p) => p.key))
    expect(PLUGINS.every((p) => isPluginKey(p.key))).toBe(true)
    expect(isPluginKey('NOT_A_PLUGIN')).toBe(false)
  })
  it('a company that only buys is offered no plugin, and any company that sells is offered all of them', () => {
    expect(pluginsOfferedTo('CLIENT')).toEqual([])
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP']) expect(pluginsOfferedTo(kind)).toHaveLength(PLUGIN_REGISTRY.length)
    expect(isOfferedTo(declOf('PODS')!, 'CLIENT')).toBe(false)
  })
  it('Project teams is held closed until it is built, and no other plugin is', () => {
    expect(switchOnRefusal('PODS')).toBe(PODS_CLOSED_SAYS)
    for (const k of PLUGIN_KEYS.filter((k) => k !== 'PODS')) expect(switchOnRefusal(k)).toBeNull()
  })
  it('only Website and content is grandfathered, and only Outreach holds its sends alone', () => {
    expect(PLUGIN_REGISTRY.filter((p) => p.grandfathered).map((p) => p.key)).toEqual(['WEBSITE'])
    expect(PLUGIN_REGISTRY.filter((p) => p.whenOff === 'SENDS').map((p) => p.key)).toEqual(['OUTREACH'])
  })
})

describe('no list of plugins is written by hand anywhere else', () => {
  it('the Superadmin picker and its confirmation read the registry and name no plugin key', () => {
    const page = read('src/app/dashboard/superadmin/page.tsx')
    for (const k of PLUGIN_KEYS) expect(page, k).not.toContain(`value="${k}"`)
    expect(page).toContain('PLUGIN_REGISTRY')
  })
  it('the menu reads its plugin doors from the registry and keeps no list of its own', () => {
    const nav = read('src/lib/nav-table.ts')
    expect(nav).toContain('PLUGIN_REGISTRY')
    expect(nav).not.toMatch(/TRAIN_TO_BENCH:\s*TRAINING/)
  })
  it('the gate asks the registry whether a plugin is grandfathered and to whom it is offered, never a plugin by name', () => {
    const gate = read('src/lib/plugin-gate.ts')
    expect(gate).not.toMatch(/key === 'WEBSITE'/)
    expect(gate).not.toMatch(/kind === 'CLIENT'/)
  })
})

describe('every route of a plugin is declared and kept', () => {
  const routes = walk('src/app/api', (f) => f.endsWith('/route.ts'))

  it('every route under a plugin’s prefix calls its gate, reads its micro-site, or is declared open with a reason', () => {
    const bad: string[] = []
    for (const file of routes) {
      const hit = pluginOfRoute(apiPath(file))
      if (!hit) continue
      const text = read(file)
      const { plugin, route } = hit
      if (route.by === 'GATE' && !new RegExp(`pluginGate\\([a-zA-Z.]+, '${plugin.key}'\\)`).test(text)) bad.push(`${file} does not call the ${plugin.key} gate`)
      if (route.by === 'MICRO_SITE' && !/learnTenant|learnOpen/.test(text)) bad.push(`${file} does not read the micro-site's own reader`)
      if (route.by === 'OPEN' && (route.why ?? '').length < 40) bad.push(`${route.prefix} is open with no reason`)
    }
    expect(bad).toEqual([])
  })
  it('every route that calls a plugin’s gate sits under a prefix declared for that plugin', () => {
    const bad: string[] = []
    for (const file of routes) {
      for (const m of read(file).matchAll(/pluginGate\([a-zA-Z.]+, '([A-Z_]+)'\)/g)) {
        const hit = pluginOfRoute(apiPath(file))
        if (!hit || hit.plugin.key !== m[1]) bad.push(`${file} gates ${m[1]} and is not declared for it`)
      }
    }
    expect(bad).toEqual([])
  })
  it('every prefix a plugin declares has at least one route behind it', () => {
    for (const p of PLUGIN_REGISTRY) for (const r of p.routes) {
      expect(routes.some((f) => apiPath(f) === r.prefix || apiPath(f).startsWith(r.prefix + '/')), r.prefix).toBe(true)
    }
  })
  it('every page and micro-site a plugin declares exists', () => {
    for (const p of PLUGIN_REGISTRY) {
      for (const page of [...p.pages, ...p.openPages.map((o) => o.path)]) expect(existsSync(join(root, 'src/app', page)), page).toBe(true)
      if (p.microSite) expect(existsSync(join(root, 'src/app', p.microSite)), p.microSite).toBe(true)
    }
  })
})

describe('every menu door of a plugin is declared, drawn only while it is on', () => {
  const hrefsOf = (kind: any, plugins: string[]) => getNavForKind(kind, false, { plugins }).flatMap((s) => s.items.map((i) => i.href))
  it('a declared door is drawn for a supplier while its plugin is on and gone while it is off', () => {
    for (const { key, href } of pluginDoors()) {
      expect(hrefsOf('VENDOR', [key]), `${key} on`).toContain(href)
      expect(hrefsOf('VENDOR', PLUGIN_KEYS.filter((k) => k !== key)), `${key} off`).not.toContain(href)
    }
  })
  it('no link of the menu points into a plugin’s own pages unless the registry declares it as that plugin’s door', () => {
    const declared = new Set(pluginDoors().map((d) => d.href))
    const own = PLUGIN_REGISTRY.flatMap((p) => [...p.pages, ...p.openPages.map((o) => o.path)].filter((x) => x.startsWith('/dashboard')))
    const openOnPurpose = new Set(PLUGIN_REGISTRY.flatMap((p) => p.openPages.map((o) => o.path)))
    const bad: string[] = []
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      for (const href of hrefsOf(kind, [...PLUGIN_KEYS])) {
        if (own.some((o) => href === o || href.startsWith(o + '/')) && !declared.has(href) && !openOnPurpose.has(href)) bad.push(`${kind}: ${href}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('with every plugin off, none of their doors is in anybody’s menu', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) for (const { href } of pluginDoors()) expect(hrefsOf(kind, [])).not.toContain(href)
    expect(menuFor).toBeTypeOf('function')
  })
})

describe('every agent of a plugin is declared, and stops while its plugin is off', () => {
  const agentFiles = walk('src/lib/agents', (f) => f.endsWith('.ts')).concat(walk('src/lib/skills', (f) => f.endsWith('.ts')))
  it('every agent a plugin declares is a real agent of the firm', () => {
    const real = FIRM_AGENTS.map((a) => a.key as string)
    for (const p of PLUGIN_REGISTRY) for (const a of p.agents) expect(real, `${p.key}: ${a}`).toContain(a)
  })
  it('an agent belongs to at most one plugin', () => {
    const seen = new Map<string, string>()
    for (const p of PLUGIN_REGISTRY) for (const a of p.agents) {
      expect(seen.has(a), `${a} is declared by ${seen.get(a)} and ${p.key}`).toBe(false)
      seen.set(a, p.key)
    }
    expect(pluginOfAgent('proposals-agent')?.key).toBe('PUBLIC_SECTOR')
    expect(pluginOfAgent('outreach-batch')?.key).toBe('OUTREACH')
    expect(pluginOfAgent('timesheet-chase')).toBeNull()
  })
  it('no file of the agents or the skills reads a plugin by name unless that plugin declares an agent', () => {
    const bad: string[] = []
    for (const file of agentFiles) {
      const text = read(file)
      for (const p of PLUGIN_REGISTRY) {
        if (new RegExp(`['"]${p.key}['"]`).test(text) && p.agents.length === 0) bad.push(`${file} reads ${p.key}, which declares no agent`)
      }
    }
    expect(bad).toEqual([])
  })
  it('every act an agent of a plugin writes is one its plugin declares', () => {
    const files: Record<string, string[]> = {
      PUBLIC_SECTOR: ['src/lib/agents/proposals-agent.ts'],
      OUTREACH: ['src/lib/agents/outreach-batch.ts', 'src/lib/agents/dormant-outreach.ts'],
    }
    const bad: string[] = []
    for (const [key, list] of Object.entries(files)) {
      const decl = declOf(key)!
      for (const f of list) {
        for (const m of read(f).matchAll(/'((?:PROPOSAL|REGISTRATION|OUTREACH|DORMANT_OUTREACH)_[A-Z_]+)'/g)) {
          // The pause rows are the task's own notes, written by tasks.ts, not an agent's act.
          if (!decl.actions.includes(m[1]) && !['OUTREACH_PAUSED', 'OUTREACH_RESUMED', 'OUTREACH_BATCH'].includes(m[1])) bad.push(`${f}: ${m[1]}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
  it('every twin act kind a plugin declares is a real act, and none is a floor, a money or an outside act', () => {
    for (const p of PLUGIN_REGISTRY) for (const k of p.actKinds) {
      const act = (TWIN_ACTS as any)[k]
      expect(act, `${p.key}: ${k}`).toBeTruthy()
      expect(act.floor, k).toBe(false)
      expect(act.money, k).toBe(false)
    }
    for (const never of ['proposal.submit', 'proposal.sign', 'proposal.publish_compliance_copy']) {
      expect(PLUGIN_REGISTRY.flatMap((p) => [...p.actKinds])).not.toContain(never)
    }
  })
  it('the sentences an off plugin and a fenced act give name the agent, the plugin and what to do', () => {
    expect(agentPausedSays('Proposals', 'Public-sector proposals', 'Quillbrook')).toBe('Proposals did not run: Public-sector proposals is off for Quillbrook. The Owner turns it on in Settings. Nothing was deleted.')
    expect(actFenceSays('Proposals', 'Public-sector proposals', 'PAYMENT_RELEASED')).toMatch(/does not declare it, so nothing was written/)
  })
})

describe('a task is paused by its plugin, never deleted', () => {
  const firm = (on: string[]) => ({ name: 'Quillbrook', pluginsOn: on })
  it('a released task of a plugin that is off is paused in one sentence, and runs again when it is on', () => {
    const t = { agentKey: 'proposals-agent', state: 'APPROVED' }
    expect(pluginTaskPausedSays(t, firm([]))).toBe(`Paused: ${pluginOffTaskSays('Public-sector proposals', 'Quillbrook')}`)
    expect(pluginTaskPausedSays(t, firm(['PUBLIC_SECTOR']))).toBeNull()
  })
  it('a task still waiting for its yes, or already closed, is not called paused', () => {
    expect(pluginTaskPausedSays({ agentKey: 'proposals-agent', state: 'PROPOSED' }, firm([]))).toBeNull()
    expect(pluginTaskPausedSays({ agentKey: 'proposals-agent', state: 'DONE' }, firm([]))).toBeNull()
  })
  it('a core agent, and Outreach (which holds only its sends under its own words), are never paused by this rule', () => {
    expect(pluginTaskPausedSays({ agentKey: 'timesheet-chase', state: 'APPROVED' }, firm([]))).toBeNull()
    expect(pluginTaskPausedSays({ agentKey: 'outreach-batch', state: 'APPROVED' }, firm([]))).toBeNull()
  })
})

describe('what a plugin’s agents did is read per plugin from the ledger', () => {
  it('acts are added up per plugin, in the registry’s order, and a plugin with no agent reads zero', () => {
    const u = foldUsage({ 'proposals-agent': 2, 'outreach-batch': 1 }, { 'proposals-agent': 9, 'outreach-batch': 4, 'timesheet-chase': 50 })
    expect(u.map((x) => x.key)).toEqual(['TRAIN_TO_BENCH', 'PODS', 'WEBSITE', 'OUTREACH', 'PUBLIC_SECTOR'])
    expect(u.find((x) => x.key === 'PUBLIC_SECTOR')).toMatchObject({ actsToday: 2, actsLast30Days: 9 })
    expect(u.find((x) => x.key === 'OUTREACH')).toMatchObject({ actsToday: 1, actsLast30Days: 4 })
    expect(u.find((x) => x.key === 'PODS')).toMatchObject({ actsToday: 0, actsLast30Days: 0 })
  })
  it('an agent that belongs to no plugin is never counted under one', () => {
    const total = foldUsage({ 'timesheet-chase': 7 }, { 'timesheet-chase': 7 }).reduce((n, x) => n + x.actsLast30Days, 0)
    expect(total).toBe(0)
  })
})
