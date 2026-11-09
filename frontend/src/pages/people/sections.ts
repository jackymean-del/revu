import { useQuery } from '@tanstack/react-query'
import { listStructure, type Level, type Section, type Year } from '../../api/client'

/** Section names a person reads: the level, then the section. */
export function useSectionNames(orgId: string) {
  const years = useQuery({ queryKey: ['structure', orgId, 'years', {}], queryFn: ({ signal }) => listStructure<Year>(orgId, 'years', {}, signal), enabled: !!orgId }).data ?? []
  const levels = useQuery({ queryKey: ['structure', orgId, 'levels', {}], queryFn: ({ signal }) => listStructure<Level>(orgId, 'levels', {}, signal), enabled: !!orgId }).data ?? []
  const sections = useQuery({ queryKey: ['structure', orgId, 'sections', {}], queryFn: ({ signal }) => listStructure<Section>(orgId, 'sections', {}, signal), enabled: !!orgId }).data ?? []
  const level = (id: string) => levels.find((l) => l.id === id)?.name ?? ''
  const year = (id: string) => years.find((y) => y.id === id)?.label ?? ''
  const name = (s: Section) => `${level(s.levelId)} ${s.name}`.trim()
  return { years, levels: [...levels].sort((a, b) => a.seq - b.seq), sections, name, year, byId: (id: string) => sections.find((s) => s.id === id) }
}

