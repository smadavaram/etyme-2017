import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appUrl as fromHelper } from '@/lib/app-url'
import { appUrl as fromSupplierLink } from '@/lib/supplier-link'

/**
 * The release pass on 2026-10-08 found the build red: the privacy page,
 * a screen, reached appUrl through lib/data-request, and appUrl lived in
 * lib/supplier-link beside a token minted with node:crypto. The helper
 * now has a file of its own with nothing server-only in it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the base address every link is built from', () => {
  it('the base address helper has no server-only import, so a screen may read it', () => {
    const src = read('src/lib/app-url.ts')
    expect(src).not.toMatch(/from ['"]node:/)
    expect(src).not.toMatch(/from ['"](crypto|fs|path|@prisma\/client|@\/lib\/db)['"]/)
    expect(src).not.toMatch(/^import /m)
  })

  it('the supplier link file hands out the same helper, so older imports still work', () => {
    expect(fromSupplierLink).toBe(fromHelper)
  })

  it('the privacy request library takes the base address from the pure helper', () => {
    expect(read('src/lib/data-request.ts')).toMatch(/import \{ appUrl \} from '@\/lib\/app-url'/)
  })
})
