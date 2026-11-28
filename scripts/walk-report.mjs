/**
 * The desk walk's report, from its results. Pure, so it can be tested.
 *
 * `results` is one entry per desk:
 *   { party, kind, company, desk, person, nav, navProblems, pages: [{ label, path, shot, problems }] , error? }
 *
 * The report is for the founder: plain words, short lines, one section
 * per party, then per desk, then per page — only pages with problems
 * are listed under a desk, with a count of the clean ones.
 */

import { KINDS } from './walk-checks.mjs'

/**
 * Which party a desk is reported under. A consultant is a person, not a
 * desk at the firm that lists them, so every consultant seat is reported
 * together under Workers, with the firm in the desk's name.
 */
export function partyOf(r) {
  return r.kind === 'WORKER' ? 'Workers (consultants)' : r.party
}

function deskOf(r) {
  return r.kind === 'WORKER' ? `${r.desk} listed by ${r.party}` : r.desk
}

const KIND_ORDER = ['CLIENT', 'MSP', 'GSI', 'VENDOR', 'CONSULTANT_CORP', 'WORKER']

export function tally(results) {
  const byKind = {}
  const byParty = new Map()
  const byPartyKind = new Map()
  let pages = 0
  let shots = 0
  for (const r of results) {
    const party = partyOf(r)
    const p = byParty.get(party) ?? { party, kind: r.kind, desks: 0, pages: 0, problems: 0, byKind: {} }
    const pk = byPartyKind.get(r.kind) ?? { kind: r.kind, parties: new Set(), desks: 0, pages: 0, problems: 0 }
    pk.parties.add(r.company ?? r.party)
    pk.desks += 1
    pk.pages += (r.pages ?? []).length
    p.desks += 1
    const problems = [...(r.navProblems ?? []), ...(r.pages ?? []).flatMap((pg) => pg.problems ?? [])]
    if (r.error) problems.push({ kind: 'error-page', what: r.error })
    p.pages += (r.pages ?? []).length
    p.problems += problems.length
    pk.problems += problems.length
    byPartyKind.set(r.kind, pk)
    for (const pr of problems) {
      p.byKind[pr.kind] = (p.byKind[pr.kind] ?? 0) + 1
      byKind[pr.kind] = (byKind[pr.kind] ?? 0) + 1
    }
    pages += (r.pages ?? []).length
    shots += (r.pages ?? []).filter((pg) => pg.shot).length
    byParty.set(party, p)
  }
  const kinds = [...byPartyKind.values()]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .map((k) => ({ ...k, parties: k.parties.size }))
  return { byKind, byPartyKind: kinds, parties: [...byParty.values()], pages, shots, desks: results.length }
}

function cell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function buildMarkdown(results, meta = {}) {
  const t = tally(results)
  const kinds = Object.keys(KINDS).filter((k) => t.byKind[k])
  const out = []
  out.push('# Every desk, walked')
  out.push('')
  if (meta.url) out.push(`- Walked: ${meta.url}`)
  if (meta.startedAt) out.push(`- Started: ${meta.startedAt}`)
  if (meta.seconds != null) out.push(`- Took: ${Math.round(meta.seconds / 60)} min ${Math.round(meta.seconds % 60)} s`)
  out.push(`- Desks: ${t.desks}. Pages opened: ${t.pages}. Screenshots: ${t.shots}.`)
  out.push(`- Problems: ${Object.values(t.byKind).reduce((a, b) => a + b, 0)}.`)
  out.push('')
  out.push('Nothing was clicked that writes. Every page was opened from the menu the desk actually sees.')
  out.push('')
  out.push('## Problems by kind')
  out.push('')
  out.push('| Kind | Count |')
  out.push('|---|---|')
  for (const k of Object.keys(KINDS)) if (t.byKind[k]) out.push(`| ${KINDS[k]} | ${t.byKind[k]} |`)
  out.push('')
  out.push('## By kind of party')
  out.push('')
  out.push('| Kind | Companies | Desks | Pages | Problems |')
  out.push('|---|---|---|---|---|')
  for (const k of t.byPartyKind) out.push(`| ${k.kind} | ${k.parties} | ${k.desks} | ${k.pages} | ${k.problems} |`)
  out.push('')
  out.push('## By party')
  out.push('')
  out.push(`| Party | Kind | Desks | Pages | Problems | ${kinds.map((k) => cell(k)).join(' | ')} |`)
  out.push(`|---|---|---|---|---|${kinds.map(() => '---').join('|')}${kinds.length ? '|' : ''}`)
  for (const p of t.parties) {
    out.push(`| ${cell(p.party)} | ${p.kind} | ${p.desks} | ${p.pages} | ${p.problems} | ${kinds.map((k) => p.byKind[k] ?? '').join(' | ')} |`)
  }
  out.push('')
  out.push('Kinds: ' + kinds.map((k) => `**${k}** — ${KINDS[k]}`).join('; ') + '.')
  out.push('')

  const parties = [...new Set(results.map(partyOf))]
  for (const party of parties) {
    out.push(`## ${party}`)
    out.push('')
    for (const r of results.filter((x) => partyOf(x) === party)) {
      const pages = r.pages ?? []
      const bad = pages.filter((pg) => (pg.problems ?? []).length > 0)
      out.push(`### ${deskOf(r)}${r.person ? ` — ${r.person}` : ''}`)
      out.push('')
      out.push(`${pages.length} pages from the menu; ${pages.length - bad.length} with no problems.`)
      if (r.error) out.push(`- **Could not walk this desk:** ${r.error}`)
      if (r.nav && r.nav.length) {
        out.push(`- Menu: ${r.nav.map((s) => `${s.label} (${(s.links ?? []).length})`).join(' · ')}`)
      }
      for (const pr of r.navProblems ?? []) out.push(`- Menu — ${KINDS[pr.kind] ?? pr.kind}: ${pr.what}`)
      out.push('')
      for (const pg of bad) {
        out.push(`**${pg.section ? `${pg.section} › ` : ''}${pg.label}** \`${pg.path}\`${pg.shot ? ` — [screenshot](${pg.shot})` : ''}`)
        for (const pr of pg.problems) out.push(`- ${pr.kind}: ${pr.what}`)
        out.push('')
      }
    }
  }
  return out.join('\n') + '\n'
}

export function buildJson(results, meta = {}) {
  return { meta, summary: tally(results), desks: results }
}
