import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import {
  IMPORTABLE,
  entityByKey,
  importableFor,
  mapColumnsFor,
  parseRows,
  previewOf,
  type EntitySpec,
  type RowResult,
} from '@/lib/importable'
import { extractWithModel, modelAvailable, reviewOf, toRows } from '@/lib/extract'

/**
 * GET  /api/imports/sheets — what this person may load
 * POST /api/imports/sheets — preview a file, or commit it
 *
 * Separate from /api/imports, which is the candidate importer: that one
 * stages rows for review and correction before anything is written, which
 * is right for people because a wrong name matters. Reference data — cost
 * centres, work sites, purchase orders — does not need a staging table. It
 * needs the file checked, shown, and written.
 *
 * One engine, many sheets, each gated by whoever owns that data. Finance
 * cannot load people; recruiting cannot load GL accounts. The permission
 * decides what is offered rather than what is rejected, because being told
 * at the end of a long upload that you were never allowed wastes an
 * afternoon.
 *
 * Preview and commit are two separate calls on purpose. Loading a rate
 * card over a live one should never be a surprise.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Imports load into a company' } },
      { status: 403 }
    )
  }

  const mine = importableFor(caller.permissions)

  return NextResponse.json({
    data: {
      sheets: mine.map((e) => ({
        key: e.key,
        label: e.label,
        owner: e.owner,
        blurb: e.blurb,
        naturalKey: e.naturalKey,
        fields: e.fields.map((f) => ({
          key: f.key,
          label: f.label,
          required: f.required,
          kind: f.kind,
          hint: f.hint ?? null,
        })),
      })),
      // Said plainly rather than showing an empty page.
      note: mine.length === 0
        ? 'Nothing here is yours to load. Importing cost centres needs settings.manage; importing people needs consultants.write.'
        : mine.length < IMPORTABLE.length
          ? `${IMPORTABLE.length - mine.length} other kind(s) of data can be loaded by somebody with different permissions.`
          : null,
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Imports load into a company' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const spec = entityByKey(String(body.entity ?? ''))
  if (!spec) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say what kind of data this is',
          field: 'entity',
          options: importableFor(caller.permissions).map((e) => ({ key: e.key, label: e.label })),
        },
      },
      { status: 422 }
    )
  }

  // Checked again on the way in. The list being filtered is a courtesy, not
  // a control.
  const allowed = importableFor(caller.permissions).some((e) => e.key === spec.key)
  if (!allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: `Loading ${spec.label.toLowerCase()} is ${spec.owner.toLowerCase()}'s, and needs ${spec.permission}.`,
        },
      },
      { status: 403 }
    )
  }

  // ── Read it, rather than match column headings ──────────────────────
  //
  // Given raw content — a pasted table, an email, the text of a document —
  // it is read by the model, which returns values with a confidence and a
  // quote of where each came from. The header matcher stays as the
  // fallback and says so, because a degraded result presented as a good
  // one is worse than a refusal.
  let rows: Record<string, string>[] = Array.isArray(body.rows) ? body.rows : []
  let readBy: 'MODEL' | 'HEADERS' = 'HEADERS'
  let readNote: string | null = null
  let review: ReturnType<typeof reviewOf> | null = null

  if (typeof body.content === 'string' && body.content.trim()) {
    if (!modelAvailable()) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_READER',
            message:
              'Reading a document needs ANTHROPIC_API_KEY. Without it only a spreadsheet with recognisable column headings can be loaded — send rows instead of content.',
          },
        },
        { status: 422 }
      )
    }

    const extracted = await extractWithModel(spec, body.content)
    if (!extracted || extracted.records.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NOTHING_READ',
            message: extracted?.note ?? 'Nothing could be read out of that.',
            unread: extracted?.unread ?? [],
          },
        },
        { status: 422 }
      )
    }

    rows = toRows(extracted.records, spec)
    readBy = 'MODEL'
    readNote = extracted.note
    review = reviewOf(extracted.records)

    // Anything inferred rather than read is confirmed before it is
    // written. Writing a guess is how an import silently changes a rate.
    if (body.commit && review.toConfirm > 0 && !body.confirmedGuesses) {
      return NextResponse.json(
        {
          error: {
            code: 'NEEDS_CONFIRMING',
            message: `${review.toConfirm} value(s) were inferred rather than read. Look at them, then send confirmedGuesses: true.`,
            review,
          },
        },
        { status: 409 }
      )
    }
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'The file has no rows in it', field: 'rows' } },
      { status: 422 }
    )
  }
  if (rows.length > 5000) {
    return NextResponse.json(
      {
        error: {
          code: 'TOO_MANY',
          message: `${rows.length} rows is more than one load should carry. Split it — 5,000 at a time keeps the report readable and the failure recoverable.`,
        },
      },
      { status: 422 }
    )
  }

  const headers = Object.keys(rows[0])
  const mapping = mapColumnsFor(spec, headers)

  if (!mapping.ready) {
    return NextResponse.json(
      {
        error: {
          code: 'MISSING_COLUMNS',
          message: `The file has no column for ${mapping.missingRequired.join(', ')}. Add it and load again.`,
          mapping,
        },
      },
      { status: 422 }
    )
  }

  const parsed = parseRows(spec, mapping, rows)
  const existingKeys = await keysAlreadyHere(spec, caller.company.id)
  const preview = previewOf(spec, parsed, existingKeys)

  // ── Preview only ────────────────────────────────────────────────────
  if (!body.commit) {
    return NextResponse.json({
      data: {
        committed: false,
        // Which reader ran. Never silently one when it looks like the other.
        readBy,
        readNote,
        review,
        mapping,
        preview: {
          ...preview,
          // The whole point of a preview is the bad rows, so they lead and
          // the good ones are a sample.
          problems: parsed.filter((r) => !r.ok).slice(0, 50).map((r) => ({
            row: r.rowNumber,
            problems: r.problems,
          })),
          sample: parsed.filter((r) => r.ok).slice(0, 5).map((r) => r.values),
        },
      },
    })
  }

  // ── Commit ──────────────────────────────────────────────────────────
  const good = parsed.filter((r) => r.ok)
  const written = await writeRows(spec, caller.company.id, good)

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'DATA_IMPORTED',
      summary: `${caller.person.name} loaded ${spec.label.toLowerCase()} — ${written.created} new, ${written.updated} updated, ${parsed.length - good.length} skipped`,
      reason: `Matched on ${spec.naturalKey}, so a repeat load changes nothing`,
      payload: {
        entity: spec.key,
        rows: parsed.length,
        created: written.created,
        updated: written.updated,
        skipped: parsed.length - good.length,
        failures: written.failures,
      },
      reversible: false,
    },
  })

  return NextResponse.json({
    data: {
      committed: true,
      readBy,
      readNote,
      review,
      created: written.created,
      updated: written.updated,
      skipped: parsed.length - good.length,
      // Rows that passed reading and still failed writing — a supplier
      // name that matches nothing, a duplicate inside the same file.
      failures: written.failures,
      problems: parsed.filter((r) => !r.ok).slice(0, 50).map((r) => ({
        row: r.rowNumber,
        problems: r.problems,
      })),
      message:
        written.failures.length > 0
          ? `${written.created} new, ${written.updated} updated. ${written.failures.length} row(s) could not be written — see below.`
          : `${written.created} new, ${written.updated} updated, ${parsed.length - good.length} skipped.`,
    },
  })
}

/** What is already here, so the preview can separate new from changed. */
async function keysAlreadyHere(spec: EntitySpec, companyId: string): Promise<Set<string>> {
  const lower = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()))

  switch (spec.key) {
    case 'COST_CENTERS': {
      const rows = await prisma.costCenter.findMany({ where: { companyId }, select: { code: true } })
      return lower(rows.map((r) => r.code))
    }
    case 'LOCATIONS': {
      const rows = await prisma.companyLocation.findMany({ where: { companyId }, select: { name: true } })
      return lower(rows.map((r) => r.name))
    }
    case 'CONSULTANTS': {
      const rows = await prisma.person.findMany({ select: { primaryEmail: true } })
      return lower(rows.map((r) => r.primaryEmail))
    }
    case 'PURCHASE_ORDERS': {
      const rows = await prisma.purchaseOrder.findMany({ where: { issuedById: companyId }, select: { number: true } })
      return lower(rows.map((r) => r.number))
    }
    case 'HOLIDAYS': {
      const rows = await prisma.holiday.findMany({ where: { companyId }, select: { date: true } })
      return lower(rows.map((r) => r.date.toISOString().slice(0, 10)))
    }
    default:
      return new Set()
  }
}

