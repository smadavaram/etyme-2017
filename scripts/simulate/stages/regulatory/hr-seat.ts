/**
 * Who clears a start at a firm: its HR seat, and where nobody holds HR,
 * the Owner seats somebody there through Users & permissions first.
 *
 * Learned from the founder-scale run of 2026-11-01: paperwork-and-start
 * was refused 500 times "Clearing somebody to start is HR's work here",
 * because 148 of 160 generated suppliers seat nobody in their HR role and
 * the station fell back to the compliance officer, who does not keep the
 * firm's people. The refusal is right. So the actor learns the way a firm
 * would: the Owner reads the firm's own roles, invites a person into HR
 * (`POST /api/access/invite`), and the walk asks again from that seat.
 * Once per firm, however many of its placements are walking at once.
 *
 * Owned by regulatory. Never writes a row: every move is a route.
 */
import type { Actor, Res } from '../../actors'
import type { Ctx } from '../../stage'

/** The clearance route's refusal to a seat that is not HR's. Pure. */
export function isHrRefusal(res: Pick<Res, 'status' | 'sentence'>): boolean {
  return res.status === 403 && /Clearing somebody to start is HR[’']s work here/.test(res.sentence ?? '')
}

/** The firm's HR role among its own roles, by the names the trade uses. Null where it has none. Pure. */
export function hrRoleOf(roles: { id?: string; name?: string }[]): { id: string; name: string } | null {
  const r = roles.find((x) => x.id && (x.name === 'HR' || x.name === 'HR Partner'))
  return r ? { id: r.id!, name: r.name! } : null
}

const FIRST = ['Imogen', 'Tobias', 'Priyanka', 'Callum', 'Ines', 'Marek', 'Adaeze', 'Soren']
const LAST = ['Hale', 'Okonkwo', 'Varga', 'Lindqvist', 'Moreau', 'Achterberg', 'Reyes', 'Nakamura']

function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/**
 * The person the Owner invites into HR: the same each run for the same
 * firm, on a reserved address nobody can register, with the reason the
 * invitation carries. Pure.
 */
export function hrInviteFor(firm: { slug: string; name: string }): { email: string; name: string; reason: string } {
  const h = hashOf(firm.slug)
  const name = `${FIRST[h % FIRST.length]} ${LAST[Math.floor(h / FIRST.length) % LAST.length]}`
  const tail = firm.slug.replace(/^world-/, '').replace(/[^a-z0-9-]/g, '')
  return {
    email: `hr.${tail}@people.scale.invalid`,
    name,
    reason: `Nobody at ${firm.name} holds HR, and clearing somebody to start is HR’s work. Seated so start papers can be asked for.`,
  }
}

const seating = new Map<string, Promise<Actor | null>>()

/**
 * The firm's HR seat where it has one, else the Owner seats somebody in
 * HR first. Null where the firm has no HR role or the Owner could not
 * invite; the walk then keeps the refusal, said in its report.
 */
export function hrSeatAt(ctx: Ctx, firm: { id: string; slug: string; name: string }): Promise<Actor | null> {
  const have = ctx.cast.at(firm.slug, 'hr')
  if (have) return Promise.resolve(have)
  let p = seating.get(firm.id)
  if (!p) {
    p = (async () => {
      const owner = ctx.cast.at(firm.slug, 'owner')
      if (!owner) return null
      const roles = await owner.get('/api/roles')
      const role = hrRoleOf((roles.json?.data?.roles ?? []) as { id?: string; name?: string }[])
      if (!role) {
        ctx.log(`${firm.name} has no HR role to seat anybody in: ${roles.sentence ?? 'none among its roles'}`)
        return null
      }
      const invite = hrInviteFor(firm)
      const res = await owner.post('/api/access/invite', { email: invite.email, name: invite.name, roleId: role.id, reason: invite.reason })
      if (!res.ok && !/already have a seat here/.test(res.sentence ?? '')) {
        ctx.log(`${owner.name} could not seat HR at ${firm.name}: ${res.sentence ?? res.status}`)
        return null
      }
      await ctx.cast.refresh()
      return ctx.cast.at(firm.slug, 'hr')
    })()
    seating.set(firm.id, p)
  }
  return p
}

/** Whether this firm's HR is being seated, or has been, this run: a walk waits for it rather than being refused again. */
export function hrBeingSeated(firmId: string): boolean {
  return seating.has(firmId)
}
