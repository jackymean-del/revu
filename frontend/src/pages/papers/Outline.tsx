import type { Paper, PaperItem, PaperSection } from '../../api/client'
import { bitsAlike } from '../../lib/papers'

/** A place in a paper: a section or sub-section, or a question in it. */
export interface Place {
  sectionId: string
  itemId?: string
}

const row = 'flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-mist'
const fact = 'shrink-0 text-xs tabular-nums text-muted'
const letter = (i: number) => String.fromCharCode(97 + i)

/**
 * The whole paper as a tree: sections, their sub-sections, the questions in
 * each, and a question's bits, with the marks at every level. Choosing a
 * line goes to that place among the cards, opened; a question opens ready
 * to change while the paper is a draft.
 */
export function Outline({ paper, draft, onGo }: { paper: Paper; draft: boolean; onGo: (to: Place) => void }) {
  const questions = (s: PaperSection) => paper.items.filter((i) => i.sectionId === s.id)
  const Question = ({ it }: { it: PaperItem }) => (
    <li>
      <button type="button" className={row} onClick={() => onGo({ sectionId: it.sectionId, itemId: it.id })} title={draft && it.question ? 'Go to this question and change it' : 'Go to this question'}>
        <span className="w-8 shrink-0 text-sm font-bold tabular-nums">Q{it.seq}</span>
        <span className={`min-w-0 flex-1 truncate text-sm ${it.question ? '' : 'font-semibold text-amber-700'}`}>{it.question?.text ?? 'Still to choose'}</span>
        <span className={fact}>
          {it.question?.qtype ?? it.section} · {bitsAlike(it.question?.bits ?? []) && `${it.question?.bits?.length} × ${it.question?.bits?.[0].marks} = `}
          {it.marks}
        </span>
      </button>
      {(it.question?.bits ?? []).length > 0 && (
        <ul className="ml-8 border-l border-line pl-2">
          {(it.question?.bits ?? []).map((b, i) => (
            <li key={i}>
              <button type="button" className={row} onClick={() => onGo({ sectionId: it.sectionId, itemId: it.id })}>
                <span className="w-6 shrink-0 text-sm text-muted">({letter(i)})</span>
                <span className="min-w-0 flex-1 truncate text-sm">{b.text}</span>
                {!bitsAlike(it.question?.bits ?? []) && <span className={fact}>{b.marks}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
  const Branch = ({ s }: { s: PaperSection }) => {
    const subs = paper.sections.filter((x) => x.parentId === s.id)
    return (
      <li>
        <button type="button" className={row} onClick={() => onGo({ sectionId: s.id })}>
          <span className={`min-w-0 flex-1 truncate ${s.parentId ? 'text-sm font-semibold' : 'font-bold'}`}>{s.title}</span>
          {!s.parentId && s.kind === 'extra' && <span className="shrink-0 rounded-full bg-amber-50 px-2 text-xs font-semibold text-amber-800">Extra</span>}
          {!s.print && <span className="shrink-0 rounded-full bg-canvas px-2 text-xs font-semibold text-muted">Not printed</span>}
          <span className={fact}>
            {s.questions} {s.questions === 1 ? 'question' : 'questions'} · {s.marks} marks
          </span>
        </button>
        <ul className="ml-3 border-l border-line pl-2">
          {questions(s).map((it) => (
            <Question key={it.id} it={it} />
          ))}
          {subs.map((x) => (
            <Branch key={x.id} s={x} />
          ))}
          {s.questions === 0 && subs.length === 0 && <li className="px-2 py-1 text-sm text-muted">No questions here yet.</li>}
        </ul>
      </li>
    )
  }
  return (
    <nav aria-label="Outline of the paper" className="rounded-2xl border border-line bg-white p-2">
      <div className="flex items-baseline gap-2 px-2 py-1">
        <span className="flex-1 font-extrabold">{paper.set}</span>
        <span className={fact}>
          {paper.items.length} {paper.items.length === 1 ? 'question' : 'questions'} · {paper.total} marks
        </span>
      </div>
      <ul>
        {paper.sections
          .filter((s) => !s.parentId)
          .map((s) => (
            <Branch key={s.id} s={s} />
          ))}
      </ul>
    </nav>
  )
}
