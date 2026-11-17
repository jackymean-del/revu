/**
 * A quick check of what a teacher types, with no service at all: spacing,
 * capitals, repeated words, end punctuation, and words often misspelt. It
 * returns the text as it would read corrected, and what was changed, so
 * the teacher can take it or keep their own. Meaning and grammar beyond
 * this need the AI check.
 */

export interface Fix {
  was: string
  now: string
  why: string
}

// Words often misspelt in school writing, to their right spelling.
const MISSPELT: Record<string, string> = {
  acheive: 'achieve', acheived: 'achieved', accomodate: 'accommodate', adress: 'address', alot: 'a lot', arguement: 'argument', basicly: 'basically', begining: 'beginning',
  beleive: 'believe', calender: 'calendar', catagory: 'category', comming: 'coming', commited: 'committed', concious: 'conscious', definately: 'definitely', definatly: 'definitely',
  dissapear: 'disappear', dissapoint: 'disappoint', embarass: 'embarrass', enviroment: 'environment', excercise: 'exercise', existance: 'existence', experiance: 'experience',
  familar: 'familiar', finaly: 'finally', foward: 'forward', freind: 'friend', goverment: 'government', grammer: 'grammar', happend: 'happened', immediatly: 'immediately',
  independant: 'independent', intrest: 'interest', knowlege: 'knowledge', libary: 'library', neccessary: 'necessary', necesary: 'necessary', noticable: 'noticeable', occured: 'occurred',
  occurence: 'occurrence', oppurtunity: 'opportunity', paralel: 'parallel', particulary: 'particularly', peice: 'piece', perfomance: 'performance', posession: 'possession',
  practise: 'practise', prefered: 'preferred', presense: 'presence', probaly: 'probably', progres: 'progress', publically: 'publicly', recieve: 'receive', recieved: 'received',
  recomend: 'recommend', refered: 'referred', relevent: 'relevant', remeber: 'remember', responsibilty: 'responsibility', seperate: 'separate', similiar: 'similar', sincerly: 'sincerely',
  succesful: 'successful', successfull: 'successful', suprise: 'surprise', teh: 'the', tommorow: 'tomorrow', tomorow: 'tomorrow', truely: 'truly', untill: 'until', usualy: 'usually',
  wich: 'which', wierd: 'weird', writting: 'writing', excelent: 'excellent', improvment: 'improvement', developement: 'development', concentrete: 'concentrate', homwork: 'homework',
}

export function checkWriting(text: string): { text: string; fixes: Fix[] } {
  const fixes: Fix[] = []
  let t = text
  const apply = (re: RegExp, to: string | ((m: string, ...g: string[]) => string), why: string) => {
    t = t.replace(re, (m: string, ...g: unknown[]) => {
      const now = typeof to === 'string' ? m.replace(re, to) : to(m, ...(g.filter((x) => typeof x === 'string') as string[]))
      if (now !== m) fixes.push({ was: m, now, why })
      return now
    })
  }
  apply(/ {2,}/g, ' ', 'Extra spaces')
  apply(/ +([,.;:!?])/g, '$1', 'Space before punctuation')
  apply(/([,;:])(?=[A-Za-z])/g, '$1 ', 'Space after punctuation')
  apply(/\b(\w+) \1\b/gi, (m, w) => (w.toLowerCase() === 'that' || w.toLowerCase() === 'had' ? m : w), 'Repeated word')
  apply(/\bi\b(?=[ '’])/g, 'I', 'Capital I')
  apply(/\b[A-Za-z]+\b/g, (w) => {
    const right = MISSPELT[w.toLowerCase()]
    if (!right || right === w.toLowerCase()) return w
    return w[0] === w[0].toUpperCase() ? right[0].toUpperCase() + right.slice(1) : right
  }, 'Spelling')
  // A capital at the start of each sentence.
  apply(/(^\s*|[.!?]\s+)([a-z])/g, (_m, before, letter) => before + letter.toUpperCase(), 'Capital at the start of a sentence')
  // A full stop at the end, when the text reads as sentences.
  if (/[a-z0-9)]$/i.test(t.trim()) && t.trim().split(/\s+/).length >= 4 && !/_{2,}$/.test(t.trim())) {
    const was = t
    t = t.trimEnd() + '.'
    fixes.push({ was: was.trimEnd().slice(-12), now: t.slice(-13), why: 'Full stop at the end' })
  }
  return { text: t, fixes }
}
