import { NextRequest, NextResponse } from 'next/server'
import { setupDoor, refused } from './door'
import { readSetup } from './read'
import { recordItem } from '@/lib/setup-checklist-state'

/**
 * GET  /api/settings/setup — the setup checklist: every item, done,
 *      skipped or to do, and each item's body with its defaults filled
 * POST /api/settings/setup — { item, outcome: DONE | SKIPPED }, recorded
 *      with who and when
 *
 * The founder, 2026-10-22, "Build it" 2026-10-28: after sign-in and "Your
 * company" the Owner or Admin reads one checklist, every item skippable,
 * and it comes back until it is done. The rules are lib/setup-checklist;
 * the record lib/setup-checklist-state. An item with answers is saved
 * through /api/settings/setup/<item>, which records it done in the same
 * call; this route records "Skip for now", and "Save and continue" on an
 * item that has nothing to type (Sites, How you work, Your team).
 */

export async function GET(request: NextRequest) {
  const door = await setupDoor(request)
  if (door.error) return door.error
  const data = await readSetup(door.caller.company.id, { personId: door.personId, email: door.caller.person.primaryEmail })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const door = await setupDoor(request, 'Answering the setup checklist')
  if (door.error) return door.error
  const body = await request.json().catch(() => ({}))
  const v = await recordItem(door.caller.company.id, door.personId, body.item, body.outcome)
  if (!v.ok) return refused(v.says)
  const data = await readSetup(door.caller.company.id, { personId: door.personId, email: door.caller.person.primaryEmail })
  return NextResponse.json({ data })
}
