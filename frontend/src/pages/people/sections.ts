import { useQuery } from '@tanstack/react-query'
import { listStructure, type Level, type Section, type Year } from '../../api/client'
import { useYearChoice } from '../../lib/year'

/**
 * Section names a person reads: the level, then the section. Also the
 * academic year chosen at the top of the app (the latest when none is),
 * which every page shows.
 */
export function useSectionNames(orgId: string) {
  const years = useQuery({ queryKey: ['structure', orgId, 'years', {}], queryFn: ({ signal }) => listStructure<Year>(orgId, 'years', {}, signal), enabled: !!orgId }).data ?? []
  const levels = useQuery({ queryKey: ['structure', orgId, 'levels', {}], queryFn: ({ signal }) => listStructure<Level>(orgId, 'levels', {}, signal), enabled: !!orgId }).data ?? []
  const sections = useQuery({ queryKey: ['structure', orgId, 'sections', {}], queryFn: ({ signal }) => listStructure<Section>(orgId, 'sections', {}, signal), enabled: !!orgId }).data ?? []
  const level = (id: string) => levels.find((l) => l.id === id)?.name ?? ''
  const year = (id: string) => years.find((y) => y.id === id)?.label ?? ''
  const name = (s: Section) => `${level(s.levelId)} ${s.name}`.trim()
  const choice = useYearChoice(orgId)
  const latest = [...years].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]?.id ?? ''
  const chosenYear = years.some((y) => y.id === choice) ? choice : latest
  return { years, chosenYear, levels: [...levels].sort((a, b) => a.seq - b.seq), sections, name, year, byId: (id: string) => sections.find((s) => s.id === id) }
}

