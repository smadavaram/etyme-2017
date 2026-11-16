/**
 * Layer 9, slice 1: the screen and the route it calls agree.
 * "Download for your system" is drawn only where the route will answer,
 * and the screen sends every question the route asks.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/dashboard/ap/page.tsx')
const screen = read('src/app/dashboard/ap/payment-run-file.tsx')
const route = read('src/app/api/ap/receipts-file/route.ts')

describe('the Download for your system act on the payables page', () => {
  it('is drawn only on an approved run, inside the block drawn for a seat that releases payment runs', () => {
    const at = page.indexOf('<DownloadReceiptLines')
    expect(at).toBeGreaterThan(0)
    const block = page.lastIndexOf('desk.mayRun', at)
    expect(block).toBeGreaterThan(0)
    expect(page.slice(at - 60, at)).toContain("r.status === 'APPROVED'")
  })

  it('the route asks for the same permission the page draws it for', () => {
    expect(route).toContain("'payments.record'")
    expect(read('src/lib/money/pay-desk.ts')).toContain("hasPermission(input.permissions, 'payments.record')")
  })

  it('the screen sends the run and the chosen columns, the two questions the route asks', () => {
    expect(screen).toContain('/api/ap/receipts-file?run=')
    expect(screen).toContain('&columns=')
    expect(route).toContain("searchParams.get('run')")
    expect(route).toContain("searchParams.get('columns')")
  })

  it('the screen says no bank details and names no product on its label', () => {
    expect(screen).toContain('No bank details.')
    expect(screen).toContain('Download for your system')
  })

  it('the screen never imports a server-only file for its columns', () => {
    const imports = screen.match(/from '@\/lib\/money\/receipt-file'/g) ?? []
    expect(imports).toHaveLength(1)
    expect(read('src/lib/money/receipt-file.ts')).not.toMatch(/@\/lib\/db|prisma/)
  })
})