interface WriteResult {
  created: number
  updated: number
  failures: { row: number; reason: string }[]
}

/**
 * Writing, row by row, collecting failures.
 *
 * Deliberately not one transaction. A finance team loading four hundred
 * cost centres wants the three hundred and ninety-eight good ones in and a
 * report of the two that were not — rolling everything back over two bad
 * rows means the file gets loaded by hand instead.
 */
async function writeRows(spec: EntitySpec, companyId: string, rows: RowResult[]): Promise<WriteResult> {
  let created = 0
  let updated = 0
  const failures: { row: number; reason: string }[] = []

  for (const r of rows) {
    try {
      const v = r.values as any
      switch (spec.key) {
        case 'COST_CENTERS': {
          const code = String(v.code).toUpperCase()
          const existing = await prisma.costCenter.findFirst({ where: { companyId, code } })
          if (existing) {
            await prisma.costCenter.update({
              where: { id: existing.id },
              data: { name: v.name, glAccount: v.glAccount ?? existing.glAccount, ...(v.isActive !== undefined ? { isActive: v.isActive } : {}) },
            })
            updated++
          } else {
            await prisma.costCenter.create({
              data: { companyId, code, name: v.name, glAccount: v.glAccount ?? null },
            })
            created++
          }
          break
        }

        case 'LOCATIONS': {
          const existing = await prisma.companyLocation.findFirst({ where: { companyId, name: v.name } })
          const data = {
            city: v.city ?? null,
            state: v.state ?? null,
            country: String(v.country ?? 'US').toUpperCase().slice(0, 2),
            address: v.address ?? null,
          }
          if (existing) {
            await prisma.companyLocation.update({ where: { id: existing.id }, data })
            updated++
          } else {
            await prisma.companyLocation.create({ data: { companyId, name: v.name, ...data } })
            created++
          }
          break
        }

        case 'CONSULTANTS': {
          const person = await prisma.person.upsert({
            where: { primaryEmail: v.email },
            update: { name: v.name },
            create: { primaryEmail: v.email, name: v.name },
          })
          const had = await prisma.consultantProfile.findUnique({ where: { personId: person.id } })
          await prisma.consultantProfile.upsert({
            where: { personId: person.id },
            update: {
              headline: v.headline ?? undefined,
              skills: v.skills ?? undefined,
              location: v.location ?? undefined,
              workAuth: v.workAuth ?? undefined,
              // Rate arrives in dollars and is held in cents, like every
              // other rate in the system.
              rateFloor: v.rateFloor !== undefined ? Math.round(v.rateFloor * 100) : undefined,
            },
            create: {
              personId: person.id,
              headline: v.headline ?? null,
              skills: v.skills ?? [],
              location: v.location ?? null,
              workAuth: v.workAuth ?? null,
              rateFloor: v.rateFloor !== undefined ? Math.round(v.rateFloor * 100) : null,
            },
          })
          if (had) updated++
          else created++
          break
        }

        case 'PURCHASE_ORDERS': {
          const supplier = await prisma.company.findFirst({
            where: { name: { equals: String(v.supplierName), mode: 'insensitive' } },
            select: { id: true },
          })
          if (!supplier) {
            failures.push({ row: r.rowNumber, reason: `No company here called "${v.supplierName}"` })
            continue
          }
          const existing = await prisma.purchaseOrder.findFirst({
            where: { issuedById: companyId, number: String(v.number) },
          })
          if (existing) {
            await prisma.purchaseOrder.update({
              where: { id: existing.id },
              data: { amount: v.amount, ...(v.endDate ? { endDate: v.endDate } : {}) },
            })
            updated++
          } else {
            await prisma.purchaseOrder.create({
              data: {
                number: String(v.number),
                issuedById: companyId,
                issuedToId: supplier.id,
                amount: v.amount,
                startDate: v.startDate ?? new Date(),
                endDate: v.endDate ?? null,
                status: 'OPEN',
              },
            })
            created++
          }
          break
        }

        case 'HOLIDAYS': {
          const date = v.date as Date
          const existing = await prisma.holiday.findFirst({ where: { companyId, date } })
          if (existing) {
            await prisma.holiday.update({ where: { id: existing.id }, data: { name: v.name } })
            updated++
          } else {
            await prisma.holiday.create({ data: { companyId, date, name: v.name } })
            created++
          }
          break
        }
      }
    } catch (err) {
      failures.push({
        row: r.rowNumber,
        reason: err instanceof Error ? err.message.slice(0, 160) : 'Could not be written',
      })
    }
  }

  return { created, updated, failures }
}
