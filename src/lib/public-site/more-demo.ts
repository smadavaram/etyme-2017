import type { DemoTarget } from './flow'

/**
 * Where "See this in the demo" opens on the four product pages that hang
 * under a step: the screen each page's own picture was taken from, at the
 * desk it was taken as (`screen.from` in `./modules`).
 */
export const MORE_DEMO: Record<string, DemoTarget> = {
  '/governance': { as: 'world-nike', desk: 'programme', screen: '/dashboard/compliance', seat: 'the program manager' },
  '/submissions': { as: 'world-nike', desk: 'hiring', screen: '/dashboard/submissions', seat: 'the hiring manager' },
  '/compliance': { as: 'world-nike', desk: 'programme', screen: '/dashboard/tenure', seat: 'the program manager' },
  '/chain': { as: 'world-nike', desk: 'programme', screen: '/dashboard/people', seat: 'the program manager' },
}
