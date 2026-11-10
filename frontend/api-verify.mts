/**
 * API errors: every failed call becomes one ApiError carrying the server's
 * stable code. Run: npx tsx api-verify.mts   (from frontend/)
 *
 * The server sends RFC 7807 problem details (contracts/openapi.yaml,
 * Problem). Anything else that answers (a proxy error page, an empty body)
 * must still become an ApiError, so screens handle a single kind of failure.
 */
import { ApiError, toApiError } from './src/api/problem.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const problem = {
  type: 'https://revu.bhusku.com/problems/validation.failed',
  title: 'Unprocessable Entity',
  status: 422,
  code: 'validation.failed',
  detail: 'Some fields need attention.',
  instance: '/v1/students',
  requestId: 'req-123',
  errors: [{ field: 'name', code: 'required', message: 'Enter a name.' }],
}
const res = (body: string, status: number, type = 'application/problem+json') =>
  new Response(body, { status, statusText: 'x', headers: { 'Content-Type': type } })

const a = await toApiError(res(JSON.stringify(problem), 422))
ok(a instanceof ApiError && a instanceof Error, 'a problem body becomes an ApiError')
ok(a.code === 'validation.failed' && a.status === 422, 'code and status come from the body', `${a.code} ${String(a.status)}`)
ok(a.message === 'Enter a name.', 'with fields, the message says what to fix', a.message)
const plain = await toApiError(res(JSON.stringify({ ...problem, errors: undefined, code: 'paper.final', detail: 'This set is final.' }), 409))
ok(plain.message === 'This set is final.', 'without fields, the message is the detail, written for people')
ok(a.requestId === 'req-123', 'request id is kept for support')
ok(a.fields?.[0]?.field === 'name' && a.fields.length === 1, 'field errors are kept')

const b = await toApiError(res('<html>Bad gateway</html>', 502, 'text/html'))
ok(b.code === 'http.502' && b.status === 502, 'a non-JSON answer still becomes an ApiError', b.code)
ok(!b.message.includes('<html>'), 'a proxy page never reaches the person')

const c = await toApiError(res('{"error":"nope"}', 500, 'application/json'))
ok(c.code === 'http.500', 'JSON that is not a problem is treated as unknown', c.code)

const d = await toApiError(new Response(null, { status: 404 }))
ok(d.code === 'http.404' && d.status === 404, 'an empty body becomes an ApiError')

if (fail) process.exit(1)
