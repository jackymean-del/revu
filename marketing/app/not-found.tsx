import Link from 'next/link'
import { Chrome } from '@/components/Chrome'

export default function NotFound() {
  return (
    <Chrome>
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-3xl font-extrabold">This page is not here</h1>
        <p className="mt-3 text-muted">It may have moved. The home page has everything else.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white">
          Go home
        </Link>
      </div>
    </Chrome>
  )
}
