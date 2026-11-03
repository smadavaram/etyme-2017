import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { reservedAddress } from '@/lib/demo-session'
import { SAMPLE_PERSON_EMAIL } from '@/lib/sample-seat'
import { holdsADesk } from '@/lib/nav-table'
import { workerDoors, type WorkerDoors, type WorkerRow } from '@/lib/demo-desks'
import { CANDIDATE_SEATS } from './seats'

/**
 * Every seeded person on a placement or a submission, as the world holds
 * them today, for the worker doors on /demo and for `POST /api/demo
 * {"worker": "<person id>"}`, which reads the same list so the route
 * cannot open somebody the page does not draw.
 *
 * Read from the record, never typed: a person the seed adds tomorrow has
 * a door tomorrow (the same rule the simulation's `worker/` seats follow
 * in scripts/simulate/actors.ts). Only people on a `world-` firm's work
 * count, so a visitor's private sandbox and a real tenant never appear.
 *
 * The firm a person sits under is the company of their newest usable
 * seat at a seeded firm (the firm that lists them on its bench, or
 * employs them), else the firm that last put them forward, else the firm
 * that sells their first line.
 */

interface Raw {
  personId: string
  name: string | null
  email: string
  seats: { slug: string | null; name: string | null; perms: string[] | null; paused: boolean }[] | null
  putBy: { slug: string; name: string } | null
  sells: { slug: string; name: string } | null
}

export async function workerRows(personId?: string): Promise<WorkerRow[]> {
  const only = personId ? Prisma.sql`and p.id = ${personId}` : Prisma.empty
  const raw = await prisma.$queryRaw<Raw[]>`
    select p.id as "personId", p.name, p."primaryEmail" as email,
      (select json_agg(json_build_object(
                'slug', co.slug, 'name', co.name,
                'perms', coalesce(r.permissions, '{}'::text[]),
                'paused', x."suspendedAt" is not null)
              order by x."grantedAt" desc, x.id desc)
         from "Context" x
         left join "Company" co on co.id = x."companyId"
         left join "Role" r on r.id = x."roleId"
        where x."personId" = p.id and x."revokedAt" is null) as seats,
      (select json_build_object('slug', co.slug, 'name', co.name)
         from "Submission" s join "Company" co on co.id = s."fromCompanyId"
        where s."personId" = p.id and co.slug like 'world-%'
        order by s."submittedAt" desc limit 1) as "putBy",
      (select json_build_object('slug', co.slug, 'name', co.name)
         from "SellContract" s join "Company" co on co.id = s."companyId"
        where s."personId" = p.id and co.slug like 'world-%'
        order by s."createdAt" asc limit 1) as sells
    from "Person" p
    where (exists (select 1 from "SellContract" s join "Company" co on co.id = s."companyId"
                    where s."personId" = p.id and co.slug like 'world-%')
        or exists (select 1 from "Submission" s join "Company" co on co.id = s."fromCompanyId"
                    where s."personId" = p.id and co.slug like 'world-%'))
      ${only}
    order by p.name`
  return raw.map((r) => {
    const seats = r.seats ?? []
    const usable = seats.filter((s) => !s.paused)
    const atFirm = usable.find((s) => s.slug?.startsWith('world-'))
    const firm = atFirm?.slug && atFirm.name ? { slug: atFirm.slug, name: atFirm.name } : r.putBy ?? r.sells
    return {
      personId: r.personId,
      name: r.name ?? r.email,
      email: r.email,
      firmSlug: firm?.slug ?? null,
      firmName: firm?.name ?? null,
      holdsADesk: usable.some((s) => holdsADesk(s.perms ?? [])),
      paused: usable.length === 0 && seats.length > 0,
    }
  })
}

/** The rule every worker door is drawn by, the page's and the route's alike. */
export function doorsFrom(rows: readonly WorkerRow[]): WorkerDoors {
  return workerDoors(rows, {
    doored: CANDIDATE_SEATS.map((c) => c.email),
    reserved: reservedAddress,
    excluded: [SAMPLE_PERSON_EMAIL],
  })
}

/** The worker doors for /demo. Empty where the world is not seeded or the database does not answer. */
export async function workerDoorsNow(): Promise<WorkerDoors> {
  try {
    return doorsFrom(await workerRows())
  } catch (err: any) {
    await reportError('demo: could not read the worker doors', String(err?.message ?? err)).catch(() => undefined)
    return { firms: [], without: [] }
  }
}
