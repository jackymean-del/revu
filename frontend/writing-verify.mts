// The quick writing check corrects what it should and leaves the rest.
import { checkWriting } from './src/lib/writing.ts'

const cases: [string, string][] = [
  ['ravi has  definately made progres in fractions , and he will recieve  help', 'Ravi has definitely made progress in fractions, and he will receive help.'],
  ['Which is larger , 1/2 or 1/3?', 'Which is larger, 1/2 or 1/3?'],
  ['Fill in the blank: To add fractions, you ______', 'Fill in the blank: To add fractions, you ______'],
  ['i think the the answer is correct', 'I think the answer is correct.'],
  ['He said that that was fine.', 'He said that that was fine.'],
]
let bad = 0
for (const [input, want] of cases) {
  const got = checkWriting(input).text
  if (got !== want) {
    bad++
    console.error(`checkWriting(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
  }
}
if (bad) process.exit(1)
console.log('writing check holds')
