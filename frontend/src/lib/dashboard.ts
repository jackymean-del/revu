/**
 * What each dashboard tile is called and where its one action leads. The
 * server sends keys and numbers; the words come from the organisation's
 * terminology, so a university sees its own names on the same tiles.
 */
import type { T } from './terminology/terminology'

/** The tile's name for this number. */
export function tileLabel(t: T, key: string, count: number): string {
  const students = t('person.student', { count })
  switch (key) {
    case 'my_classes':
      return count === 1 ? 'Teaching assignment' : 'Teaching assignments'
    case 'my_students':
      return `Your ${t('person.student', { count, lower: true })}`
    case 'my_class_no_contact':
      return `${students} in your ${t('group.section', { lower: true })} with no ${t('person.guardian', { lower: true })}`
    case 'missing_setup':
      return count === 0 ? 'Setup is complete' : count === 1 ? 'Setup step missing' : 'Setup steps missing'
    case 'unplaced_students':
      return `${students} not in a ${t('group.section', { lower: true })}`
    case 'no_contact':
      return `${students} with no ${t('person.guardian', { lower: true })}`
    case 'no_class_teacher':
      return `${t('group.section', { count })} with no ${t('person.class_teacher', { lower: true })}`
    case 'open_invitations':
      return count === 1 ? 'Invitation waiting' : 'Invitations waiting'
    case 'staff_without_sign_in':
      return 'Staff not yet signed in'
    case 'total_students':
      return students
    case 'total_sections':
      return t('group.section', { count })
    default:
      return key
  }
}

/** How a row of the missing setup list reads: the server names the piece by key. */
export function setupPiece(t: T, key: string): string {
  switch (key) {
    case 'years':
      return t('period.year', { count: 2 })
    case 'periods':
      return t('period.term', { count: 2 })
    case 'levels':
      return t('group.level', { count: 2 })
    case 'sections':
      return t('group.section', { count: 2 })
    case 'subjects':
      return t('course.subject', { count: 2 })
    case 'level_subjects':
      return `${t('course.subject', { count: 2 })} for each ${t('group.level', { lower: true })}`
    default:
      return key
  }
}

/** The one thing to do about a tile, for those who may do it. */
export const tileAction: Record<string, { to: string; label: string } | undefined> = {
  missing_setup: { to: '/setup', label: 'Continue setup' },
  unplaced_students: { to: '/people', label: 'Open People' },
  no_contact: { to: '/people', label: 'Open People' },
  no_class_teacher: { to: '/settings/structure', label: 'Assign in Structure' },
  open_invitations: { to: '/people', label: 'Open People' },
  staff_without_sign_in: { to: '/people', label: 'Open People' },
}
