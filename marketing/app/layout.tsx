import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { SITE_URL } from '@/lib/site'

// The font lives in app/fonts (the Latin file from Google Fonts, SIL Open
// Font License), as on schedU's site: nothing is downloaded at build time.
const jakarta = localFont({
  src: './fonts/PlusJakartaSans-latin-variable.woff2',
  weight: '300 800',
  style: 'normal',
  variable: '--font-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // About 60 characters fit a search result: the category first, the brand last.
  title: { default: 'Assessment and Progress Reports, in Your Words · revU', template: '%s · revU' },
  description:
    'revU records every mark exactly, keeps absent and exempt apart from zero, and turns them into results and progress reports families understand. For schools, colleges and universities, in each one’s own words.',
  openGraph: { siteName: 'revU', type: 'website', locale: 'en_IN' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  )
}
