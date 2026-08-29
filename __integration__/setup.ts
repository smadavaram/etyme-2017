/**
 * The harness: a real Postgres, the real routes, a signable-in user.
 *
 * Auth goes through the same DEV_BYPASS_AUTH door the dev screenshots
 * use — the routes run their real code path for everything except the
 * session lookup, which is the one thing a test cannot have.
 */
process.env.DATABASE_URL = 'postgresql://postgres@localhost:5432/etyme_test'
// NODE_ENV is typed read-only; the assignment is real all the same.
;(process.env as Record<string, string>).NODE_ENV = 'development'
process.env.NEXTAUTH_SECRET = 'integration-test-secret'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
