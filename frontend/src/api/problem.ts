import type { components } from './schema.gen'

export type Problem = components['schemas']['Problem']

/**
 * A failed API call. Branch on code (stable, from the contract), show the
 * message to the person (what to fix, when fields need attention), and
 * quote requestId when reporting it.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly fields: Problem['errors']

  constructor(p: Problem) {
    // A validation failure says what to fix, not only that something is wrong.
    super(p.errors?.length ? [...new Set(p.errors.map((e) => e.message))].join(' ') : (p.detail ?? p.title))
    this.name = 'ApiError'
    this.status = p.status
    this.code = p.code
    this.requestId = p.requestId
    this.fields = p.errors
  }
}

const isProblem = (v: unknown): v is Problem =>
  typeof v === 'object' && v !== null && typeof (v as Problem).code === 'string' && typeof (v as Problem).status === 'number'

/**
 * Turns a non-2xx response into an ApiError. The server always sends
 * problem details; anything else (a proxy page, an empty body) still becomes
 * an ApiError so callers handle one kind of failure.
 */
export async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // not JSON: fall through to the generic problem below
  }
  if (isProblem(body)) return new ApiError(body)
  return new ApiError({
    type: 'about:blank',
    title: res.statusText || 'Request failed',
    status: res.status,
    code: 'http.' + String(res.status),
    detail: 'The server could not be reached properly. Try again in a moment.',
  })
}
