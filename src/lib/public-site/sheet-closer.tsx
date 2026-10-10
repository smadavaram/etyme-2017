'use client'

import { useEffect } from 'react'

/**
 * Closes the phone sheet when a link in it is followed or Escape is
 * pressed. The sheet is a `details` element, so it opens and closes with
 * no script at all; this only adds the two closings a reader expects —
 * a tap on a link that lands on the same page (a band of the home page)
 * would otherwise leave the sheet open over the band it just scrolled to.
 */
export function SheetCloser({ id }: { id: string }) {
  useEffect(() => {
    const sheet = document.getElementById(id) as HTMLDetailsElement | null
    if (!sheet) return
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('a')) sheet.open = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sheet.open) {
        sheet.open = false
        sheet.querySelector('summary')?.focus()
      }
    }
    sheet.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      sheet.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [id])
  return null
}
