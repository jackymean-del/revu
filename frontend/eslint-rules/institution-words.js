/**
 * Fails on an institution word written literally in what a component shows
 * (AT-v1-04). Every word any preset uses (Student, Learner, Section, Batch,
 * Term, Semester, ...) is guarded, taken from the same presets.json the app
 * and server resolve from, so a new preset word is guarded with no change
 * here. Show such words with t(key) instead.
 *
 * Checked: JSX text, strings and template text inside JSX expressions, and
 * attributes people read (title, placeholder, aria-label, label, and display
 * props such as empty or noun). Not checked: arguments to calls
 * (t('person.student')), comparisons ({tab === 'years'}), and attributes that
 * are code rather than copy (path, key, className, value, ...).
 */
import presets from '../src/lib/terminology/presets.json' with { type: 'json' }

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every preset word, longest first so "Report card" wins over "Report". */
const VOCABULARY = (() => {
  const byWord = new Map()
  for (const words of Object.values(presets.presets)) {
    for (const [key, forms] of Object.entries(words)) {
      for (const w of [forms.one, forms.other]) if (!byWord.has(w.toLowerCase())) byWord.set(w.toLowerCase(), { word: w, key })
    }
  }
  return [...byWord.values()]
    .sort((a, b) => b.word.length - a.word.length)
    .map((v) => ({ ...v, re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(v.word)}(?![\\p{L}\\p{N}])`, 'iu') }))
})()

/** Attributes whose text is shown or read aloud. */
const SHOWN_ATTRIBUTES = new Set([
  'title', 'alt', 'placeholder', 'label', 'aria-label', 'aria-description', 'aria-placeholder', 'aria-valuetext',
  'empty', 'noun', 'caption', 'heading', 'message', 'description', 'text', 'hint', 'summary',
])
const shownAttribute = (attr) => attr.name.type === 'JSXIdentifier' && SHOWN_ATTRIBUTES.has(attr.name.name)

/** A key such as group.section names a word; it is not one. */
const KEYS = new Set(Object.keys(presets.keys))

/** True when node is shown to people through JSX, not an argument to a call. */
function shownInJsx(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'CallExpression' || p.type === 'NewExpression') return false
    if (p.type === 'BinaryExpression' || p.type === 'SwitchCase' || p.type === 'MemberExpression') return false
    if (p.type === 'JSXAttribute') return shownAttribute(p)
    if (p.type === 'JSXExpressionContainer') {
      const attr = p.parent?.type === 'JSXAttribute' ? p.parent : null
      return !attr || shownAttribute(attr)
    }
    if (p.type === 'Program' || p.type.endsWith('FunctionExpression') || p.type === 'FunctionDeclaration') return false
  }
  return false
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Institution words come from t(), never from literals.' },
    messages: {
      literal: '"{{word}}" is an institution word. Show it with t(\'{{key}}\') so every institution sees its own word.',
    },
    schema: [{ type: 'object', properties: { allow: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
  },
  create(context) {
    const allow = new Set((context.options[0]?.allow ?? []).map((w) => w.toLowerCase()))
    const check = (node, text) => {
      if (!text || !/\p{L}/u.test(text)) return
      for (const v of VOCABULARY) {
        if (!allow.has(v.word.toLowerCase()) && v.re.test(text)) {
          context.report({ node, messageId: 'literal', data: { word: v.word, key: v.key } })
          return
        }
      }
    }
    return {
      JSXText: (node) => check(node, node.value),
      Literal: (node) => {
        if (typeof node.value === 'string' && !KEYS.has(node.value) && shownInJsx(node)) check(node, node.value)
      },
      TemplateElement: (node) => {
        if (shownInJsx(node)) check(node, node.value.cooked)
      },
    }
  },
}
