/** The kinds offered when none is typed; any name may be used (as internal/papers QuestionTypes). */
export const QUESTION_TYPES = ['Multiple choice', 'Fill in the blanks', 'True or false', 'Very short answer', 'Short answer', 'Long answer', 'Case based', 'Map or diagram']

/** Choice questions carry options. */
export const hasOptions = (qtype: string) => /choice|true or false/i.test(qtype)
