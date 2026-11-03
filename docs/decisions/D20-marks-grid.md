# D20. Marks-entry grid: a thin custom grid on TanStack Table and Virtual

Status: decided 2 November 2026, from the spike in blueprint Part 59.8.
To be entered in the decisions register (Part 65) as D20, before P0.3 starts (AT-GR-06).

## Decision

The editable marks-entry grid is a thin custom grid owned by revU, built on
TanStack Table (column model: order, pinning, visibility) and TanStack
Virtual (rows), behind the DataGrid wrapper in
`frontend/src/components/DataGrid/`. react-data-grid and AG Grid Community
are not used. Read-only grids use the same TanStack pair, as Part 59.1
already says.

## What was compared

The same screen was built three times: 40 students by 6 columns with marks
out of 10, 10, 5, 20, 15 and 40, the codes AB, EX and NA, and the shortcut
keys of Part 7.4. One data set, one cell parser and one paste preview were
shared, and one Playwright script drove every candidate the same way:
keyboard only, keys 40 ms apart (a very fast typist), on a laptop profile
and on a phone profile (390 by 844, CPU slowed 4 times as a stand-in for a
mid-range phone). Versions: react-data-grid 7.0.0-beta.63, ag-grid-community
and ag-grid-react 36.2.0, @tanstack/react-table 9.3.1, @tanstack/react-virtual
3.14.25, React 19.3, Vite 8.3.

Latency is the browser's own Event Timing measure (keydown to the next
painted frame, the basis of Interaction to Next Paint), slowest keystroke of
the run. Entries under 16 ms are not reported by the browser.

| Must pass (59.8) | Custom (TanStack) | react-data-grid | AG Grid Community |
|---|---|---|---|
| Keyboard-only entry of 40 by 6, all 240 cells exact | Yes | Yes, after 4 workarounds | Yes, natively |
| Per-cell validation, AB, EX, NA, Escape reverts | Yes | Yes | Yes |
| Upload preview and apply through the wrapper | Yes (library-free) | Yes (library-free) | Yes (library-free) |
| Native paste of a column (optional) | Yes, with preview | Yes, with preview | No: clipboard is Enterprise-only, and the grid swallowed the paste event |
| Screen-reader cell names and visible focus | Yes, axe clean | Yes, axe clean | Yes, axe clean |
| Slowest keystroke, laptop | 24 ms | 24 ms | 24 ms |
| Slowest keystroke, phone profile, 240 cells | 88 ms | 88 ms | **168 ms** |
| Slowest keystroke, phone profile, 60 by 20 | 72 ms | 80 ms | **112 ms** |
| Added JavaScript for the route (gzip) | **22.5 KB** | 24.4 KB + 2.2 KB CSS | **227.5 KB** |
| Styling through Tailwind tokens only | Yes, all Tailwind | Partly: CSS variables, and its own theme class overrides some | No: its own theme API |
| Licence and maintenance | MIT, active | MIT, but still a 7.0 beta | MIT, active |

## Why

- AG Grid Community fails two must-haves: it adds 227.5 KB, more than the
  whole 200 KB route budget on its own, and its slowest keystroke on the
  phone profile is above 100 ms. It also has no clipboard without
  Enterprise.
- react-data-grid passes every must-have, but only after four workarounds:
  Enter on a selected cell opens the editor instead of moving down; the
  first typed digit was dropped when the editor opened; keys typed before
  the editor mounts reopened it; and a commit followed by an immediate
  move lost the next key. Each workaround leans on its internal editing
  model, it is still a beta release, and its theme needs specificity
  overrides to take the brand tokens.
- The custom grid passes every must-have with the smallest bundle and
  styles entirely with Tailwind tokens. Its keyboard model is Part 7.4
  written directly, so register-style entry (type, Enter, next student)
  needs no workarounds. Under the decision rule of 59.8 (every must-have,
  smallest route bundle, least custom code) it wins: the code it needs is
  about the same size as react-data-grid plus its workarounds.

## Robustness note

At machine speed (no delay between keys) the custom grid and AG Grid kept
every keystroke once keys typed before the editor appears were buffered.
react-data-grid lost keys at that speed even with the workarounds. Barcode
readers and very fast typists are the cases this protects.

## Kept from the spike

- `frontend/src/components/DataGrid/cells.ts`: the cell rules. Marks are
  exact decimal strings; a blank is pending and never zero; AB, EX and NA
  are the absent, exempt and not-applicable states (D16, Part 74).
- `frontend/src/components/DataGrid/bulk.ts`: upload and paste planning.
  Rows match by admission number, so order never matters; unknown admission
  numbers, missing students, repeated rows, unknown columns, invalid values
  and cells the person may not edit are listed before anything applies; a
  blank changes nothing.
- `frontend/datagrid-verify.mts` proves both (AT-GR-01, 02, 03 and 07).

Part 59.7 says "AB and NA map to absent and exempt". This record follows
D16 and Part 74 instead: AB is absent, EX is exempt, NA is not applicable.

## The wrapper for P0.3

Screens use one component, `MarksGrid`, and never a grid library:

- Props: students (id, admission number, name, roll), entry columns (id,
  label, maximum as a decimal string), current cells, `onCommit(student,
  column, cell)`, `canEdit(student, column)`, and a layout profile (order,
  pinned and hidden columns, Part 73).
- Keys (Part 7.4): arrows, Enter and Tab move; typing a number starts an
  edit and commits on move; A, E, N and P set absent, exempt, not
  applicable and pending; Escape reverts; Delete clears to pending.
- Each cell is a gridcell named "student, column, out of maximum" with its
  value or state; the grid announces its row and column counts.
- Save state per cell (dirty, saving, saved, failed) and version checks
  come from the evidence service, not the grid (59.3).
- On phones, a one-column mode shows one student at a time on a numeric
  keypad (59.7).

## Risks to watch

- The custom grid owns its own accessibility and keyboard code; the
  Playwright journey for P0.3 must keep the axe scan and the keystroke
  checks from this spike.
- The phone profile is a slowed laptop, not a phone. The pilot should
  confirm the 100 ms target on a real mid-range device.
- Column virtualisation was not needed at 20 columns. Add it only if a
  scheme needs many more.

## Built in P0.3

`MarksGrid` and `OneAtATime` in `frontend/src/components/DataGrid/` follow
this record, on @tanstack/react-table 9.3.1 and @tanstack/react-virtual
3.14.21. Keys are handled once on the grid against a cursor and an edit
buffer held in refs, so keys typed before the next draw reach the cell the
person is on; the P0.3 journey caught digits landing on the previous cell
when they were handled by the focused element. The offline store (Dexie)
loads with the first edit, so the Marks route stays at 163 KB gzip with
the entry. Paste is not in P0.3 (optional, Part 59.7).
