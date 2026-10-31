# revU Progress

A bhusku product. Whole-learner progress reports for schools, colleges and universities, built on one rule: **marks are saved per question, and every total is calculated from section tags.**

## Run

```bash
npm run dev
```

Open http://localhost:8090 and choose **Students** (or go straight to http://localhost:8090/students/). Use **View as** in the top bar to switch between the coordinator, class teachers, a subject teacher, a student and a parent. Demo data is seeded on first load. *Settings → Reset to demo data* restores it.

## Words we use

| Area | What it is |
|---|---|
| **Home** | What's left, class by class, with a button to finish each step |
| **Outcomes** | Skill areas and the outcomes under them, per grade and subject (CSV import) |
| **Papers** | Question papers built from **core** sections (count in the subject total) and **extra** sections (Oral, Activity, Enrichment, Notebook - each tied to a **report field**) |
| **Marks** | Per-question entry: table, student by student, or Excel template + upload |
| **Exam analysis** | After every exam: class average, grade spread, each question's difficulty and most common mistake, outcome mastery with who needs support, mistake totals with tips, each student's change since the previous exam. Excel download |
| **Growth** | Teacher ratings on one ladder - **Emerging · Developing · Secure** (+ **Excelling** for older learners) - plus quick notes |
| **Voices** | Self check-in, peer feedback and parent voice |
| **Reports** | One A4 sheet per student (front and back): at-a-glance grade, strengths and next steps; subjects with term totals and every skill as a level chip; Growth 360°; voices; teacher's note. Optional outcome-detail appendix. Drafted from the data, published and printed in bulk. Its title is a setting (e.g. "Holistic Progress Card" for NEP schools) |

| **How it works** | Live trace of one student: question marks -> outcome levels -> skill areas -> term total and grade -> growth 360 -> each insight sentence with its rule and data -> downloads (report PDF, class PDF, class results Excel, marks templates, backup) |

**Creating papers fast** - *Quick scheme*: type only the marking scheme (`# Section [field]`, then `1a 2 EN7.1.1` per question). Question text is optional, so papers made in Word need nothing else. "Start from outcomes" pre-fills one line per outcome.

**Mistake tags** - while marking, one tap on a question where marks were lost records why (Spelling, Grammar, Calculation, Units, Diagram...; the list depends on the subject). Recurring mistakes become learning insights with a practice tip.

**Exams & results** (Settings) - edit the exam calendar, then link exams into results. A part is an exam's core sections, the extra-section fields, or another result, each scaled to its own "out of" (e.g. PT1 40 -> 10; Half-Yearly -> 30 of the Annual). Loops and double counting are blocked. One result per term is printed on that term's report.

**Insight engine** (`Store.insights`): transparent rules, no black box. Outcome % from every mapped question in the term -> level (3 steps: <40, 40-74, 75+; 4 steps: <35, 35-59, 60-79, 80+). Skill area = average of its outcomes. Term total = configured parts, each scaled from its own marks; pending parts never count as zero; an absent part shows AB and is left out of the grade unless the school counts absences as zero. Strengths = top 3 of all skill and growth items on one 0-100 scale; next steps = lowest under 75. The teacher's note is drafted sentence by sentence, each with its rule, and always approved by the teacher. Learning insights: a mistake type recurring in 2+ questions; an outcome under 60% and 10+ points below the class (or 85%+ and 10+ above); a subject moving 10+ points between linked exams; long answers 15+ points below short ones.

Stages: Early Years · Primary · Middle School · High School · College & University.

## How the MPS spec maps to the app

| Spec item | Where |
|---|---|
| All competencies & LOs, incl. Extra Skills (Gr 1-5), Subject Enrichment & Notebook (Gr 6-8) | Outcomes |
| AI / question bank / own questions, mapped to LOs | Papers → *Type a question*, *From bank*, *Suggest questions* |
| Extra Skills / Enrichment / Notebook as additional sections | **Extra** section + **report field**, presets by grade |
| Hindi, Odia, Sanskrit | Type or paste directly; Noto fonts loaded |
| Merge Physics + Chemistry + Biology into Science | Papers → *Merge papers* (or *Reports as*) |
| Additional marks not added to subject total | Paper header shows `English 80 + ASL 3 + Notebook 2`; paper total is reference only |
| Image size, equations, answer space, no margins | Image S/M/L, x²/x₂/√/÷ toolbar, answer-space toggle, print preview |
| Section-wise, tabular and Excel entry | Marks → *Student-wise*, *Table*, *Excel template* / *Upload Excel* |
| Locked subtotals, max-marks row, hidden paper ID, AB, per-row rejection | Excel template (ExcelJS) and upload summary |
| Warning when an additional section has no HPC component | Paper header + Papers checks column |
| Component conversion (e.g. Notebook /2 shown /5) | Settings → Report fields |

## Files

- `js/frameworks.js` - stages, growth ladder, domains, report fields, outcomes and question bank (seed config)
- `js/store.js` - persistence (localStorage), seed data and all calculations
- `js/views-*.js` - screens; `js/main.js` - shell, personas and routing
- `css/hpc.css` - bhusku family tokens (same as schedU): ink #13111E, lavender #685DBC, gold #D4920E (knob only), Plus Jakarta Sans

Data lives in the browser for now. Export a backup from Settings before clearing browser data.
