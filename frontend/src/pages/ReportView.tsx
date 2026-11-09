import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { getReportItemHtml } from '../api/client'
import { ApiError } from '../api/problem'
import { useOrg } from '../lib/org-context'

/** One report exactly as it was made: where its QR code leads, after sign-in. */
export function ReportView() {
  const { itemId } = useParams({ from: '/report/$itemId' })
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const page = useQuery({ queryKey: ['report-item', orgId, itemId], queryFn: ({ signal }) => getReportItemHtml(orgId, itemId, signal), enabled: !!orgId })

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in to view this report.</p>
  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-8">
      <h1 className="text-xl font-extrabold">Report as it was made</h1>
      {page.isPending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : page.isError ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {page.error instanceof ApiError && page.error.status === 404 ? 'This report was not found here. Check that you are signed in to the right place.' : 'This report could not be shown.'}
        </p>
      ) : (
        <iframe title="Report" sandbox="" srcDoc={page.data} className="h-[85vh] w-full rounded-xl border border-line bg-canvas" />
      )}
    </div>
  )
}
