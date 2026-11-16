import { expect, test } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-00000000000f'

// A family signs in on a page of its own: the temporary password from its
// message, then a password it chooses, with none of the staff menus.
test('a family signs in with its temporary password and must choose its own', async ({ page }) => {
  const sent: { path: string; body: unknown; auth: string | null }[] = []
  const session = { mustChange: true, student: 'Asha Rao', placement: 'Grade 6 A', school: 'Hill View School' }
  await page.route('**/v1/family/sign-in', (r) => {
    const body = r.request().postDataJSON()
    sent.push({ path: 'sign-in', body, auth: null })
    if (body.password !== 'tempPass99')
      return r.fulfill({ status: 401, json: { detail: 'That user name and password do not match. Check them and try again.' } })
    return r.fulfill({ json: { ...session, token: 'a'.repeat(64) } })
  })
  await page.route('**/v1/family/password', (r) => {
    sent.push({ path: 'password', body: r.request().postDataJSON(), auth: r.request().headers()['authorization'] ?? null })
    session.mustChange = false
    return r.fulfill({ json: session })
  })
  await page.route('**/v1/family/me', (r) => r.fulfill({ json: session }))

  await page.goto(`/family?org=${ORG}`)
  await expect(page.getByRole('heading', { name: 'Family sign-in' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
  await page.getByLabel('User name').fill('HV-0007')
  await page.getByLabel('Password').fill('a wrong one')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('do not match')
  await page.getByLabel('Password').fill('tempPass99')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible()
  await page.getByLabel('New password').fill('our own words 9')
  await page.getByLabel('The same again').fill('something else 9')
  await page.getByRole('button', { name: 'Save my password' }).click()
  await expect(page.getByRole('alert')).toHaveText('The two passwords are not the same.')
  await page.getByLabel('The same again').fill('our own words 9')
  await page.getByRole('button', { name: 'Save my password' }).click()

  await expect(page.getByRole('heading', { name: 'Asha Rao' })).toBeVisible()
  await expect(page.getByText('Grade 6 A')).toBeVisible()
  expect(sent.at(-1)).toEqual({ path: 'password', body: { password: 'our own words 9' }, auth: `Bearer ${'a'.repeat(64)}` })
  expect(sent[0].body).toEqual({ orgId: ORG, username: 'HV-0007', password: 'a wrong one' })
})

test('without the link from its message, a family is told to open it', async ({ page }) => {
  await page.goto('/family')
  await expect(page.getByText('Open the link in the message you were sent')).toBeVisible()
})
