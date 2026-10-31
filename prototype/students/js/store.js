// revU HPC - Store: persistence, seed data and every derived calculation.
// Marks are saved per question / sub-question; all totals are calculated from section tags.
(function () {
    "use strict";
    const FW = window.HPC_FW;
    const KEY = "revu_hpc_v1";

    // ---------------------------------------------------------------------
    // Utilities
    // ---------------------------------------------------------------------
    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    let idCounter = Date.now() % 100000;
    const uid = (p) => `${p}-${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const round1 = (v) => Math.round(v * 10) / 10;

    // ---------------------------------------------------------------------
    // Seed
    // ---------------------------------------------------------------------
    const FIRST = ["Aarav", "Ishita", "Soumya", "Ananya", "Arpit", "Sneha", "Rudra", "Diya", "Aditya", "Riya", "Shreyansh", "Ankita", "Krish", "Tanvi", "Om", "Pihu", "Ayush", "Sanvi", "Harsh", "Manya", "Vihaan", "Aditi", "Reyansh", "Saanvi", "Kabir", "Avni", "Ritesh", "Swati", "Yash", "Prachi"];
    const LAST = ["Mohanty", "Patnaik", "Sahoo", "Behera", "Mishra", "Swain", "Pradhan", "Rout", "Nayak", "Das", "Jena", "Sethi", "Parida", "Mohapatra", "Sahu", "Biswal", "Senapati", "Dash", "Panigrahi", "Tripathy"];
    const AVATAR_COLORS = ["#685DBC", "#0e8a7a", "#b45309", "#7c3aed", "#0e7490", "#be185d", "#4d7c0f", "#9a3412"];

    function makeQuestion(r, lo, marks, opts) {
        const bank = FW.QUESTION_BANK.find((b) => b.lo === lo.id && (!opts || opts.allowAny || b.marks <= marks));
        const q = {
            id: uid("q"), label: "", text: bank ? bank.text : `${lo.text}.`, marks, qtype: bank ? bank.qtype : (marks >= 4 ? "long" : "short"),
            options: bank && bank.options ? bank.options.slice() : [], image: null, loIds: [lo.id], source: bank ? "bank" : "own", parts: []
        };
        if (q.qtype === "mcq" && q.options.length === 0) q.options = ["", "", "", ""];
        return q;
    }

    // Build a paper programmatically from the library for seeding
    function buildSeedPaper(r, cls, exam, subject, comps, mainTarget, opts) {
        const lib = (state.library[cls.grade] || {})[opts && opts.libSubject || subject] || [];
        const regular = lib.filter((c) => c.kind === "regular" && (!opts || !opts.only || opts.only.includes(c.code)));
        const sections = [];
        let qNo = 1;
        const perSection = Math.max(2, Math.floor(mainTarget / Math.max(1, regular.length)));
        let remaining = mainTarget;
        regular.forEach((c, ci) => {
            const secMarks = ci === regular.length - 1 ? remaining : perSection;
            remaining -= secMarks;
            const sec = { id: uid("sec"), name: c.title.replace(/\s*\(.*\)$/, ""), type: "main", component: null, questions: [] };
            if (c.los.length >= 2 && secMarks >= 4) {
                // one question with sub-parts per LO
                const q = { id: uid("q"), label: String(qNo++), text: `Answer the following on ${c.title.replace(/\s*\(.*\)$/, "").toLowerCase()}.`, marks: 0, qtype: "short", options: [], image: null, loIds: [], source: "own", parts: [] };
                const each = Math.floor(secMarks / c.los.length);
                c.los.forEach((lo, li) => {
                    const pm = li === c.los.length - 1 ? secMarks - each * (c.los.length - 1) : each;
                    const bank = FW.QUESTION_BANK.find((b) => b.lo === lo.id);
                    q.parts.push({ id: uid("p"), label: String.fromCharCode(97 + li), text: bank ? bank.text : `${lo.text}.`, marks: pm, loIds: [lo.id] });
                });
                q.marks = q.parts.reduce((s, p) => s + p.marks, 0);
                sec.questions.push(q);
            } else {
                const q = makeQuestion(r, c.los[0], secMarks, { allowAny: true });
                q.label = String(qNo++);
                sec.questions.push(q);
            }
            sections.push(sec);
        });
        (comps || []).forEach((cm) => {
            const comp = lib.find((c) => c.kind === cm.key);
            const sec = { id: uid("sec"), name: FW.componentLabel(cm.key, subject), type: "additional", component: cm.key, questions: [] };
            const lo = comp ? comp.los[0] : null;
            const q = { id: uid("q"), label: String(qNo++), text: lo ? `${lo.text}.` : "Assessed through activity.", marks: cm.marks, qtype: "short", options: [], image: null, loIds: lo ? [lo.id] : [], source: "own", parts: [] };
            sec.questions.push(q);
            sections.push(sec);
        });
        return {
            id: uid("pp"), classId: cls.id, exam, subject, hpcSubject: (opts && opts.hpcSubject) || subject, title: `${subject} - ${examById(exam).name}`,
            duration: mainTarget >= 60 ? "3 hrs" : mainTarget >= 30 ? "1.5 hrs" : "1 hr", status: (opts && opts.status) || "published", createdBy: opts && opts.by, createdAt: "2026-09-02",
            settings: { answerSpace: false }, sections
        };
    }

    function seed() {
        const r = rng(20262027);
        state = {
            version: 1,
            institution: { name: "Demo Public School", short: "DPS", type: "school", session: "2026-27", city: "Bhubaneswar", activeExam: "postmid", activeTerm: "Term 2", logo: null, cardTitle: "Progress Report" },
            componentMax: { oral: 5, activity: 5, enrichment: 5, notebook: 5 },
            exams: clone(FW.EXAMS),
            results: clone(FW.RESULTS),
            mistakes: {},
            library: clone(FW.LO_LIBRARY),
            staff: [
                { id: "st-admin", name: "Dr. Anita Mishra", role: "admin", title: "Coordinator" },
                { id: "st-rp", name: "Rakesh Panda", role: "teacher", title: "Class Teacher, Grade 7-A", subjects: ["English"] },
                { id: "st-sd", name: "Sunita Das", role: "teacher", title: "Class Teacher, Grade 4-A", subjects: ["English", "EVS"] },
                { id: "st-pn", name: "Priya Nayak", role: "teacher", title: "Class Teacher, Grade 2-A", subjects: ["English", "Mathematics", "EVS"] },
                { id: "st-mk", name: "Manoj Kar", role: "teacher", title: "Science Teacher", subjects: ["Physics"] },
                { id: "st-lb", name: "Lipika Bose", role: "teacher", title: "Science Teacher", subjects: ["Chemistry", "Biology"] }
            ],
            classes: [
                { id: "c-7a", grade: "7", section: "A", classTeacherId: "st-rp" },
                { id: "c-4a", grade: "4", section: "A", classTeacherId: "st-sd" },
                { id: "c-2a", grade: "2", section: "A", classTeacherId: "st-pn" }
            ],
            students: [], papers: [], marks: {},
            holistic: { "Term 1": { teacher: {}, self: {}, peer: {}, parent: {} }, "Term 2": { teacher: {}, self: {}, peer: {}, parent: {} } },
            observations: [], profiles: {}, parentNotes: { "Term 1": {}, "Term 2": {} }, attendance: { "Term 1": {}, "Term 2": {} },
            remarks: { "Term 1": {}, "Term 2": {} }
        };

        // students
        const used = new Set();
        const ability = {};
        state.classes.forEach((cls, ci) => {
            const n = cls.grade === "7" ? 18 : 16;
            for (let i = 0; i < n; i++) {
                let name;
                do { name = FIRST[Math.floor(r() * FIRST.length)] + " " + LAST[Math.floor(r() * LAST.length)]; } while (used.has(name));
                used.add(name);
                const sid = `s-${cls.id.slice(2)}-${i + 1}`;
                const g = parseInt(cls.grade, 10);
                state.students.push({
                    id: sid, classId: cls.id, roll: i + 1, name, gender: FIRST.indexOf(name.split(" ")[0]) % 2 ? "F" : "M",
                    dob: `${2026 - g - 6}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 27)).padStart(2, "0")}`,
                    guardian: `${["Mr.", "Mrs."][Math.floor(r() * 2)]} ${["S.", "P.", "R.", "B.", "K."][Math.floor(r() * 5)]} ${name.split(" ")[1]}`,
                    house: ["Mahanadi", "Konark", "Chilika", "Dhauli"][i % 4], color: AVATAR_COLORS[(i + ci) % AVATAR_COLORS.length]
                });
                ability[sid] = { base: 0.42 + r() * 0.5, dom: {} };
            }
        });

        // papers + marks
        const compMarks = (grade) => (parseInt(grade, 10) <= 5 ? [{ key: "oral", marks: 5 }, { key: "activity", marks: 5 }] : [{ key: "enrichment", marks: 3 }, { key: "notebook", marks: 2 }]);
        const mainFor = (grade, exam) => (grade === "7" ? (exam === "mid" ? 80 : 40) : grade === "4" ? 40 : 25);
        const owner = (cls, subject) => (cls.grade === "7" && subject === "English" ? "st-rp" : cls.classTeacherId);

        state.classes.forEach((cls) => {
            const subs = FW.subjectsForGrade(cls.grade).filter((s) => s.hpc);
            subs.forEach((s) => {
                if (cls.grade === "7" && s.name === "Science") {
                    // Physics, Chemistry, Biology papers by different teachers - merged into Science
                    [["Biology", "SC7.1", "st-lb"], ["Physics", "SC7.2", "st-mk"], ["Chemistry", "SC7.3", "st-lb"]].forEach(([sub, code, by], i) => {
                        const p = buildSeedPaper(r, cls, "mid", sub, i === 0 ? [{ key: "enrichment", marks: 3 }, { key: "notebook", marks: 1 }] : [{ key: "notebook", marks: 1 }],
                            sub === "Physics" ? 28 : 26, { libSubject: "Science", only: [code], hpcSubject: "Science", by });
                        state.papers.push(p);
                    });
                } else {
                    state.papers.push(buildSeedPaper(r, cls, "mid", s.name, compMarks(cls.grade), mainFor(cls.grade, "mid"), { by: owner(cls, s.name) }));
                }
            });
            // a non-Chrysalis paper with native script support
            const hi = { id: uid("pp"), classId: cls.id, exam: "mid", subject: "Odia", hpcSubject: "Odia", title: "Odia - Mid-Term", duration: "1.5 hrs", status: "published", createdBy: cls.classTeacherId, createdAt: "2026-09-02", settings: { answerSpace: true }, sections: [
                { id: uid("sec"), name: "ପଠନ (Reading)", type: "main", component: null, questions: [
                    { id: uid("q"), label: "1", text: "ନିମ୍ନଲିଖିତ ଅନୁଚ୍ଛେଦଟି ପଢି ପ୍ରଶ୍ନର ଉତ୍ତର ଦିଅ।", marks: cls.grade === "7" ? 20 : 10, qtype: "long", options: [], image: null, loIds: [], source: "own", parts: [] }] },
                { id: uid("sec"), name: "ଲେଖନ (Writing)", type: "main", component: null, questions: [
                    { id: uid("q"), label: "2", text: "ଆମ ବିଦ୍ୟାଳୟ ବିଷୟରେ ଏକ ଅନୁଚ୍ଛେଦ ଲେଖ।", marks: cls.grade === "7" ? 20 : 10, qtype: "long", options: [], image: null, loIds: [], source: "own", parts: [] }] }
            ] };
            state.papers.push(hi);

            // Post Mid-Term (current): English published and part-graded, Maths published & ungraded, one draft
            const eng = buildSeedPaper(r, cls, "postmid", "English", compMarks(cls.grade), mainFor(cls.grade, "postmid"), { by: owner(cls, "English") });
            state.papers.push(eng);
            state.papers.push(buildSeedPaper(r, cls, "postmid", "Mathematics", compMarks(cls.grade), mainFor(cls.grade, "postmid"), { by: cls.classTeacherId }));
            const third = cls.grade === "7" ? "Science" : "EVS";
            const draft = buildSeedPaper(r, cls, "postmid", third, compMarks(cls.grade), mainFor(cls.grade, "postmid"), { status: "draft", by: cls.classTeacherId });
            // leave one additional section without an HPC component to demonstrate the warning
            const lastAdd = draft.sections.filter((s) => s.type === "additional").pop();
            if (lastAdd) { lastAdd.component = null; lastAdd.name = "Activity Corner"; }
            state.papers.push(draft);
        });

        // marks
        const studentsOf = (cid) => state.students.filter((s) => s.classId === cid);
        state.papers.forEach((p) => {
            const studs = studentsOf(p.classId);
            if (p.status !== "published") return;
            let gradedShare = p.exam === "mid" ? 1 : (p.subject === "English" ? 0.6 : 0);
            const book = {};
            studs.forEach((s, i) => {
                if (i >= Math.round(studs.length * gradedShare)) return;
                const a = ability[s.id].base;
                if (r() < 0.025) { book[s.id] = { ab: true, m: {} }; return; }
                const m = {};
                units(p).forEach((u) => {
                    const add = u.section.type === "additional";
                    const v = clamp(a + (add ? 0.12 : 0) + (r() - 0.5) * 0.35, 0, 1) * u.max;
                    m[u.id] = Math.round(v * 2) / 2;
                    if (u.max <= 2) m[u.id] = Math.round(v);
                });
                book[s.id] = { ab: false, m };
            });
            state.marks[p.id] = book;
        });

        // holistic + profiles + remarks
        state.classes.forEach((cls) => {
            const st = stageOf(cls);
            const nL = levelsOf(cls).length;
            const studs = studentsOf(cls.id);
            studs.forEach((s, idx) => {
                const a = ability[s.id].base;
                ["Term 1", "Term 2"].forEach((term) => {
                    const H = state.holistic[term];
                    const grow = term === "Term 2" ? 0.06 : 0;
                    const doneTeacher = term === "Term 1" || idx < Math.round(studs.length * 0.4);
                    const doneSelf = term === "Term 1" || idx % 2 === 0;
                    const doneParent = term === "Term 1" ? idx % 7 !== 3 : idx % 5 === 0;
                    st.domains.forEach((d) => {
                        const dv = ability[s.id].dom[d.id] != null ? ability[s.id].dom[d.id] : (ability[s.id].dom[d.id] = clamp(a + (r() - 0.5) * 0.45, 0.05, 0.98));
                        const lv = (x) => clamp(Math.floor(clamp(x, 0, 0.999) * nL), 0, nL - 1);
                        if (doneTeacher) d.competencies.forEach((c) => { (H.teacher[s.id] = H.teacher[s.id] || {})[c.id] = lv(dv + grow + (r() - 0.5) * 0.2); });
                        if (doneSelf) (H.self[s.id] = H.self[s.id] || {})[d.id] = lv(dv + grow + 0.12 + (r() - 0.5) * 0.3);
                        if (doneParent) (H.parent[s.id] = H.parent[s.id] || {})[d.id] = lv(dv + grow + 0.08 + (r() - 0.5) * 0.3);
                        if (doneSelf) (H.peer[s.id] = H.peer[s.id] || {})[d.id] = [lv(dv + (r() - 0.5) * 0.3), lv(dv + (r() - 0.5) * 0.3)];
                    });
                    const workDays = term === "Term 1" ? 112 : 38;
                    state.attendance[term][s.id] = { present: Math.round(workDays * clamp(0.82 + a * 0.18 + (r() - 0.5) * 0.06, 0.7, 1)), total: workDays };
                    if (doneParent) state.parentNotes[term][s.id] = {
                        proud: ["Helps younger cousins with homework", "Started reading storybooks on their own", "Won a drawing competition in our colony", "Keeps the room tidy without being reminded", "Learnt to ride a bicycle"][idx % 5],
                        support: ["We will set a fixed reading time every evening", "We will practise tables during car rides", "We will encourage outdoor play daily", "We will limit screen time on school days"][idx % 4],
                        ack: term === "Term 1"
                    };
                });
                state.profiles[s.id] = {
                    aboutMe: ["I love cricket and drawing comics", "I like dancing and reading mystery stories", "I enjoy solving puzzles and building with blocks", "I like singing and caring for plants", "I love football and science experiments"][idx % 5],
                    ambition: ["Scientist", "Doctor", "Engineer", "Artist", "Teacher", "Cricketer", "Pilot", "Architect"][idx % 8],
                    goals: ["Improve my handwriting", "Read one book every month", "Speak confidently in assembly"].slice(0, 1 + (idx % 3)),
                    interests: [["Sports", "Art"], ["Music", "Reading"], ["Science", "Coding"], ["Dance", "Gardening"]][idx % 4]
                };
            });
        });
        // observations (anecdotal) for Term 2
        const obsNotes = ["Led the group during the science model activity", "Helped a classmate understand fractions", "Needed reminders to complete classwork", "Spoke confidently in the morning assembly", "Showed great creativity in the art period", "Was upset after losing a game; calmed down with support"];
        state.classes.forEach((cls) => {
            const st = stageOf(cls);
            studentsOf(cls.id).slice(0, 10).forEach((s, i) => {
                const d = st.domains[i % st.domains.length];
                state.observations.push({ id: uid("ob"), sid: s.id, term: "Term 2", domId: d.id, lvl: null, note: obsNotes[i % obsNotes.length], date: `2026-10-${String(5 + i).padStart(2, "0")}`, by: cls.classTeacherId });
            });
        });
        ensurePeriodicTest();
        ensureMistakes();
        // Term 1 remarks published
        state.students.forEach((s) => {
            state.remarks["Term 1"][s.id] = { text: draftRemark(s.id, "Term 1"), status: "published", at: "2026-10-10", seeded: true };
        });
        state.notesRule = NOTES_RULE;
        save(true);
    }

    // Demo Periodic Test 1 papers + marks, so Term 1 shows a full term-total breakdown.
    // Each student's level follows their Mid-Term result in that subject.
    function ensurePeriodicTest() {
        if (state.papers.some((p) => p.exam === "pt1")) return false;
        const r = rng(4242);
        state.classes.forEach((c) => {
            const studs = studentsOf(c.id);
            FW.subjectsForGrade(c.grade).filter((s) => s.hpc && libFor(c.grade, s.name).length).forEach((s) => {
                const p = buildSeedPaper(r, c, "pt1", s.name, [], 20, { by: c.classTeacherId, status: "published" });
                p.createdAt = "2026-07-15";
                state.papers.push(p);
                const book = {};
                studs.forEach((st) => {
                    const mid = subjectResult(c.id, "mid", s.name, st.id);
                    const a = mid && mid.any && !mid.ab && mid.mainMax ? mid.main / mid.mainMax : 0.6;
                    const m = {};
                    units(p).forEach((u) => { m[u.id] = Math.round(clamp(a + (r() - 0.5) * 0.3, 0, 1) * u.max * 2) / 2; });
                    book[st.id] = { ab: false, m };
                });
                state.marks[p.id] = book;
            });
        });
        return true;
    }

    // Demo mistake tags: each student has one or two habitual mistakes per kind of subject,
    // tagged on questions where they lost a good share of the marks.
    const DEMO_TAGS = 2;   // bump to regenerate demo tags (never touches teacher-entered tags)
    function ensureMistakes() {
        const isDemo = state.mistakesDemo !== false;   // false once a teacher has tagged anything
        if (!isDemo || state.mistakesDemo === DEMO_TAGS) return false;
        state.mistakes = {}; state.mistakesDemo = DEMO_TAGS;
        const r = rng(9090);
        state.papers.filter((p) => p.status === "published").forEach((p) => {
            const set = FW.mistakeSet(p.hpcSubject);
            Object.entries(state.marks[p.id] || {}).forEach(([sid, rec]) => {
                if (!rec || rec.ab) return;
                const n = parseInt(sid.split("-").pop(), 10) || 1;
                const habits = [set[n % set.length], set[(n * 3 + 1) % set.length]];
                units(p).forEach((u) => {
                    const v = rec.m[u.id];
                    if (v == null || v === "" || !u.max || Number(v) / u.max > 0.6 || r() > 0.4) return;
                    const tag = r() < 0.75 ? habits[r() < 0.6 ? 0 : 1] : set[Math.floor(r() * set.length)];
                    ((state.mistakes[p.id] = state.mistakes[p.id] || {})[sid] = state.mistakes[p.id][sid] || {})[u.id] = [tag];
                });
            });
        });
        return true;
    }
    const mistakesOf = (pid, sid) => ((state.mistakes || {})[pid] || {})[sid] || {};
    function toggleMistake(pid, sid, unitId, tag) {
        const book = ((state.mistakes[pid] = state.mistakes[pid] || {})[sid] = state.mistakes[pid][sid] || {});
        const cur = book[unitId] || [];
        book[unitId] = cur.includes(tag) ? cur.filter((t) => t !== tag) : cur.concat(tag);
        state.mistakesDemo = false;   // tags are now the school's own - never regenerate
        if (!book[unitId].length) delete book[unitId];
        save();
        return book[unitId] || [];
    }

    // ---------------------------------------------------------------------
    // Persistence
    // ---------------------------------------------------------------------
    let state = null;
    let saveTimer = null;
    let memo = {};   // derived class statistics; cleared whenever data changes
    function save(now) {
        memo = {};
        clearTimeout(saveTimer);
        const write = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn("revU HPC: could not persist", e); } };
        if (now) write(); else saveTimer = setTimeout(write, 250);
    }
    // Demo data saved before the bhusku family rebrand
    function migrate() {
        const inst = state.institution;
        if (inst.name === "bhuskU Demo School") { inst.name = "Demo Public School"; inst.short = "DPS"; }
        if (!inst.cardTitle) inst.cardTitle = "Progress Report";
        state.staff.forEach((s) => { if (s.title === "HPC Coordinator") s.title = "Coordinator"; });
        const remap = { "#318552": "#685DBC", "#3c4d87": "#0e8a7a" };
        state.students.forEach((s) => { if (remap[s.color]) s.color = remap[s.color]; });
        if (!state.exams) state.exams = clone(FW.EXAMS);
        if (!state.mistakes) state.mistakes = {};
        if (!state.results) {
            // Older saves kept one "term total" per term - carry any customisation over
            state.results = clone(FW.RESULTS);
            ["Term 1", "Term 2"].forEach((t, i) => {
                const tt = (state.termTotal || {})[t];
                if (tt && tt.length) state.results[i].parts = tt.map((p) => ({ key: p.key, label: p.label, short: p.short, src: p.fields ? "fields" : "exam", ref: p.fields ? "*" : p.exam, outOf: p.outOf }));
            });
            delete state.termTotal;
            save();
        }
        if (ensurePeriodicTest()) save();
        if (ensureMistakes()) save();
        // Demo notes drafted under older rules: re-draft only the seeded ones (published on the
        // seed date, never edited by a teacher) so they follow the current insight engine.
        if ((state.notesRule || 1) < NOTES_RULE) {
            Object.entries(state.remarks || {}).forEach(([term, byStudent]) => Object.entries(byStudent).forEach(([sid, rem]) => {
                if (rem && (rem.seeded || rem.at === "2026-10-10") && student(sid)) { rem.text = draftRemark(sid, term); rem.seeded = true; }
            }));
            state.notesRule = NOTES_RULE;
            save(true);
        }
    }
    // Bump when the note-drafting rules change in a way that fixes wrong statements
    const NOTES_RULE = 3;
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) { state = JSON.parse(raw); if (state && state.version === 1) { migrate(); return; } }
        } catch (e) { /* fall through to seed */ }
        seed();
    }
    function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } seed(); }

    // ---------------------------------------------------------------------
    // Lookups
    // ---------------------------------------------------------------------
    const cls = (id) => state.classes.find((c) => c.id === id);
    const className = (c) => (typeof c === "string" ? className(cls(c)) : c ? `Grade ${c.grade}-${c.section}` : "");
    const student = (id) => state.students.find((s) => s.id === id);
    const studentsOf = (cid) => state.students.filter((s) => s.classId === cid).sort((a, b) => a.roll - b.roll);
    const staff = (id) => state.staff.find((s) => s.id === id);
    const paper = (id) => state.papers.find((p) => p.id === id);
    const stageOf = (c) => FW.STAGES[FW.stageForGrade(c.grade)];
    const levelsOf = (c) => FW.LEVELS[stageOf(c).levelSet];
    const exams = () => state.exams || FW.EXAMS;
    const examById = (id) => exams().find((e) => e.id === id) || { id, name: id, short: id, term: null };
    const examsOfTerm = (term) => exams().filter((e) => e.term === term);
    const libFor = (grade, subject) => (state.library[grade] || {})[subject] || [];
    function loIndex(grade) {
        const map = {};
        Object.entries(state.library[grade] || {}).forEach(([subject, comps]) => comps.forEach((c) => c.los.forEach((lo) => { map[lo.id] = { ...lo, comp: c, subject }; })));
        return map;
    }

    // ---------------------------------------------------------------------
    // Paper calculations
    // ---------------------------------------------------------------------
    // Gradable units: a question without parts, or each sub-part
    function units(p) {
        const out = [];
        p.sections.forEach((sec) => sec.questions.forEach((q) => {
            if (q.parts && q.parts.length) q.parts.forEach((pt) => out.push({ id: pt.id, label: `${q.label}.${pt.label}`, max: Number(pt.marks) || 0, loIds: pt.loIds && pt.loIds.length ? pt.loIds : q.loIds, section: sec, q }));
            else out.push({ id: q.id, label: q.label, max: Number(q.marks) || 0, loIds: q.loIds || [], section: sec, q });
        }));
        return out;
    }
    const qMarks = (q) => (q.parts && q.parts.length ? q.parts.reduce((s, p) => s + (Number(p.marks) || 0), 0) : Number(q.marks) || 0);
    const secMax = (sec) => sec.questions.reduce((s, q) => s + qMarks(q), 0);

    // e.g. { main: 80, comps: { enrichment: 3, notebook: 2 }, total: 85, untagged: [sec] }
    function breakdown(p) {
        const out = { main: 0, comps: {}, total: 0, untagged: [] };
        p.sections.forEach((sec) => {
            const m = secMax(sec);
            out.total += m;
            if (sec.type === "main") out.main += m;
            else if (sec.component) out.comps[sec.component] = (out.comps[sec.component] || 0) + m;
            else out.untagged.push(sec);
        });
        return out;
    }

    // One student's result on one paper; null if nothing entered
    function paperResult(p, sid) {
        const rec = (state.marks[p.id] || {})[sid];
        if (!rec) return null;
        const res = { ab: !!rec.ab, sec: {}, main: 0, comps: {}, total: 0, filled: 0, units: 0 };
        units(p).forEach((u) => {
            res.units++;
            const v = rec.m[u.id];
            if (v !== undefined && v !== null && v !== "") res.filled++;
            const n = Number(v) || 0;
            res.sec[u.section.id] = (res.sec[u.section.id] || 0) + n;
            res.total += n;
            if (u.section.type === "main") res.main += n;
            else if (u.section.component) res.comps[u.section.component] = (res.comps[u.section.component] || 0) + n;
        });
        res.complete = res.ab || res.filled === res.units;
        return res;
    }

    // Papers that report into one HPC subject (merged Physics + Chemistry + Biology -> Science)
    const papersFor = (classId, exam, hpcSubject) => state.papers.filter((p) => p.classId === classId && p.exam === exam && p.hpcSubject === hpcSubject && p.status === "published");

    function subjectResult(classId, exam, hpcSubject, sid) {
        const ps = papersFor(classId, exam, hpcSubject);
        if (!ps.length) return null;
        const out = { main: 0, mainMax: 0, comps: {}, ab: false, complete: true, any: false, papers: ps };
        ps.forEach((p) => {
            const b = breakdown(p);
            out.mainMax += b.main;
            Object.entries(b.comps).forEach(([k, mx]) => { (out.comps[k] = out.comps[k] || { got: 0, max: 0 }).max += mx; });
            const r = paperResult(p, sid);
            if (!r) { out.complete = false; return; }
            out.any = true;
            if (r.ab) out.ab = true;
            if (!r.complete) out.complete = false;
            out.main += r.main;
            Object.entries(r.comps).forEach(([k, v]) => { (out.comps[k] = out.comps[k] || { got: 0, max: 0 }).got += v; });
        });
        return out;
    }
    // Component conversion: e.g. Notebook marked out of 2, shown out of 5
    const convert = (got, max, key) => (max ? round1((got / max) * (state.componentMax[key] || max)) : 0);
    function gradeFor(pct) {
        const scale = state.institution.type === "higher" ? FW.GRADE_SCALES.higher : FW.GRADE_SCALES.school;
        return (scale.find(([min]) => pct >= min) || scale[scale.length - 1])[1];
    }

    // ---------------------------------------------------------------------
    // Quick scheme: build a paper from its marking scheme in plain text.
    //   # Reading                 -> core section
    //   # Notebook [notebook]     -> extra section feeding a report field
    //   1a 2 EN7.1.1              -> question 1, part a, 2 marks, mapped to an outcome
    //   2 5 EN7.2 | Rewrite...    -> a skill-area code maps all its outcomes; text after |
    // ---------------------------------------------------------------------
    const FIELD_ALIASES = { oral: "oral", activity: "activity", enrichment: "enrichment", asl: "enrichment", lab: "enrichment", practical: "enrichment", project: "enrichment", notebook: "notebook", nb: "notebook" };
    function parseScheme(text, grade, subject) {
        const idx = loIndex(grade);
        const byCode = {};
        Object.values(idx).forEach((lo) => { byCode[lo.code.toLowerCase()] = [lo.id]; (byCode[lo.comp.code.toLowerCase()] = byCode[lo.comp.code.toLowerCase()] || []).push(lo.id); });
        const sections = [], errors = [], warnings = [];
        let cur = null;
        const labels = new Set();
        const section = (name, field) => { cur = { id: uid("sec"), name, type: field ? "additional" : "main", component: field || null, questions: [] }; sections.push(cur); };
        String(text || "").split(/\r?\n/).forEach((raw, i) => {
            const line = raw.trim(); const n = i + 1;
            if (!line) return;
            const sec = line.match(/^#\s*(.+?)\s*(?:\[\s*([\w ]+?)\s*\])?\s*$/);
            if (sec) {
                let field = null;
                if (sec[2]) { field = FIELD_ALIASES[sec[2].toLowerCase().replace(/\s+/g, "")]; if (!field) errors.push(`Line ${n}: "[${sec[2]}]" is not a report field - use oral, activity, enrichment or notebook.`); }
                section(sec[1], field);
                return;
            }
            const q = line.match(/^(?:q\s*)?(\d+)\s*[.(]?\s*([a-z]{1,2}|[ivx]{1,4})?\s*\)?\s+(\d+(?:\.\d+)?)\b\s*(.*)$/i);
            if (!q) { errors.push(`Line ${n}: "${line.slice(0, 40)}" - expected a question number and marks, e.g. "1a 2".`); return; }
            if (!cur) section("Section A", null);
            const [, num, part, marks, rest] = q;
            const label = num + (part ? part.toLowerCase() : "");
            if (labels.has(label)) { errors.push(`Line ${n}: question ${label} appears twice.`); return; }
            labels.add(label);
            const [codesText, ...textParts] = rest.split("|");
            const loIds = [];
            codesText.split(/[\s,;]+/).filter(Boolean).forEach((code) => {
                const hit = byCode[code.toLowerCase()];
                if (hit) hit.forEach((id) => { if (!loIds.includes(id)) loIds.push(id); });
                else warnings.push(`Line ${n}: outcome "${code}" is not in ${subject || "this subject"}'s outcomes for Grade ${grade}.`);
            });
            const qtext = textParts.join("|").trim();
            const mk = Number(marks);
            if (part) {
                let parent = cur.questions.find((x) => x.label === num);
                if (!parent) { parent = { id: uid("q"), label: num, text: "", marks: 0, qtype: "short", options: [], image: null, loIds: [], source: "own", parts: [] }; cur.questions.push(parent); }
                parent.parts.push({ id: uid("p"), label: part.toLowerCase(), text: qtext, marks: mk, loIds });
                parent.marks = parent.parts.reduce((s2, x) => s2 + x.marks, 0);
            } else {
                if (cur.questions.some((x) => x.label === num)) { errors.push(`Line ${n}: question ${num} already has parts.`); return; }
                cur.questions.push({ id: uid("q"), label: num, text: qtext, marks: mk, qtype: mk >= 4 ? "long" : "short", options: [], image: null, loIds, source: "own", parts: [] });
            }
        });
        sections.forEach((s2) => { if (!s2.questions.length) warnings.push(`Section "${s2.name}" has no questions.`); });
        const main = sections.filter((s2) => s2.type === "main").reduce((t, s2) => t + secMax(s2), 0);
        const comps = {};
        sections.filter((s2) => s2.type !== "main").forEach((s2) => { comps[s2.component] = (comps[s2.component] || 0) + secMax(s2); });
        return { sections, errors, warnings, main, comps, questions: labels.size };
    }
    // A starter scheme from the outcome library: one line per outcome
    function schemeFromOutcomes(grade, subject) {
        const lines = []; let q = 1;
        libFor(grade, subject).forEach((c) => {
            lines.push(`# ${c.title.replace(/\s*\(.*\)$/, "")}${c.kind !== "regular" ? ` [${c.kind}]` : ""}`);
            if (c.los.length > 1) c.los.forEach((lo, i) => lines.push(`${q}${String.fromCharCode(97 + i)} 2 ${lo.code}`));
            else lines.push(`${q} 2 ${c.los[0].code}`);
            q++;
        });
        return lines.join("\n");
    }

    // ---------------------------------------------------------------------
    // Results: linked, scaled totals. A part is an exam (its core sections), the pooled
    // extra-section fields, or another result - each scaled to its own "out of".
    // ---------------------------------------------------------------------
    const results = () => state.results || FW.RESULTS;
    const resultById = (id) => results().find((r) => r.id === id);
    const reportResult = (term) => results().find((r) => r.term === term) || null;
    // Exams reachable from a result (through linked results too)
    function resultExams(id, seen) {
        const r = resultById(id); seen = seen || new Set();
        if (!r || seen.has(id)) return [];
        seen.add(id);
        return r.parts.flatMap((p) => (p.src === "exam" ? [p.ref] : p.src === "result" ? resultExams(p.ref, seen) : []));
    }
    // Problems that would make results wrong: loops, marks counted twice, two results on one report
    function resultProblems(list) {
        const byId = (id) => list.find((r) => r.id === id);
        const out = [];
        list.forEach((r) => {
            const walk = (id, path) => {
                const x = byId(id); if (!x) return [];
                if (path.includes(id)) { out.push(`Results form a loop: ${path.slice(path.indexOf(id)).concat(id).map((p) => `"${(byId(p) || {}).name}"`).join(" → ")}.`); return []; }
                return x.parts.flatMap((p) => (p.src === "exam" ? [p.ref] : p.src === "result" ? walk(p.ref, path.concat(id)) : []));
            };
            const ex = walk(r.id, []);
            const dup = ex.find((e, i) => ex.indexOf(e) !== i);
            if (dup) out.push(`"${r.name}" counts ${examById(dup).name} more than once.`);
            if (r.parts.filter((p) => p.src === "fields").length > 1) out.push(`"${r.name}" uses the extra-section fields twice.`);
            if (!String(r.name || "").trim()) out.push("Every result needs a name.");
            if (!r.parts.length) out.push(`"${r.name}" has no parts.`);
            r.parts.forEach((p) => { if (!(Number(p.outOf) > 0)) out.push(`"${r.name}": "${p.label || "a part"}" needs an "out of" above 0.`); });
        });
        const terms = list.filter((r) => r.term).map((r) => r.term);
        const t2 = terms.find((t, i) => terms.indexOf(t) !== i);
        if (t2) out.push(`Only one result can be shown on the ${t2} report.`);
        return [...new Set(out)];
    }
    function resultFor(id, classId, subject, sid, depth) {
        const r = resultById(id);
        if (!r || (depth || 0) > 6) return { id, name: r ? r.name : "", parts: [], total: 0, max: 0, markedMax: 0, complete: false, absentExcluded: false, pct: null, grade: null };
        const grade = cls(classId).grade;
        const zeroAB = !!state.absentAsZero;   // default: an absent part shows AB and is left out of the grade
        const fieldExams = () => { const ex = r.parts.filter((p) => p.src === "exam").map((p) => p.ref); return ex.length ? ex : r.term ? examsOfTerm(r.term).map((e) => e.id) : []; };
        const parts = r.parts.map((part) => {
            const generic = part.src === "fields" && (!part.label || part.label === "Skills");
            const out = { part, label: generic ? FW.fieldsLabel(grade) : part.label, short: generic ? FW.fieldsLabel(grade, true) : (part.short || part.label), outOf: part.outOf, score: null, status: "none" };
            if (part.src === "fields") {
                let got = 0, max = 0, marked = false, missed = false;
                (part.ref && part.ref !== "*" ? [part.ref] : fieldExams()).forEach((ex) => {
                    const sr = subjectResult(classId, ex, subject, sid);
                    if (!sr || !Object.keys(sr.comps).length) return;
                    if (sr.ab && !zeroAB) { missed = true; return; }
                    Object.values(sr.comps).forEach((c) => { max += c.max; got += sr.ab ? 0 : c.got; });
                    if (sr.any) marked = true;
                });
                if (!max) { if (missed) out.status = "ab"; return out; }
                out.status = marked ? "ok" : "pending";
                if (marked) { out.score = round1((got / max) * part.outOf); out.raw = { got, max }; }
                return out;
            }
            if (part.src === "result") {
                const sub = resultFor(part.ref, classId, subject, sid, (depth || 0) + 1);
                if (!sub.max) return out;
                if (sub.pct == null) { out.status = "pending"; return out; }
                out.status = "ok"; out.score = round1((sub.pct / 100) * part.outOf);
                out.partial = !sub.complete; out.absent = sub.absentExcluded; out.sub = sub;
                return out;
            }
            const sr = subjectResult(classId, part.ref, subject, sid);
            if (!sr || !sr.mainMax) return out;
            if (!sr.any) { out.status = "pending"; return out; }
            if (sr.ab) { out.status = "ab"; out.score = zeroAB ? 0 : null; return out; }
            out.status = "ok"; out.raw = { got: sr.main, max: sr.mainMax };
            out.score = round1((sr.main / sr.mainMax) * part.outOf);
            return out;
        });
        const counted = parts.filter((p) => p.status === "ok" || (p.status === "ab" && zeroAB));
        const total = round1(counted.reduce((s2, p) => s2 + p.score, 0));
        const max = parts.filter((p) => p.status !== "none").reduce((s2, p) => s2 + p.outOf, 0);
        const markedMax = counted.reduce((s2, p) => s2 + p.outOf, 0);
        const complete = counted.length > 0 && !parts.some((p) => p.status === "pending" || p.partial);
        const absentExcluded = (!zeroAB && parts.some((p) => p.status === "ab")) || parts.some((p) => p.absent);
        const pctV = markedMax ? (total / markedMax) * 100 : null;
        return { id, name: r.name, parts, total, max, markedMax, complete, absentExcluded, pct: pctV, grade: pctV == null ? null : gradeFor(pctV) };
    }
    // The total shown on a term's report
    function termResult(classId, term, subject, sid) {
        const r = reportResult(term);
        return r ? resultFor(r.id, classId, subject, sid) : { parts: [], total: 0, max: 0, markedMax: 0, complete: false, absentExcluded: false, pct: null, grade: null };
    }

    // Class statistics for comparison (cached until the next save)
    function classStats(classId, term) {
        const k = `${classId}|${term}`;
        if (memo[k]) return memo[k];
        const lo = {}, sub = {};
        studentsOf(classId).forEach((s) => {
            Object.entries(loMastery(s.id, term)).forEach(([id, v]) => { (lo[id] = lo[id] || []).push(v.pct); });
        });
        const papers = state.papers.filter((p) => p.classId === classId && p.status === "published");
        papers.forEach((p) => studentsOf(classId).forEach((s) => {
            const r = paperResult(p, s.id);
            if (r && r.complete && !r.ab) { const b = breakdown(p); if (b.main) ((sub[p.exam] = sub[p.exam] || {})[p.hpcSubject] = sub[p.exam][p.hpcSubject] || []).push((r.main / b.main) * 100); }
        }));
        const avg = (o) => Object.fromEntries(Object.entries(o).map(([key, arr]) => [key, { avg: mean(arr), n: arr.length }]));
        memo[k] = { lo: avg(lo), exam: Object.fromEntries(Object.entries(sub).map(([ex, o]) => [ex, avg(o)])) };
        return memo[k];
    }

    // LO-level attainment for a term (all papers of the term's exams)
    function loMastery(sid, term) {
        const s = student(sid);
        const c = cls(s.classId);
        const nL = levelsOf(c).length;
        const exams = examsOfTerm(term).map((e) => e.id);
        const acc = {};
        state.papers.filter((p) => p.classId === c.id && exams.includes(p.exam) && p.status === "published").forEach((p) => {
            const rec = (state.marks[p.id] || {})[sid];
            if (!rec || rec.ab) return;
            units(p).forEach((u) => {
                const v = rec.m[u.id];
                if (v === undefined || v === null || v === "") return;
                u.loIds.forEach((lo) => { const a = (acc[lo] = acc[lo] || { got: 0, max: 0 }); a.got += Number(v) || 0; a.max += u.max; });
            });
        });
        const out = {};
        Object.entries(acc).forEach(([lo, a]) => {
            const pct = a.max ? (a.got / a.max) * 100 : 0;
            const cuts = LEVEL_CUTS[nL] || LEVEL_CUTS[3];
            let lvl = 0; cuts.forEach((cut) => { if (pct >= cut) lvl++; });
            out[lo] = { pct: Math.round(pct), lvl };
        });
        return out;
    }

    // ---------------------------------------------------------------------
    // Holistic calculations (levels are 0-based indices)
    // ---------------------------------------------------------------------
    const H = (term) => state.holistic[term] || (state.holistic[term] = { teacher: {}, self: {}, peer: {}, parent: {} });
    const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

    function domainScores(sid, term) {
        const s = student(sid); const c = cls(s.classId); const st = stageOf(c); const h = H(term);
        return st.domains.map((d) => {
            const t = mean(d.competencies.map((cp) => (h.teacher[sid] || {})[cp.id]).filter((v) => v != null));
            const self = (h.self[sid] || {})[d.id];
            const peerArr = ((h.peer[sid] || {})[d.id] || []).concat(Object.values(h.peerBy || {}).map((r) => (r[sid] || {})[d.id]).filter((v) => v != null));
            const peer = peerArr.length ? mean(peerArr) : null;
            const parent = (h.parent[sid] || {})[d.id];
            return { domain: d, teacher: t, self: self != null ? self : null, peer, parent: parent != null ? parent : null };
        });
    }
    function teacherRatedComplete(sid, term) {
        const s = student(sid); const st = stageOf(cls(s.classId)); const t = H(term).teacher[sid] || {};
        return st.domains.every((d) => d.competencies.every((cp) => t[cp.id] != null));
    }
    const selfDone = (sid, term) => { const st = stageOf(cls(student(sid).classId)); const v = H(term).self[sid] || {}; return st.domains.every((d) => v[d.id] != null); };
    const parentDone = (sid, term) => { const st = stageOf(cls(student(sid).classId)); const v = H(term).parent[sid] || {}; return st.domains.every((d) => v[d.id] != null); };

    // Observation-suggested level for a domain (mean of observations that carry a level)
    function suggestion(sid, term, domId) {
        const lv = state.observations.filter((o) => o.sid === sid && o.term === term && o.domId === domId && o.lvl != null).map((o) => o.lvl);
        return lv.length ? Math.round(mean(lv)) : null;
    }

    // ---------------------------------------------------------------------
    // Auto-drafted narrative remark (teacher edits before publishing)
    // ---------------------------------------------------------------------
    // ---------------------------------------------------------------------
    // Insight engine - transparent rules, no black box. Every number and sentence on a
    // report comes from here, with the rule and data that produced it.
    // ---------------------------------------------------------------------
    const LEVEL_CUTS = { 3: [40, 75], 4: [35, 60, 80] };   // outcome % -> level
    const STRENGTH_COUNT = 3, NEXT_COUNT = 3, NEXT_BELOW = 75;

    // Academic insights: what the marks say beyond the totals. Each insight carries the
    // evidence behind it ("why") and, for mistakes, a practice tip.
    //   tone "focus" = something to work on, "good" = something going well
    const INSIGHT_RULES = {
        mistakeMin: 2,          // a mistake type must recur in at least 2 questions
        gapBelow: 60,           // outcome under 60% ...
        gapVsClass: 10,         // ... and 10+ points under the class average
        strongAbove: 85,        // outcome at 85%+ and 10+ points over the class average
        trendPoints: 10,        // change of 10+ points between linked exams
        answerGap: 15,          // long answers 15+ points under short answers
        answerMinMarks: 6       // ... with at least 6 marks of each kind
    };
    function academicInsights(sid, term, rows) {
        const s = student(sid); const c = cls(s.classId);
        const rr = reportResult(term);
        const examIds = [...new Set((rr ? resultExams(rr.id) : []).concat(examsOfTerm(term).map((e) => e.id)))];
        const papers = state.papers.filter((p) => p.classId === c.id && examIds.includes(p.exam) && p.status === "published");
        const out = [];
        const subjName = (sub) => sub;

        // 1. Recurring mistakes, across subjects
        const tags = {};
        let longGot = 0, longMax = 0, shortGot = 0, shortMax = 0;
        papers.forEach((p) => {
            const rec = (state.marks[p.id] || {})[sid];
            if (!rec || rec.ab) return;
            const tagged = mistakesOf(p.id, sid);
            units(p).forEach((u) => {
                const v = rec.m[u.id];
                if (v == null || v === "") return;
                const lost = Math.max(0, u.max - Number(v));
                (tagged[u.id] || []).forEach((t) => {
                    const x = (tags[t] = tags[t] || { count: 0, lost: 0, subjects: {}, exams: new Set() });
                    x.count++; x.lost += lost; x.subjects[p.hpcSubject] = (x.subjects[p.hpcSubject] || 0) + 1; x.exams.add(examById(p.exam).name);
                });
                if (u.section.type !== "main") return;
                if (u.q.qtype === "long") { longGot += Number(v); longMax += u.max; }
                else { shortGot += Number(v); shortMax += u.max; }
            });
        });
        Object.entries(tags).filter(([, x]) => x.count >= INSIGHT_RULES.mistakeMin).sort((a, b) => b[1].lost - a[1].lost).forEach(([t, x]) => {
            const m = FW.MISTAKES[t] || { label: t, tip: "" };
            const where = Object.entries(x.subjects).sort((a, b) => b[1] - a[1]).map(([sub, n]) => `${subjName(sub)}${n > 1 ? ` ×${n}` : ""}`).join(", ");
            out.push({ kind: "mistake", tone: "focus", tag: t, weight: 20 + x.lost, count: x.count, where, title: `${m.label}`, text: `${m.label} cost ${round1(x.lost)} marks in ${x.count} questions (${where}).`,
                why: `Tagged by teachers while marking ${[...x.exams].join(" and ")}.`, tip: m.tip, subjects: Object.keys(x.subjects) });
        });

        // 2. Outcomes well below / above the class
        const stats = classStats(c.id, term);
        const lom = loMastery(sid, term);
        const idx = loIndex(c.grade);
        const gaps = [], highs = [];
        Object.entries(lom).forEach(([id, v]) => {
            const info = idx[id]; const cs = stats.lo[id];
            if (!info || !cs || cs.n < 3) return;
            const d = v.pct - cs.avg;
            if (v.pct < INSIGHT_RULES.gapBelow && -d >= INSIGHT_RULES.gapVsClass) gaps.push({ info, v, avg: cs.avg, d });
            if (v.pct >= INSIGHT_RULES.strongAbove && d >= INSIGHT_RULES.gapVsClass) highs.push({ info, v, avg: cs.avg, d });
        });
        gaps.sort((a, b) => a.d - b.d).slice(0, 3).forEach((g) => out.push({ kind: "gap", tone: "focus", weight: 10 - g.d, title: `${g.info.subject}: ${g.info.comp.title.replace(/\s*\(.*\)$/, "")}`,
            text: `Needs practice: ${g.info.text.toLowerCase()} - ${g.v.pct}% against a class average of ${Math.round(g.avg)}%.`, why: `Outcome ${g.info.code}, from every question mapped to it this term.`,
            tip: "Revisit this outcome with a worked example, then three short practice questions.", subjects: [g.info.subject] }));
        highs.sort((a, b) => b.d - a.d).slice(0, 2).forEach((g) => out.push({ kind: "strength", tone: "good", weight: g.d, title: `${g.info.subject}: ${g.info.comp.title.replace(/\s*\(.*\)$/, "")}`,
            text: `Ahead of the class: ${g.info.text.toLowerCase()} - ${g.v.pct}% against ${Math.round(g.avg)}%.`, why: `Outcome ${g.info.code}.`, tip: "", subjects: [g.info.subject] }));

        // 3. Change across linked exams (first vs last exam in this term's result, core sections)
        const examParts = rr ? rr.parts.filter((p) => p.src === "exam").map((p) => p.ref) : examsOfTerm(term).map((e) => e.id);
        (rows || []).forEach((r) => {
            const pts = examParts.map((ex) => ({ ex, sr: subjectResult(c.id, ex, r.sub, sid) })).filter((x) => x.sr && x.sr.any && !x.sr.ab && x.sr.mainMax && x.sr.complete);
            if (pts.length < 2) return;
            const a = (pts[0].sr.main / pts[0].sr.mainMax) * 100, b = (pts[pts.length - 1].sr.main / pts[pts.length - 1].sr.mainMax) * 100;
            const d = b - a;
            if (Math.abs(d) < INSIGHT_RULES.trendPoints) return;
            const from = examById(pts[0].ex).name, to = examById(pts[pts.length - 1].ex).name;
            out.push(d > 0
                ? { kind: "up", tone: "good", weight: d, title: `${r.sub} improving`, text: `${r.sub} rose from ${Math.round(a)}% (${from}) to ${Math.round(b)}% (${to}).`, why: "Core-section percentages of the linked exams.", tip: "", subjects: [r.sub] }
                : { kind: "down", tone: "focus", weight: -d, title: `${r.sub} slipping`, text: `${r.sub} fell from ${Math.round(a)}% (${from}) to ${Math.round(b)}% (${to}).`, why: "Core-section percentages of the linked exams.", tip: "Check which chapters changed between the two exams and revise those first.", subjects: [r.sub] });
        });

        // 4. Long answers vs short answers
        if (longMax >= INSIGHT_RULES.answerMinMarks && shortMax >= INSIGHT_RULES.answerMinMarks) {
            const lp = (longGot / longMax) * 100, sp = (shortGot / shortMax) * 100;
            if (sp - lp >= INSIGHT_RULES.answerGap) out.push({ kind: "answers", tone: "focus", weight: sp - lp, title: "Long answers", text: `Scores ${Math.round(lp)}% on long answers against ${Math.round(sp)}% on short ones.`,
                why: "All core questions this term, grouped by answer type.", tip: "Plan long answers in three steps: point, explanation, example.", subjects: [] });
        }
        return out.sort((a, b) => (a.tone === b.tone ? b.weight - a.weight : a.tone === "focus" ? -1 : 1));
    }

    function insights(sid, term) {
        const s = student(sid); const c = cls(s.classId); const L = levelsOf(c);
        const termExams = examsOfTerm(term).map((e) => e.id);
        const pub = state.papers.filter((p) => p.classId === c.id && termExams.includes(p.exam) && p.status === "published");
        const order = FW.subjectsForGrade(c.grade).map((x) => x.name);
        const subjects = [...new Set(pub.map((p) => p.hpcSubject))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
        const lom = loMastery(sid, term);
        const toPct = (v) => ((v + 1) / L.length) * 100;

        // Subjects: term total + skill areas (mean of their outcomes)
        const rows = subjects.map((sub) => {
            const tr = termResult(c.id, term, sub, sid);
            const skills = libFor(c.grade, sub).map((comp) => {
                const outs = comp.los.filter((lo) => lom[lo.id]).map((lo) => ({ lo, ...lom[lo.id] }));
                return outs.length ? { c: comp, outs, lvl: Math.round(mean(outs.map((o) => o.lvl))), pct: Math.round(mean(outs.map((o) => o.pct))) } : null;
            }).filter(Boolean);
            const sources = [...new Set(pub.filter((p) => p.hpcSubject === sub).map((p) => p.subject))].filter((x) => x !== sub);
            return { sub, tr, skills, sources };
        });
        const graded = rows.filter((r) => r.tr.pct != null);
        const overall = graded.length ? mean(graded.map((r) => r.tr.pct)) : null;

        // Every rated item on one 0-100 scale
        const ds = domainScores(sid, term);
        const items = [];
        rows.forEach((r) => r.skills.forEach((k) => items.push({ name: k.c.title.replace(/\s*\(.*\)$/, ""), where: r.sub, score: k.pct, lvl: k.lvl, core: k.c.kind === "regular", kind: "skill" })));
        ds.forEach((d) => { if (d.teacher != null) items.push({ name: d.domain.name, where: "Growth", score: Math.round(toPct(d.teacher)), lvl: Math.round(d.teacher), core: true, kind: "growth" }); });
        const counts = L.map(() => 0); items.forEach((it) => { counts[it.lvl]++; });
        // Highest first; on a tie, core skills and growth areas lead extra sections
        const sorted = items.slice().sort((a, b) => b.score - a.score || (b.core - a.core));
        const strengths = sorted.slice(0, STRENGTH_COUNT);
        const nexts = sorted.slice().reverse().filter((it) => it.score < NEXT_BELOW && !strengths.includes(it)).slice(0, NEXT_COUNT);
        const stretch = !nexts.length && sorted.length > STRENGTH_COUNT ? sorted[sorted.length - 1] : null;

        const academic = academicInsights(sid, term, rows);
        return { student: s, cls: c, L, rows, graded, overall, ds, items, counts, strengths, nexts, stretch, academic, remark: remarkParts(sid, term, rows, ds, academic) };
    }

    // The auto-drafted teacher's note, one sentence per rule
    function remarkParts(sid, term, rows, ds, academic) {
        const s = student(sid); const c = cls(s.classId); const L = levelsOf(c);
        const first = s.name.split(" ")[0];
        const out = [];
        const rated = (ds || domainScores(sid, term)).filter((d) => d.teacher != null).sort((a, b) => b.teacher - a.teacher);
        if (rated.length) {
            const top = rated.slice(0, 2);
            out.push({ text: `${first} shows real strength in ${top.map((d) => d.domain.name.toLowerCase()).join(" and ")}.`,
                rule: "The two growth areas with the highest teacher rating", data: top.map((d) => `${d.domain.name}: ${L[Math.round(d.teacher)].label}`).join(", ") });
            const low = rated[rated.length - 1];
            if (low && low.teacher < L.length - 1.2) out.push({ text: `With steady practice, ${first} can grow further in ${low.domain.name.toLowerCase()}.`,
                rule: "Lowest-rated growth area, if it is below the top level", data: `${low.domain.name}: ${L[Math.round(low.teacher)].label}` });
            const gap = rated.find((d) => d.self != null && d.self - d.teacher >= 1.2);
            if (gap) out.push({ text: `${first} rates ${gap.domain.name.toLowerCase()} higher than observed in class - a good conversation to have together.`,
                rule: "Self-rating at least one level above the teacher's", data: `${gap.domain.name}: self ${L[Math.round(gap.self)].label}, teacher ${L[Math.round(gap.teacher)].label}` });
        }
        // Judge subjects only on enough evidence: at least half the term total sat
        const graded = (rows || []).filter((r) => r.tr.pct != null && r.tr.markedMax >= r.tr.max / 2).slice().sort((a, b) => b.tr.pct - a.tr.pct);
        if (graded.length) {
            const best = graded[0], weak = graded[graded.length - 1];
            const support = graded.length > 1 && weak.tr.pct < 60;
            out.push({ text: `Academically, ${first} performs best in ${best.sub}${support ? ` and needs more support in ${weak.sub}` : ""}.`,
                rule: (support ? "Highest term total, and any subject below 60%" : "Highest term total") + " - among subjects with at least half the term total sat",
                data: `${best.sub} ${Math.round(best.tr.pct)}%${support ? `, ${weak.sub} ${Math.round(weak.tr.pct)}%` : ""}` });
        }
        const mk = (academic || []).find((x) => x.kind === "mistake");
        if (mk) out.push({ text: `${first} is losing marks to ${mk.title.toLowerCase()} in ${mk.count} questions (${mk.where}). Tip: ${mk.tip}`,
            rule: "The mistake type that cost the most marks, if it recurs in 2+ questions", data: mk.text });
        const att = (state.attendance[term] || {})[sid];
        if (att && att.total && (att.present / att.total) * 100 < 85) {
            const ap = Math.round((att.present / att.total) * 100);
            out.push({ text: `Regular attendance (${ap}% this term) will help ${first} keep pace.`, rule: "Attendance below 85%", data: `${att.present} of ${att.total} days` });
        }
        const prof = state.profiles[sid];
        if (prof && prof.ambition) out.push({ text: `We encourage ${first}'s dream of becoming ${/^[aeiou]/i.test(prof.ambition) ? "an" : "a"} ${prof.ambition.toLowerCase()}.`,
            rule: "The student's own ambition from About me", data: prof.ambition });
        if (!out.length) out.push({ text: `${first} is settling in well. Notes will be added as the term progresses.`, rule: "No data yet", data: "-" });
        return out;
    }
    function draftRemark(sid, term) { return insights(sid, term).remark.map((p) => p.text).join(" "); }

    // ---------------------------------------------------------------------
    // Pipeline status for a class (what's left)
    // ---------------------------------------------------------------------
    function pipeline(classId, exam, term) {
        const c = cls(classId); const studs = studentsOf(classId); const n = studs.length || 1;
        const hpcSubs = FW.subjectsForGrade(c.grade).filter((s) => s.hpc).map((s) => s.name);
        const ps = state.papers.filter((p) => p.classId === classId && p.exam === exam);
        const published = hpcSubs.filter((sub) => ps.some((p) => p.hpcSubject === sub && p.status === "published")).length;
        const pubPapers = ps.filter((p) => p.status === "published");
        let graded = 0;
        pubPapers.forEach((p) => studs.forEach((s) => { const r = paperResult(p, s.id); if (r && r.complete) graded++; }));
        const gradeTotal = pubPapers.length * studs.length;
        const rated = studs.filter((s) => teacherRatedComplete(s.id, term)).length;
        const self = studs.filter((s) => selfDone(s.id, term)).length;
        const parent = studs.filter((s) => parentDone(s.id, term)).length;
        const pub = studs.filter((s) => ((state.remarks[term] || {})[s.id] || {}).status === "published").length;
        return {
            papers: { done: published, total: hpcSubs.length, drafts: ps.filter((p) => p.status === "draft").length },
            marks: { done: graded, total: gradeTotal },
            teacher: { done: rated, total: studs.length },
            self: { done: self, total: studs.length },
            parent: { done: parent, total: studs.length },
            published: { done: pub, total: studs.length },
            n
        };
    }

    window.Store = {
        get db() { return state; },
        load, save, reset, uid, clone, round1, rng,
        cls, className, student, studentsOf, staff, paper, stageOf, levelsOf, examById, examsOfTerm, libFor, loIndex,
        units, qMarks, secMax, breakdown, paperResult, papersFor, subjectResult, termResult, resultFor, results, resultById, reportResult, resultExams, resultProblems,
        exams, mistakesOf, toggleMistake, classStats, academicInsights, INSIGHT_RULES, parseScheme, schemeFromOutcomes, convert, gradeFor, loMastery,
        H, mean, domainScores, teacherRatedComplete, selfDone, parentDone, suggestion, draftRemark, pipeline,
        insights, remarkParts, LEVEL_CUTS, NEXT_BELOW
    };
})();
