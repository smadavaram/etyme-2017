import { NextRequest, NextResponse } from 'next/server'
import { teamsBotConfig, missingTeamsKeys, teamsBotOffSentence } from '@/lib/teams/config'
import { verifyFromTeams } from '@/lib/teams/auth'
import { handleActivity, type Activity } from '@/lib/teams/bot'

/**
 * POST /api/teams/messages
 *
 * Door 1 of the job twin: where Microsoft Teams posts every activity for
 * the Etyme bot — an install, a message, a button pressed on a card.
 *
 * No seat is read from a session here, because Teams has none. The
 * activity authenticates itself: the Bot Framework's signed token is
 * checked (lib/teams/auth) against our app id before a byte of the body
 * is acted on, and then the Teams account is bound to a person with a
 * live seat (lib/teams/binding), whose permissions are the only ones the
 * bot uses. A button never writes anything here: it is handed to the
 * twin's approval door (lib/teams/actions).
 *
 * With any of MICROSOFT_APP_ID, MICROSOFT_APP_PASSWORD or
 * MICROSOFT_APP_TENANT_ID unset, every post is refused with 503 and a
 * sentence naming what to set — never trusted. A post that is not from
 * Teams for this bot is refused with 401 and nothing in it is read.
 */
export async function POST(request: NextRequest) {
  const config = teamsBotConfig()
  if (!config) {
    return NextResponse.json(
      { error: { code: 'TEAMS_BOT_OFF', message: teamsBotOffSentence(missingTeamsKeys()) } },
      { status: 503 }
    )
  }

  const raw = await request.text().catch(() => '')
  let activity: Activity
  try {
    activity = JSON.parse(raw) as Activity
  } catch {
    return NextResponse.json({ error: { code: 'NOT_AN_ACTIVITY', message: 'This is not a Teams activity, so nothing was read.' } }, { status: 400 })
  }

  const verdict = await verifyFromTeams({
    authorization: request.headers.get('authorization'),
    serviceUrl: activity.serviceUrl,
    channelId: activity.channelId,
    config,
  })
  if (!verdict.ok) {
    return NextResponse.json({ error: { code: 'NOT_FROM_TEAMS', message: verdict.says } }, { status: 401 })
  }

  const reply = await handleActivity(activity, config)
  return reply.body === undefined ? new NextResponse(null, { status: reply.status }) : NextResponse.json(reply.body, { status: reply.status })
}
