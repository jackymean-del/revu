import { expect, test } from '@playwright/test'
import presets from '../../frontend/src/lib/terminology/presets.json' with { type: 'json' }

/** Every word any preset uses (School, Learner, Batch, Semester, ...). */
const WORDS = [...new Set(Object.values(presets.presets).flatMap((p) => Object.values(p).flatMap((f) => [f.one, f.other])))]
const presetWords = (text: string) => WORDS.filter((w) => new RegExp(String.raw`(?<!\p{L})${w}(?!\p{L})`, 'iu').test(text))

// The journeys run without Clerk, so the pages show their not-set-up notice;
// what is checked is the page itself: its own frame, labelled fields and the
// way between sign-in and sign-up. Clerk's calls are proven by schedU's same
// flows and by signing in on revu.bhusku.com.
test.beforeEach(async ({ page }) => {
  await page.route('**/v1/me', (r) => r.fulfill({ json: { userId: 'user_1', orgs: [] } }))
  await page.route('**/v1/terminology', (r) => r.fulfill({ json: { preset: 'school', overrides: [] } }))
})

test('sign-in is its own page, with labelled fields and a way to sign up', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Welcome back', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
  for (const name of ['Work email', 'Password']) await expect(page.getByLabel(name, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  await expect(page.getByText(/Sign-in is not set up on this copy/)).toBeVisible()
  await page.getByRole('link', { name: 'Create one' }).click()
  await expect(page).toHaveURL(/\/sign-up$/)
})

test('sign-up says to use the invited address, and links back', async ({ page }) => {
  await page.goto('/sign-up')
  await expect(page.getByRole('heading', { name: 'Create your account', level: 1 })).toBeVisible()
  await expect(page.getByText(/Invited by your institution\? Use the email address the invitation went to/)).toBeVisible()
  for (const name of ['First name', 'Last name', 'Work email', 'Password']) await expect(page.getByLabel(name, { exact: true })).toBeVisible()
  await expect(page.locator('#clerk-captcha')).toHaveCount(1)
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByRole('link', { name: 'revU home' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

test('on a phone the sign-up form stands alone, with no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/sign-up')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await expect(page.getByText('Marks that never guess')).toBeHidden()
  await expect(page.getByLabel('Work email', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

// Nobody is signed in on these pages, so no institution's words are known:
// they use neutral words that fit every institution, never a preset's.
test('sign-in and sign-up use no institution word of any preset', async ({ page }) => {
  for (const path of ['/sign-in', '/sign-up']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const text = await page.locator('body').innerText()
    const found = presetWords(text)
    expect(found, `${path} shows ${found.join(', ')}`).toEqual([])
  }
  // The check must catch what it is for.
  expect(presetWords('Invited by your school? Every learner, each batch.')).toEqual(expect.arrayContaining(['School', 'Learner', 'Batch']))
})
