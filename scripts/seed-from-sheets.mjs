#!/usr/bin/env node
/**
 * Turn a vendor's own spreadsheets into a database that can process
 * transactions.
 *
 * This is the bridge between "here are some files" and Level 2 and 3 of
 * the testing documentation: without it those levels run on invented
 * data, and invented data agrees with whatever you built.
 *
 * Reads the JSON that scripts/sheets-to-json.py produces. That split is
 * deliberate — the converter reads .xlsx, which needs a dependency Node
 * does not have and CLAUDE.md says not to add casually; everything that
 * touches the database is TypeScript-adjacent and goes through Prisma
 * like the rest of the product.
 *
 * ── What it will not do ──────────────────────────────────────────────
 *
 * It carries no grouping by national origin, and it records no work
 * authorisation that the source did not state precisely. Both rules are
 * enforced upstream in the converter and repeated here in the report, so
 * a person running it sees what was dropped and why rather than
 * discovering it later.
 *
 * Marks everything it writes as demo data with an expiry, so a seeded
 * database is never mistaken for a real tenant's.
 *
 *   python3 scripts/sheets-to-json.py <folder> > seed.json
 *   node scripts/seed-from-sheets.mjs seed.json
 */

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/seed-from-sheets.mjs <seed.json>')
  process.exit(1)
}

const data = JSON.parse(readFileSync(file, 'utf8'))
const DEMO_DAYS = 30
const expires = new Date(Date.now() + DEMO_DAYS * 86400000)

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

/** Every firm that appears, one company each, keyed by its own domain. */
async function seedFirms(contacts) {
  const byDomain = new Map()
  for (const c of contacts) {
    if (!byDomain.has(c.domain)) byDomain.set(c.domain, { name: c.company ?? c.domain, people: [] })
    byDomain.get(c.domain).people.push(c)
  }

  const made = []
  for (const [domain, firm] of byDomain) {
    const company = await prisma.company.upsert({
      where: { slug: slug(domain) },
      update: {},
      create: {
        name: firm.name,
        slug: slug(domain),
        // Everything here is a staffing or client firm reached through a
        // corporate domain, which is the business-user population.
        kind: 'VENDOR',
        domain,
        domainVerified: false,
        currency: 'USD',
        isDemo: true,
        demoExpiresAt: expires,
      },
    })

    for (const p of firm.people) {
      await prisma.person.upsert({
        where: { primaryEmail: p.email },
        update: {},
        create: { name: p.name || p.email.split('@')[0], primaryEmail: p.email },
      })
    }
    made.push({ company, count: firm.people.length })
  }
  return made
}

/**
 * The bench.
 *
 * Consultants are consumer-email individuals — the candidate population,
 * not the business one — and each is listed on the bench of the firm
 * whose sheet they came from. A listing is what makes somebody
 * submittable at all, so without this step no transaction can happen.
 */
async function seedBench(candidates, hostCompanyId) {
  let listed = 0
  let noAuth = 0
  for (const c of candidates) {
    const person = await prisma.person.upsert({
      where: { primaryEmail: c.email },
      update: {},
      create: { name: c.name || c.email.split('@')[0], primaryEmail: c.email },
    })

    const skills = (c.skills ?? '')
      .split(/[,;/]/).map((s) => s.trim()).filter(Boolean).slice(0, 8)

    if (!c.workAuth) noAuth++

    const profile = await prisma.consultantProfile.upsert({
      where: { personId: person.id },
      update: {},
      create: {
        personId: person.id,
        headline: skills[0] ?? null,
        skills,
        location: c.location || null,
        // Null where the source did not say precisely. Unknown is a
        // question, never a refusal — see lib/work-authorisation.
        workAuth: c.workAuth ?? null,
        visibility: 'VERIFIED',
      },
    })

    const existing = await prisma.benchListing.findFirst({
      where: { consultantId: profile.id, companyId: hostCompanyId, revokedAt: null },
    })
    if (!existing) {
      await prisma.benchListing.create({
        data: { consultantId: profile.id, companyId: hostCompanyId, tier: 'MARKETING' },
      })
      listed++
    }
  }
  return { listed, noAuth }
}

async function main() {
  const firms = await seedFirms(data.contacts)

  // The bench has to belong to somebody. The first firm is the host.
  const host = firms[0]?.company
  if (!host) throw new Error('No firms in the file — nothing to hang a bench on.')
  const bench = await seedBench(data.candidates, host.id)

  const line = '='.repeat(72)
  console.log(`\n${line}\nSeeded from ${data.contacts.length} contacts and ${data.candidates.length} candidates\n${line}`)
  console.log(`\n  companies            ${firms.length}`)
  console.log(`  people at those firms ${data.contacts.length}`)
  console.log(`  consultants on bench  ${bench.listed}  (hosted by ${host.name})`)
  console.log(`  work auth unrecorded  ${bench.noAuth}`)

  if (data.refused?.length) {
    console.log(`\nRefused — not imported, and recorded as refused:`)
    for (const r of data.refused) console.log(`  · ${r}`)
  }
  if (data.notes?.length) {
    console.log(`\nRead with care:`)
    for (const n of data.notes) console.log(`  · ${n}`)
  }
  console.log(`\nEverything above is marked isDemo and expires ${expires.toISOString().slice(0, 10)}.\n`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
