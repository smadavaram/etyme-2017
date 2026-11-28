/**
 * The sentence a seat with no desk yet reads when it opens, by URL, a
 * page its menu does not offer it: Timesheets, Budget, Org view.
 *
 * It lives in `lib/no-desk` now, where the architect's one door in
 * `lib/api-context` says it for every route; this is a re-export so the
 * door and the routes that said it first say it in one voice, from one
 * definition.
 */
export { noDeskYet } from '@/lib/no-desk'
