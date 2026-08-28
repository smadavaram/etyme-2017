import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/health — is this deployment actually working
 *
 * Written the first time a live deployment answered a visitor with a
 * blank 500 and there was no way to tell, from outside, whether the
 * database was unreachable, empty, or fine and something else was
 * broken. Three very different problems, one identical symptom.
 *
 * ── What it will not do ──────────────────────────────────────────────
 *
 * Print a single secret. It says which environment variables are set,
 * never what they contain — a health endpoint is public by definition,
 * and one that echoes a connection string is a worse problem than the
 * one it was written to solve.
 *
 * It also counts nothing sensitive. Whether the tables exist is fair;
 * how many customers are in them is not.
 */
export async function GET() {
  const started = Date.now()

  // Named, never valued. Somebody reading this should be able to tell
  // that DATABASE_URL is missing without learning anybody's password.
  const configured = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    NEXTAUTH_SECRET: Boolean(process.env.NEXTAUTH_SECRET),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
  }

  let database: {
    ok: boolean
    state: 'READY' | 'NO_TABLES' | 'UNREACHABLE' | 'NOT_CONFIGURED'
    says: string
    ms: number | null
  }

  if (!process.env.DATABASE_URL) {
    database = {
      ok: false,
      state: 'NOT_CONFIGURED',
      says: 'No DATABASE_URL on this deployment. Nothing can work until there is one.',
      ms: null,
    }
  } else {
    try {
      // A real query against a real table. `SELECT 1` proves the socket
      // opened and nothing else, and "the socket opened" was exactly the
      // thing that was already true when the demo was failing.
      await prisma.company.count()
      database = {
        ok: true,
        state: 'READY',
        says: 'Database reachable and the schema is there.',
        ms: Date.now() - started,
      }
    } catch (err: any) {
      const why = String(err?.message ?? err)
      const noTables =
        /P2021|P2022|does not exist in the current database|relation .* does not exist/i.test(why)

      database = {
        ok: false,
        state: noTables ? 'NO_TABLES' : 'UNREACHABLE',
        says: noTables
          ? 'Database reachable, but the schema has never been pushed. Set DB_PUSH_ON_BUILD=1 and redeploy.'
          : 'Database is not answering. Check DATABASE_URL and that the database is awake.',
        ms: Date.now() - started,
      }
    }
  }

  // How somebody signs in, which on a fresh deployment is usually
  // "they cannot, and that is expected".
  const providers: string[] = []
  if (process.env.GOOGLE_CLIENT_ID) providers.push('Google')
  if (process.env.AZURE_AD_CLIENT_ID) providers.push('Microsoft')
  if (process.env.EMAIL_SERVER) providers.push('Email link')

  const ok = database.ok && configured.NEXTAUTH_SECRET

  return NextResponse.json(
    {
      data: {
        ok,
        database,
        configured,
        signIn:
          providers.length > 0
            ? `Sign-in via ${providers.join(', ')}.`
            : 'No sign-in provider configured — the only way in is the demo button.',
        // The one model call in the product. Off is a valid state and
        // says so rather than failing quietly.
        model: process.env.ANTHROPIC_API_KEY
          ? 'The CV evidence check is on.'
          : 'No API key, so the CV evidence check is skipped and reports itself as unverified. Every other check is arithmetic and runs anyway.',
        says: ok
          ? 'This deployment is working.'
          : database.says,
      },
    },
    { status: ok ? 200 : 503 }
  )
}
