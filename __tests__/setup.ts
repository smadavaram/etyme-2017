/**
 * Test setup — runs before every test file.
 *
 * Design rule from CLAUDE.md:
 *   "Every module ships with tests named as English sentences."
 *   Good: "a consultant cannot be submitted without an active bench listing"
 *   Bad: "test submission validation"
 *
 * The founder reads test names to confirm the system does what he meant.
 */

// Global test timeout
import { vi } from 'vitest'

// Mock Prisma client for unit tests
vi.mock('@/lib/db', () => ({
  prisma: {
    company: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    person: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    submission: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    benchListing: {
      findFirst: vi.fn(),
    },
    sellContract: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    // A desk a client granted a firm that is not the client. Read by
    // lib/resolve-client-company on every resolution, so a unit test of
    // the vendor path falls over this one being absent rather than
    // failing on anything it is about.
    programSeat: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    accessLog: {
      create: vi.fn(),
    },
    automationLog: {
      create: vi.fn(),
    },
    // A company's sign-in policy and its directories (lib/identity,
    // 2026-11-11), read at every sign-in door. No row is today's behavior,
    // so a unit test that is not about identity meets none.
    companySignInPolicy: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
    },
    identityProvider: {
      findMany: vi.fn(async () => []),
    },
  },
}))
