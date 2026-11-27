/** The two tabs of the training manage area, under the firm's own learning header. */
export function ManageTabs({ tenant, here }: { tenant: string; here: 'courses' | 'cohorts' }) {
  const tab = (id: string, href: string, word: string) => (
    <a
      href={href}
      aria-current={here === id ? 'page' : undefined}
      className={`px-3 py-1.5 text-sm rounded ${here === id ? 'bg-etyme-sunk text-etyme-ink font-medium' : 'text-etyme-muted'}`}
    >{word}</a>
  )
  return (
    <nav aria-label="Training" className="flex gap-1 mb-5">
      {tab('courses', `/learn/${tenant}/manage`, 'Skills and courses')}
      {tab('cohorts', `/learn/${tenant}/manage/cohorts`, 'Cohorts')}
    </nav>
  )
}
