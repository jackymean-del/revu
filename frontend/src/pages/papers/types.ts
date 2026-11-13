/** The kinds offered when none is typed; any name may be used (as internal/papers QuestionTypes). */
export const QUESTION_TYPES = ['Multiple choice', 'Fill in the blanks', 'True or false', 'Match the following', 'Very short answer', 'Short answer', 'Long answer', 'Case based', 'Assertion and reason', 'Map or diagram', 'Numerical', 'Essay']

/** Choice questions carry options. */
export const hasOptions = (qtype: string) => /choice|true or false/i.test(qtype)

/**
 * A paper's own sections (Section A, Section B) are not the institution's
 * word for a class group, which comes from t('group.section'); these name
 * the paper's.
 */
export const PAPER = { section: 'section', sections: 'sections', Section: 'Section' }
