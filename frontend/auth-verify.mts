/**
 * The sign-in and sign-up pages' own rules (Clerk does the rest).
 * Run: npx tsx auth-verify.mts
 *
 * Clerk's error wording reaches the person, its long form first; an error
 * with no words gets ours. The email check stops only what is plainly not
 * an address, and leaves the real check to Clerk.
 */
import { authErrorMessage, looksLikeEmail } from './src/pages/auth/style.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const clerk = { errors: [{ message: 'Password is incorrect.', longMessage: 'Password is incorrect. Try again, or use another method.' }] }
ok(authErrorMessage(clerk) === 'Password is incorrect. Try again, or use another method.', "Clerk's long message is shown first")
ok(authErrorMessage({ errors: [{ message: 'Too many requests.' }] }) === 'Too many requests.', 'then its short message')
ok(authErrorMessage(new Error('Network down')) === 'Network down', 'then a plain error')
ok(authErrorMessage({}, 'Try again.') === 'Try again.' && authErrorMessage(null) === 'Something went wrong. Please try again.', 'with nothing to say, ours')

ok(['asha@hillview.edu.in', ' a.b+c@x.org ', 'ravi@school.co'].every(looksLikeEmail), 'addresses pass, spaces at the ends are fine')
ok(!['', 'asha', 'asha@', '@hillview.in', 'asha@hillview', 'a b@x.org'].some(looksLikeEmail), 'what is plainly not an address does not')

if (fail) {
  console.log(`\n${fail} failed`)
  process.exit(1)
}
console.log('\nall sign-in rules hold')
