/** Where things are. The app has its own subdomain; this site owns revu.bhusku.com. */
export const SITE_URL = 'https://revu.bhusku.com'
export const APP_URL = 'https://app.revu.bhusku.com'
export const CONTACT = 'hello@bhusku.com'

export const appHref = (path = '/sign-in') => `${APP_URL}${path}`

export const demoHref = `mailto:${CONTACT}?subject=${encodeURIComponent('revU demo')}`
