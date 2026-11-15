/**
 * What shows while a screen's data arrives: grey bars in roughly the shape
 * of what is coming, so the page does not jump when it lands. Screen
 * readers hear "Loading".
 */
export function Loading({ page = false, rows = 3 }: { page?: boolean; rows?: number }) {
  const bars = Array.from({ length: rows }, (_, i) => i)
  return (
    <div role="status" aria-busy="true" className={page ? 'mx-auto w-full max-w-6xl space-y-4 px-4 py-8 sm:px-6' : 'space-y-3'}>
      <span className="sr-only">Loading</span>
      {page && <div aria-hidden="true" className="h-7 w-56 animate-pulse rounded-lg bg-line/70" />}
      {bars.map((i) => (
        <div key={i} aria-hidden="true" className="animate-pulse rounded-xl border border-line bg-white p-4">
          <div className="h-3.5 rounded bg-line/70" style={{ width: `${70 - i * 12}%` }} />
          <div className="mt-2.5 h-3 w-1/3 rounded bg-line/50" />
        </div>
      ))}
    </div>
  )
}
