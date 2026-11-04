import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'
import { PAGES } from '@/content/pages'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `${SITE_URL}${p === '/' ? '' : p}`, changeFrequency: 'monthly', priority: p === '/' ? 1 : 0.7 }))
}
