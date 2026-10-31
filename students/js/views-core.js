// revU HPC - Core views: dashboard, students, student 360, inputs tracker, settings.
(function () {
    "use strict";
    const { icon, esc, $, $$, avatar, pct, fmt, lvlChip, toast, modal } = UI;
    const FW = HPC_FW;
    const V = App.views;

    const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

    // ---------------------------------------------------------------------
    // Dashboard - one screen that answers "what's left?"
    // ---------------------------------------------------------------------
    V.home = (root) => {
        const db = Store.db; const me = App.me(); const ctx = App.ctx;
        const classes = App.myClasses();
        const exam = Store.examById(ctx.exam);
        const studs = classes.flatMap((c) => Store.studentsOf(c.id));
        const pipes = classes.map((c) => ({ c, p: Store.pipeline(c.id, ctx.exam, ctx.term) }));
        const sum = (k) => pipes.reduce((s, x) => s + x.p[k].done, 0);
        const tot = (k) => pipes.reduce((s, x) => s + x.p[k].total, 0);

        const steps = [
            ["papers", "Papers", "builder", "papers", "Build"],
            ["marks", "Marks", "grader", "marks", "Enter"],
            ["teacher", "Growth ratings", "holistic", "growth", "Rate"],
            ["self", "Self check-in", "smile3", "voices", "Collect"],
            ["parent", "Parent voice", "voices", "voices", "Collect"],
            ["published", "Reports sent", "card", "reports", "Publish"]
        ];

        const cls = App.ensureClass();
        const term = ctx.term;
        const L = cls ? Store.levelsOf(cls) : [];
        const st = cls ? Store.stageOf(cls) : null;
        const domainRows = cls ? st.domains.map((d) => {
            const counts = L.map(() => 0);
            Store.studentsOf(cls.id).forEach((s) => { const v = Store.domainScores(s.id, term).find((x) => x.domain.id === d.id); if (v && v.teacher != null) counts[Math.round(v.teacher)]++; });
            return { d, counts };
        }) : [];
        const attention = cls ? Store.studentsOf(cls.id).map((s) => {
            const ds = Store.domainScores(s.id, term).filter((d) => d.teacher != null);
            const avg = ds.length ? Store.mean(ds.map((d) => d.teacher)) : null;
            const low = ds.filter((d) => d.teacher < 0.6).map((d) => d.domain.name);
            const att = (db.attendance[term] || {})[s.id];
            const ap = att && att.total ? (att.present / att.total) * 100 : 100;
            return { s, avg, low, ap };
        }).filter((x) => x.low.length >= 2 || x.ap < 85).slice(0, 6) : [];

        root.innerHTML = `
        <div class="view-header">
            <div><h2>${greet()}, ${esc(me.name.replace(/^Dr\.\s+/, "Dr. ").split(" ").slice(0, 2).join(" "))}</h2>
            <span class="subtitle">${esc(exam.name)} - ${esc(term)} - Session ${esc(db.institution.session)}. Here's what's left before reports go out.</span></div>
            <div class="actions">${App.examSelect()}${App.termSelect()}</div>
        </div>

        <div class="grid grid-4">
            <div class="card stat"><span class="k">Students</span><span class="v">${studs.length}</span><span class="s">${classes.length} class${classes.length === 1 ? "" : "es"}</span></div>
            <div class="card stat"><span class="k">Papers ready (${esc(exam.name)})</span><span class="v">${sum("papers")}<small class="muted" style="font-size:16px">/${tot("papers")}</small></span><div class="progress"><span style="width:${pct(sum("papers"), tot("papers"))}%"></span></div></div>
            <div class="card stat"><span class="k">Marks entered</span><span class="v">${pct(sum("marks"), tot("marks"))}%</span><div class="progress"><span style="width:${pct(sum("marks"), tot("marks"))}%"></span></div></div>
            <div class="card stat"><span class="k">Reports sent (${esc(term)})</span><span class="v">${sum("published")}<small class="muted" style="font-size:16px">/${tot("published")}</small></span><div class="progress"><span style="width:${pct(sum("published"), tot("published"))}%"></span></div></div>
        </div>

        <div class="card mt-16">
            <div class="card-head"><h3>What's left, class by class</h3><span class="hint">Each step links straight to the screen that finishes it.</span></div>
            ${pipes.map(({ c, p }) => `
                <div style="border-bottom:1px solid var(--border-color)">
                    <div class="row-between" style="padding:12px 20px 0"><div class="row"><b>${esc(Store.className(c))}</b><span class="badge badge-blue">${esc(Store.stageOf(c).name)}</span><span class="muted small">Class teacher: ${esc((Store.staff(c.classTeacherId) || {}).name || "-")}</span></div>
                    ${p.papers.drafts ? `<span class="badge badge-warn">${icon("alert")}${p.papers.drafts} draft paper${p.papers.drafts > 1 ? "s" : ""}</span>` : ""}</div>
                    <div class="pipeline">
                    ${steps.map(([k, label, ic, route, cta]) => {
                        const v = p[k]; const done = v.total && v.done >= v.total;
                        return `<div class="pipe-step">
                            <span class="t"><span class="step-dot ${done ? "done" : ""}">${done ? icon("check") : ""}</span>${label}</span>
                            <span class="n">${v.done}<small> / ${v.total}</small></span>
                            <div class="progress"><span style="width:${pct(v.done, v.total)}%;${done ? "" : "background:var(--color-accent)"}"></span></div>
                            ${done ? `<span class="small muted">Done</span>` : `<a class="btn btn-sm" href="#/${route}" data-class="${c.id}">${cta}${icon("arrow")}</a>`}
                        </div>`;
                    }).join("")}
                    </div>
                </div>`).join("") || `<div class="empty"><h4>No classes assigned</h4>Ask your coordinator to assign a class.</div>`}
        </div>

        ${cls ? `
        <div class="grid grid-main-side mt-16">
            <div class="card">
                <div class="card-head"><h3>Growth profile - ${esc(Store.className(cls))}</h3>${App.myClasses().length > 1 ? `<div style="min-width:220px">${App.classSelect("dash-class")}</div>` : ""}</div>
                <div class="card-body">
                    <div class="row" style="margin-bottom:12px">${L.map((l, i) => lvlChip(L, i)).join("")}<span class="muted small">Teacher ratings, ${esc(term)}</span></div>
                    <table class="table" style="border:0"><tbody>
                    ${domainRows.map(({ d, counts }) => `<tr><td style="width:38%"><div class="row" style="gap:8px">${icon(d.icon, "")}<span>${esc(d.name)}</span></div></td><td>${UI.levelBar(L, counts, d.name)}</td><td class="num muted small nowrap" style="width:90px">${counts.reduce((a, b) => a + b, 0)} rated</td></tr>`).join("")}
                    </tbody></table>
                </div>
            </div>
            <div class="card">
                <div class="card-head"><h3>Needs attention</h3><span class="hint">2+ low domains or attendance under 85%</span></div>
                <div class="list">
                ${attention.length ? attention.map((x) => `<a class="list-item" href="#/student/${x.s.id}" style="text-decoration:none;color:inherit">${avatar(x.s)}<div class="grow"><div class="title">${esc(x.s.name)}</div><div class="sub">${x.low.length ? esc(x.low.slice(0, 2).join(", ")) : ""}${x.ap < 85 ? `${x.low.length ? " - " : ""}Attendance ${Math.round(x.ap)}%` : ""}</div></div>${icon("arrow", "")}</a>`).join("") : `<div class="empty">Nobody flagged right now.</div>`}
                </div>
            </div>
        </div>` : ""}
        `;
        App.bindCtx(root);
        $$("a[data-class]", root).forEach((a) => a.addEventListener("click", () => App.setCtx({ classId: a.dataset.class })));
    };

    // ---------------------------------------------------------------------
    // Students list
    // ---------------------------------------------------------------------
    V.students = (root) => {
        const cls = App.ensureClass(); const term = App.ctx.term;
        if (!cls) { root.innerHTML = `<div class="empty"><h4>No class assigned</h4></div>`; return; }
        const L = Store.levelsOf(cls);
        const studs = Store.studentsOf(cls.id);
        const exams = Store.examsOfTerm(term).map((e) => e.id);
        const subjects = [...new Set(Store.db.papers.filter((p) => p.classId === cls.id && exams.includes(p.exam) && p.status === "published").map((p) => p.hpcSubject))];
        root.innerHTML = `
        <div class="view-header"><div><h2>Students</h2><span class="subtitle">Every learner at a glance - marks, growth and what's still missing.</span></div>
        <div class="actions">${App.classSelect()}${App.termSelect()}</div></div>
        <div class="table-wrap"><table class="table">
            <thead><tr><th class="sticky-col">Roll</th><th>Student</th><th class="num">Marks avg</th><th>Growth</th><th>Teacher</th><th>Self</th><th>Parent</th><th>Report</th><th></th></tr></thead>
            <tbody>${studs.map((s) => {
                const pcts = [];
                subjects.forEach((sub) => exams.forEach((ex) => { const r = Store.subjectResult(cls.id, ex, sub, s.id); if (r && r.any && !r.ab && r.mainMax) pcts.push((r.main / r.mainMax) * 100); }));
                const avg = pcts.length ? Store.mean(pcts) : null;
                const ds = Store.domainScores(s.id, term).filter((d) => d.teacher != null);
                const hol = ds.length ? Store.mean(ds.map((d) => d.teacher)) : null;
                const rem = (Store.db.remarks[term] || {})[s.id];
                const ok = (b) => (b ? `<span class="badge badge-green">${icon("check")}Done</span>` : `<span class="badge badge-gray">Pending</span>`);
                return `<tr>
                    <td class="sticky-col num">${s.roll}</td>
                    <td><a href="#/student/${s.id}" class="row" style="gap:10px;text-decoration:none;color:inherit;flex-wrap:nowrap">${avatar(s, 28)}<b>${esc(s.name)}</b></a></td>
                    <td class="num">${avg == null ? "-" : `${Math.round(avg)}% <span class="muted small">${Store.gradeFor(avg)}</span>`}</td>
                    <td>${lvlChip(L, hol)}</td>
                    <td>${ok(Store.teacherRatedComplete(s.id, term))}</td><td>${ok(Store.selfDone(s.id, term))}</td><td>${ok(Store.parentDone(s.id, term))}</td>
                    <td>${rem && rem.status === "published" ? `<span class="badge badge-green">Published</span>` : rem ? `<span class="badge badge-yellow">Draft</span>` : `<span class="badge badge-gray">Not started</span>`}</td>
                    <td class="nowrap"><a class="btn btn-sm" href="#/student/${s.id}">360°</a> <a class="btn btn-sm" href="#/report/${s.id}">Report</a></td>
                </tr>`;
            }).join("")}</tbody>
        </table></div>`;
        App.bindCtx(root);
    };

    // ---------------------------------------------------------------------
    // Student 360 profile
    // ---------------------------------------------------------------------
    V.student = (root, [sid]) => {
        const s = Store.student(sid);
        if (!s) { root.innerHTML = `<div class="empty"><h4>Student not found</h4></div>`; return; }
        const db = Store.db; const cls = Store.cls(s.classId); const term = App.ctx.term; const L = Store.levelsOf(cls); const st = Store.stageOf(cls);
        const ds = Store.domainScores(sid, term);
        const prevTerm = term === "Term 2" ? "Term 1" : null;
        const prev = prevTerm ? Store.domainScores(sid, prevTerm) : null;
        const norm = (v) => (v == null ? null : (v + 1) / L.length);
        const lab = (v) => (v == null ? "Not yet" : L[Math.round(v)].label);
        const series = [
            { name: "Teacher", color: "var(--series-1)", values: ds.map((d) => norm(d.teacher)), labels: ds.map((d) => lab(d.teacher)) },
            { name: "Self", color: "var(--series-2)", values: ds.map((d) => norm(d.self)), labels: ds.map((d) => lab(d.self)), fill: 0.05 },
            { name: "Parent", color: "var(--series-3)", values: ds.map((d) => norm(d.parent)), labels: ds.map((d) => lab(d.parent)), fill: 0.05, dash: true }
        ];
        const lom = Store.loMastery(sid, term);
        const loIdx = Store.loIndex(cls.grade);
        const bySubject = {};
        Object.entries(lom).forEach(([lo, v]) => { const info = loIdx[lo]; if (!info) return; (bySubject[info.subject] = bySubject[info.subject] || []).push({ info, v }); });
        const obs = db.observations.filter((o) => o.sid === sid).sort((a, b) => b.date.localeCompare(a.date));
        const prof = db.profiles[sid] || {};
        const att = (db.attendance[term] || {})[sid];

        root.innerHTML = `
        <div class="crumb no-print"><a href="#/students">Students</a> / ${esc(Store.className(cls))}</div>
        <div class="view-header">
            <div class="row" style="gap:14px">${avatar(s, 52)}<div><h2>${esc(s.name)}</h2><span class="subtitle">Roll ${s.roll} - ${esc(Store.className(cls))} - ${esc(st.name)} - ${esc(s.house)} House${att ? ` - Attendance ${att.present}/${att.total}` : ""}</span></div></div>
            <div class="actions">${App.termSelect()}<button class="btn" id="btn-obs">${icon("plus")}Add note</button><a class="btn btn-primary" href="#/report/${sid}">${icon("card")}Open report</a></div>
        </div>
        <div class="grid grid-2">
            <div class="card">
                <div class="card-head"><h3>360° view</h3>${UI.legend(series.map((x) => ({ name: x.name, color: x.color, dash: x.dash })))}</div>
                <div class="card-body" style="max-width:420px;margin:0 auto">${UI.radar({ axes: ds.map((d) => d.domain.name), series, size: 380, levels: L.length })}</div>
            </div>
            <div class="card">
                <div class="card-head"><h3>Domains</h3><span class="hint">${prevTerm ? `vs ${prevTerm}` : ""}</span></div>
                <div class="table-wrap" style="border:0;border-radius:0"><table class="table"><thead><tr><th>Domain</th><th>Teacher</th><th>Self</th><th>Peer</th><th>Parent</th>${prev ? "<th>Change</th>" : ""}</tr></thead><tbody>
                ${ds.map((d, i) => {
                    const ch = prev && prev[i].teacher != null && d.teacher != null ? d.teacher - prev[i].teacher : null;
                    return `<tr><td><b>${esc(d.domain.name)}</b></td><td>${lvlChip(L, d.teacher)}</td><td>${lvlChip(L, d.self)}</td><td>${lvlChip(L, d.peer)}</td><td>${lvlChip(L, d.parent)}</td>
                    ${prev ? `<td class="small strong" style="color:${ch == null ? "var(--text-subtle)" : ch > 0.2 ? "var(--color-primary)" : ch < -0.2 ? "var(--color-danger)" : "var(--text-subtle)"}">${ch == null ? "-" : ch > 0.2 ? "▲ Up" : ch < -0.2 ? "▼ Down" : "Steady"}</td>` : ""}</tr>`;
                }).join("")}
                </tbody></table></div>
            </div>
        </div>
        <div class="grid grid-2 mt-16">
            <div class="card">
                <div class="card-head"><h3>Outcomes achieved</h3><span class="hint">From question-level marks, ${esc(term)}</span></div>
                <div class="card-body">
                ${Object.keys(bySubject).length ? Object.entries(bySubject).map(([sub, arr]) => `
                    <div style="margin-bottom:12px"><div class="strong" style="margin-bottom:6px">${esc(sub)}</div>
                    ${arr.sort((a, b) => a.info.code.localeCompare(b.info.code)).map(({ info, v }) => `<div class="row-between" style="padding:4px 0;border-bottom:1px dashed var(--border-color)"><span class="small"><span class="code">${esc(info.code)}</span> ${esc(info.text)}</span><span class="row" style="gap:6px;flex-wrap:nowrap"><span class="small muted num">${v.pct}%</span>${lvlChip(L, v.lvl)}</span></div>`).join("")}</div>`).join("") : `<div class="empty">No graded papers in ${esc(term)} yet.</div>`}
                </div>
            </div>
            <div class="stack">
                <div class="card">
                    <div class="card-head"><h3>About me</h3><span class="hint">Filled by the student</span></div>
                    <div class="card-body">
                        <p>${esc(prof.aboutMe || "-")}</p>
                        <div class="row mt-8"><span class="badge badge-yellow">${icon("star")}Wants to be: ${esc(prof.ambition || "-")}</span>${(prof.interests || []).map((i) => `<span class="badge badge-gray">${esc(i)}</span>`).join("")}</div>
                        ${(prof.goals || []).length ? `<div class="mt-8 small"><b>Goals this year:</b> ${prof.goals.map(esc).join(" - ")}</div>` : ""}
                    </div>
                </div>
                <div class="card">
                    <div class="card-head"><h3>Notes</h3><span class="hint">${obs.length} anecdotal note${obs.length === 1 ? "" : "s"}</span></div>
                    <div class="list">${obs.length ? obs.slice(0, 6).map((o) => { const d = st.domains.find((x) => x.id === o.domId); return `<div class="list-item"><div class="grow"><div class="title small">${esc(o.note)}</div><div class="sub">${esc(d ? d.name : "")} - ${esc(o.date)} - ${esc(o.term)}</div></div>${o.lvl != null ? lvlChip(L, o.lvl) : ""}</div>`; }).join("") : `<div class="empty">No notes yet.</div>`}</div>
                </div>
            </div>
        </div>`;
        App.bindCtx(root);
        $("#btn-obs", root).addEventListener("click", () => V.captureModal([sid]));
    };

    // ---------------------------------------------------------------------
    // Self, peer & parent input tracker (teacher view)
    // ---------------------------------------------------------------------
    V.voices = (root) => {
        const cls = App.ensureClass(); const term = App.ctx.term;
        if (!cls) { root.innerHTML = `<div class="empty"><h4>No class assigned</h4></div>`; return; }
        const studs = Store.studentsOf(cls.id); const h = Store.H(term); const st = Store.stageOf(cls);
        const selfN = studs.filter((s) => Store.selfDone(s.id, term)).length;
        const parN = studs.filter((s) => Store.parentDone(s.id, term)).length;
        const peerN = studs.filter((s) => Object.keys(h.peer[s.id] || {}).length).length;
        const young = st.id === "foundational";
        root.innerHTML = `
        <div class="view-header"><div><h2>Voices</h2><span class="subtitle">Students and parents fill their part from their own login. ${young ? "Young learners can tap faces with you - use <b>Record with child</b>." : "You only need to chase what is pending."}</span></div>
        <div class="actions">${App.classSelect()}${App.termSelect()}</div></div>
        <div class="grid grid-3">
            <div class="card stat"><span class="k">Self check-in</span><span class="v">${selfN}/${studs.length}</span><div class="progress"><span style="width:${pct(selfN, studs.length)}%;background:var(--series-2)"></span></div></div>
            <div class="card stat"><span class="k">Peer feedback received</span><span class="v">${peerN}/${studs.length}</span><div class="progress"><span style="width:${pct(peerN, studs.length)}%;background:var(--series-2)"></span></div></div>
            <div class="card stat"><span class="k">Parent feedback</span><span class="v">${parN}/${studs.length}</span><div class="progress"><span style="width:${pct(parN, studs.length)}%;background:var(--series-3)"></span></div></div>
        </div>
        <div class="alert alert-info mt-16">${icon("info")}<div class="body">Parents get a single link per term. They see the published card and answer ${st.domains.length} one-tap questions - no login juggling, no forms to print.</div></div>
        <div class="table-wrap mt-16"><table class="table">
            <thead><tr><th>Roll</th><th>Student</th><th>Self</th><th>Peer</th><th>Parent</th><th class="num">Actions</th></tr></thead>
            <tbody>${studs.map((s) => {
                const sd = Store.selfDone(s.id, term), pd = Store.parentDone(s.id, term), pe = Object.keys(h.peer[s.id] || {}).length;
                return `<tr><td class="num">${s.roll}</td><td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(s, 26)}${esc(s.name)}</div></td>
                <td>${sd ? `<span class="badge badge-green">${icon("check")}Done</span>` : `<span class="badge badge-gray">Pending</span>`}</td>
                <td>${pe ? `<span class="badge badge-green">${icon("check")}${(Object.values(h.peer[s.id])[0] || []).length} peers</span>` : `<span class="badge badge-gray">Pending</span>`}</td>
                <td>${pd ? `<span class="badge badge-green">${icon("check")}Done</span>` : `<span class="badge badge-gray">Pending</span>`}</td>
                <td class="num nowrap">${!sd ? `<button class="btn btn-sm" data-self="${s.id}">${young ? "Record with child" : "Record self"}</button>` : ""} ${!pd ? `<button class="btn btn-sm" data-parent="${s.id}">Enter parent form</button> <button class="btn btn-sm btn-ghost" data-link="${s.id}" title="Copy parent link">${icon("copy")}</button>` : ""}</td></tr>`;
            }).join("")}</tbody></table></div>`;
        App.bindCtx(root);
        $$("[data-self]", root).forEach((b) => b.addEventListener("click", () => V.voiceModal("self", b.dataset.self, () => V.voices(root))));
        $$("[data-parent]", root).forEach((b) => b.addEventListener("click", () => V.voiceModal("parent", b.dataset.parent, () => V.voices(root))));
        $$("[data-link]", root).forEach((b) => b.addEventListener("click", () => {
            const link = `${location.origin}${location.pathname}#/parent-feedback?child=${b.dataset.link}`;
            (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast("Parent link copied")).catch(() => toast(link, "ok"));
        }));
    };

    // Modal to record self or parent responses on someone's behalf
    V.voiceModal = (kind, sid, done) => {
        const s = Store.student(sid); const cls = Store.cls(s.classId); const st = Store.stageOf(cls); const L = Store.levelsOf(cls); const term = App.ctx.term;
        const labels = kind === "self" ? FW.SELF_SCALES[st.levelSet] : L.map((l) => l.label);
        const faces = L.length === 4 ? ["smile1", "smile2", "smile3", "smile4"] : ["smile1", "smile2", "smile4"];
        const cur = Object.assign({}, (Store.H(term)[kind][sid]) || {});
        modal({
            title: `${kind === "self" ? "Self check-in" : "Parent voice"} - ${s.name}`, wide: true,
            body: `<div class="card" style="box-shadow:none">${st.domains.map((d) => `<div class="self-q"><div><div class="stmt">${esc(kind === "self" ? d.self : d.parent)}</div><div class="dom">${esc(d.name)}</div></div>
                <div class="face-opts" data-dom="${d.id}">${labels.map((lb, i) => `<button type="button" class="face ${cur[d.id] === i ? "on" : ""}" data-v="${i}">${icon(faces[i])}${esc(lb)}</button>`).join("")}</div></div>`).join("")}</div>`,
            foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
            onMount: (m) => {
                $$(".face-opts", m.el).forEach((g) => g.addEventListener("click", (e) => { const b = e.target.closest(".face"); if (!b) return; cur[g.dataset.dom] = Number(b.dataset.v); $$(".face", g).forEach((x) => x.classList.toggle("on", x === b)); }));
                $("[data-save]", m.el).addEventListener("click", () => {
                    const missing = st.domains.filter((d) => cur[d.id] == null).length;
                    if (missing) { toast(`${missing} question${missing > 1 ? "s" : ""} still unanswered`, "err"); return; }
                    Store.H(term)[kind][sid] = cur; Store.save(); m.close(); toast("Saved"); if (done) done();
                });
            }
        });
    };

    // ---------------------------------------------------------------------
    // Settings (admin)
    // ---------------------------------------------------------------------
    // Exams & results editor. Exams are the school calendar; results link exams (and other
    // results) into scaled totals - e.g. PT1 40 -> 10, Half-Yearly -> 30 of the Annual.
    function resultsEditor(host) {
        const db = Store.db;
        const draft = { exams: Store.clone(Store.exams()), results: Store.clone(Store.results()) };
        let dirty = false;
        const TERMS = ["Term 1", "Term 2"];
        const slug = (t, taken) => { let b = String(t).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10) || "x"; let k = b, i = 2; while (taken.includes(k)) k = b + i++; return k; };
        const examName = (id) => (draft.exams.find((e) => e.id === id) || { name: `(deleted: ${id})` }).name;
        const resName = (id) => (draft.results.find((r) => r.id === id) || { name: `(deleted result)` }).name;
        const papersOf = (exId) => db.papers.filter((p) => p.exam === exId).length;

        const problems = () => {
            const out = [];
            const names = draft.exams.map((e) => e.name.trim().toLowerCase());
            if (names.some((n) => !n)) out.push("Every exam needs a name.");
            const dupName = names.find((n, i) => n && names.indexOf(n) !== i);
            if (dupName) out.push(`Two exams are called "${dupName}".`);
            draft.results.forEach((r) => r.parts.forEach((p) => {
                if (p.src === "exam" && !draft.exams.some((e) => e.id === p.ref)) out.push(`"${r.name}" uses an exam that no longer exists.`);
                if (p.src === "result" && !draft.results.some((x) => x.id === p.ref)) out.push(`"${r.name}" uses a result that no longer exists.`);
            }));
            // loop / double counting checks use the same rules as the engine
            const saved = { e: db.exams, r: db.results }; db.exams = draft.exams;
            try { out.push(...Store.resultProblems(draft.results)); } finally { db.exams = saved.e; }
            return [...new Set(out)];
        };
        const sourceOptions = (r, p) => {
            const opts = draft.exams.map((e) => [`exam:${e.id}`, `Exam - ${e.name} (core sections)`]);
            opts.push(["fields:*", "Extra sections of the exams in this result"]);
            draft.exams.forEach((e) => opts.push([`fields:${e.id}`, `Extra sections - ${e.name} only`]));
            draft.results.filter((x) => x.id !== r.id).forEach((x) => opts.push([`result:${x.id}`, `Result - ${x.name}`]));
            const cur = `${p.src}:${p.ref}`;
            return opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
        };
        const formula = (r) => {
            const sum = r.parts.reduce((s, p) => s + (Number(p.outOf) || 0), 0);
            return `<div class="breakdown" style="font-size:13px">${r.parts.map((p) => `<span class="part ${p.src === "fields" ? "add" : p.src === "result" ? "" : ""}" ${p.src === "result" ? 'style="background:var(--color-accent-soft);color:var(--color-accent)"' : ""}>${esc(p.short || p.label)} ${fmt(Number(p.outOf) || 0)}</span>`).join('<span class="plus">+</span>')}<span class="plus">=</span><span class="part" style="background:var(--color-primary);color:#fff">${fmt(sum)}</span></div>`;
        };

        function render() {
            const issues = problems();
            host.innerHTML = `
            <div class="small strong" style="margin-bottom:6px">Exams <span class="muted" style="font-weight:500">- your school's exam calendar</span></div>
            <div class="table-wrap"><table class="table"><thead><tr><th>Exam</th><th>Short name</th><th>Term</th><th class="num">Papers</th><th></th></tr></thead><tbody>
            ${draft.exams.map((e, i) => `<tr data-ex="${i}">
                <td><input class="input" data-ek="name" value="${esc(e.name)}" style="width:100%;min-width:150px" aria-label="Exam name"></td>
                <td><input class="input" data-ek="short" value="${esc(e.short || "")}" maxlength="10" style="width:110px" aria-label="Short name"></td>
                <td><select class="select" data-ek="term" aria-label="Term">${TERMS.map((t) => `<option ${t === e.term ? "selected" : ""}>${t}</option>`).join("")}</select></td>
                <td class="num">${papersOf(e.id)}</td>
                <td class="num"><button class="btn btn-sm btn-ghost btn-danger" data-exdel="${i}" ${papersOf(e.id) ? 'disabled title="Has papers - cannot delete"' : ""} aria-label="Delete exam">${icon("trash")}</button></td>
            </tr>`).join("")}</tbody></table></div>
            <div class="row mt-8"><button class="btn btn-sm" id="ex-add">${icon("plus")}Add exam</button><span class="small muted">e.g. Half-Yearly, Unit Test 3, Annual. Papers are built per exam.</span></div>

            <div class="small strong" style="margin:22px 0 6px">Results <span class="muted" style="font-weight:500">- link exams into totals. A part can be an exam, the extra sections, or another result.</span></div>
            <div class="stack" style="gap:12px">${draft.results.map((r, ri) => `
                <div class="card" style="box-shadow:none" data-res="${ri}">
                    <div class="card-head" style="gap:10px">
                        <input class="input" data-rk="name" value="${esc(r.name)}" style="font-weight:700;min-width:180px;flex:1;max-width:280px" aria-label="Result name">
                        <label class="small muted" style="display:flex;align-items:center;gap:6px">Shown on
                            <select class="select" data-rk="term" aria-label="Shown on report">${[["", "No report (feeds other results)"]].concat(TERMS.map((t) => [t, `${t} report`])).map(([v, l]) => `<option value="${v}" ${String(r.term || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
                        <span style="flex:1"></span>${formula(r)}
                        <button class="btn btn-sm btn-ghost btn-danger" data-resdel="${ri}" aria-label="Delete result" ${draft.results.some((x) => x.parts.some((p) => p.src === "result" && p.ref === r.id)) ? 'disabled title="Used by another result"' : ""}>${icon("trash")}</button>
                    </div>
                    <div class="table-wrap" style="border:0;border-radius:0"><table class="table"><thead><tr><th>Part (legend)</th><th>Column</th><th>Marks come from</th><th class="num">Scaled to</th><th></th></tr></thead><tbody>
                    ${r.parts.map((p, pi) => `<tr data-pi="${pi}">
                        <td><input class="input" data-pk="label" value="${esc(p.label)}" style="width:100%;min-width:130px" aria-label="Part name"></td>
                        <td><input class="input" data-pk="short" value="${esc(p.short || "")}" maxlength="10" style="width:100px" aria-label="Column header"></td>
                        <td><select class="select" data-pk="source" style="max-width:320px" aria-label="Marks come from">${sourceOptions(r, p)}</select></td>
                        <td class="num"><input class="input num" type="number" min="0.5" step="0.5" data-pk="outOf" value="${esc(p.outOf)}" style="width:80px;text-align:right" aria-label="Scaled to"></td>
                        <td class="num"><button class="btn btn-sm btn-ghost btn-danger" data-pdel="${pi}" ${r.parts.length === 1 ? "disabled" : ""} aria-label="Remove part">${icon("x")}</button></td>
                    </tr>`).join("")}</tbody></table></div>
                    <div class="row" style="padding:8px 16px 12px"><button class="btn btn-sm" data-padd="${ri}">${icon("plus")}Add part</button>
                        <span class="small muted">${r.parts.map((p) => p.src === "exam" ? `${examName(p.ref)} &rarr; ${fmt(Number(p.outOf) || 0)}` : p.src === "result" ? `${esc(resName(p.ref))} &rarr; ${fmt(Number(p.outOf) || 0)}` : `extra sections &rarr; ${fmt(Number(p.outOf) || 0)}`).join(" &middot; ")}</span></div>
                </div>`).join("")}
            </div>
            <div class="row mt-8"><button class="btn btn-sm" id="res-add">${icon("plus")}Add result</button><span class="small muted">e.g. "Half-Yearly" = PT1 &rarr; 10 + Half-Yearly exam &rarr; 80 + Notebook &rarr; 10; "Annual" = Half-Yearly &rarr; 30 + Annual exam &rarr; 70.</span></div>
            <label class="check mt-16"><input type="checkbox" id="tt-abzero" ${db.absentAsZero ? "checked" : ""}> Count an absence as zero <span class="small muted">(off: an absent part shows AB and the grade uses the parts attended)</span></label>
            ${issues.length ? `<div class="alert alert-warn mt-8">${icon("alert")}<div class="body">${issues.map(esc).join("<br>")}</div></div>` : ""}
            <div class="row mt-16"><button class="btn btn-primary" id="res-save" ${issues.length ? "disabled" : ""}>${icon("check")}Save exams & results</button><button class="btn" id="res-default">Reset to default</button>${dirty ? `<span class="small muted">Unsaved changes</span>` : ""}</div>`;

            const change = () => { dirty = true; render(); };
            $$("tr[data-ex]", host).forEach((tr) => { const e = draft.exams[Number(tr.dataset.ex)]; $$("[data-ek]", tr).forEach((el) => el.addEventListener("change", () => { e[el.dataset.ek] = el.value.trim(); change(); })); });
            $$("[data-exdel]", host).forEach((b) => b.addEventListener("click", () => { draft.exams.splice(Number(b.dataset.exdel), 1); change(); }));
            $("#ex-add", host).addEventListener("click", () => { const name = "New exam"; draft.exams.push({ id: slug(name, draft.exams.map((e) => e.id)), name, short: "New", term: TERMS[0] }); change(); });
            $$("[data-res]", host).forEach((card) => {
                const r = draft.results[Number(card.dataset.res)];
                $$("[data-rk]", card).forEach((el) => el.addEventListener("change", () => {
                    if (el.dataset.rk === "term") {
                        const t = el.value || null;
                        if (t) draft.results.forEach((x) => { if (x !== r && x.term === t) x.term = null; });  // one result per report
                        r.term = t;
                    } else r.name = el.value.trim();
                    change();
                }));
                $$("tr[data-pi]", card).forEach((tr) => {
                    const p = r.parts[Number(tr.dataset.pi)];
                    $$("[data-pk]", tr).forEach((el) => el.addEventListener("change", () => {
                        if (el.dataset.pk === "source") {
                            const [src, ref] = el.value.split(":");
                            p.src = src; p.ref = ref;
                            if (src === "exam") { const e = draft.exams.find((x) => x.id === ref); p.label = e.name; p.short = e.short || e.name.slice(0, 10); }
                            if (src === "result") { const x = draft.results.find((y) => y.id === ref); p.label = x.name; p.short = x.name.replace(/\s*result$/i, "").slice(0, 10); }
                            if (src === "fields") { p.label = "Skills"; p.short = ""; }
                        } else if (el.dataset.pk === "outOf") p.outOf = Number(el.value);
                        else p[el.dataset.pk] = el.value.trim();
                        change();
                    }));
                });
                $$("[data-pdel]", card).forEach((b) => b.addEventListener("click", () => { r.parts.splice(Number(b.dataset.pdel), 1); change(); }));
            });
            $$("[data-padd]", host).forEach((b) => b.addEventListener("click", () => {
                const r = draft.results[Number(b.dataset.padd)];
                const used = new Set(r.parts.filter((p) => p.src === "exam").map((p) => p.ref));
                const e = draft.exams.find((x) => !used.has(x.id)) || draft.exams[0];
                r.parts.push({ key: Store.uid("pt"), label: e.name, short: e.short || e.name.slice(0, 10), src: "exam", ref: e.id, outOf: 10 });
                change();
            }));
            $$("[data-resdel]", host).forEach((b) => b.addEventListener("click", () => { draft.results.splice(Number(b.dataset.resdel), 1); change(); }));
            $("#res-add", host).addEventListener("click", () => {
                const e = draft.exams[0];
                draft.results.push({ id: Store.uid("r"), name: "New result", term: null, parts: [{ key: Store.uid("pt"), label: e.name, short: e.short || e.name.slice(0, 10), src: "exam", ref: e.id, outOf: 100 }] });
                change();
            });
            $("#tt-abzero", host).addEventListener("change", (e) => { db.absentAsZero = e.target.checked; Store.save(true); toast(e.target.checked ? "Absences now count as zero" : "Absent parts are left out of the grade"); });
            $("#res-default", host).addEventListener("click", () => { draft.exams = Store.clone(FW.EXAMS).concat(draft.exams.filter((e) => !FW.EXAMS.some((d) => d.id === e.id) && papersOf(e.id))); draft.results = Store.clone(FW.RESULTS); change(); });
            $("#res-save", host).addEventListener("click", () => {
                if (problems().length) return;
                db.exams = Store.clone(draft.exams); db.results = Store.clone(draft.results);
                if (!db.exams.some((e) => e.id === db.institution.activeExam)) db.institution.activeExam = db.exams[0].id;
                Store.save(true); dirty = false; render(); toast("Exams & results saved - reports use them now");
            });
        }
        render();
    }

    V.settings = (root) => {
        const db = Store.db; const inst = db.institution;
        root.innerHTML = `
        <div class="view-header"><div><h2>Settings</h2><span class="subtitle">Institution profile, the current examination and how extra sections show on reports.</span></div></div>
        <div class="grid grid-2">
            <div class="card"><div class="card-head"><h3>Institution</h3></div><div class="card-body stack">
                <div class="field"><label for="set-name">Institution name</label><input class="input" id="set-name" value="${esc(inst.name)}"></div>
                <div class="grid grid-2"><div class="field"><label for="set-short">Short name (header)</label><input class="input" id="set-short" value="${esc(inst.short)}"></div>
                <div class="field"><label for="set-session">Academic session</label><input class="input" id="set-session" value="${esc(inst.session)}"></div></div>
                <div class="grid grid-2"><div class="field"><label for="set-type">Institution type</label><select class="select" id="set-type">
                    <option value="school" ${inst.type === "school" ? "selected" : ""}>School (K-12)</option>
                    <option value="higher" ${inst.type === "higher" ? "selected" : ""}>College / University</option></select>
                    <span class="help">Changes grading scale and level descriptors.</span></div>
                <div class="field"><label for="set-city">City</label><input class="input" id="set-city" value="${esc(inst.city || "")}"></div></div>
                <div class="field"><label for="set-cardtitle">Report title</label><input class="input" id="set-cardtitle" value="${esc(inst.cardTitle || "Progress Report")}"><span class="help">Printed at the top of every report - e.g. "Holistic Progress Card" for NEP schools.</span></div>
                <div class="grid grid-2">
                    <div class="field"><label for="set-exam">Current examination</label><select class="select" id="set-exam">${Store.exams().map((e) => `<option value="${e.id}" ${e.id === inst.activeExam ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select></div>
                    <div class="field"><label for="set-term">Current term</label><select class="select" id="set-term">${["Term 1", "Term 2"].map((t) => `<option ${t === inst.activeTerm ? "selected" : ""}>${t}</option>`).join("")}</select></div>
                </div>
                <div><button class="btn btn-primary" id="set-save">${icon("check")}Save institution</button></div>
            </div></div>

            <div class="card"><div class="card-head"><h3>Report fields</h3><span class="hint">Each field reads its own section total - never the paper total.</span></div><div class="card-body stack">
                <p class="small muted">If a paper marks Notebook out of 2 but the report shows Notebook out of 5, the student's mark is scaled automatically (1.5/2 becomes 3.8/5).</p>
                <table class="table" style="border:1px solid var(--border-color);border-radius:8px"><thead><tr><th>Field</th><th>Used in</th><th class="num">Shown out of</th></tr></thead><tbody>
                ${Object.values(FW.COMPONENTS).map((c) => `<tr><td><b>${esc(c.label)}</b>${c.key === "enrichment" ? `<div class="small muted">ASL, Maths Lab, Practical, Project Work</div>` : ""}</td><td class="small">${c.group === "Skills" ? "Grades 1-5" : "Grades 6-8"}</td><td class="num"><input class="input" type="number" min="1" max="100" style="width:80px;text-align:right" data-cmax="${c.key}" value="${db.componentMax[c.key]}"></td></tr>`).join("")}
                </tbody></table>
                <div><button class="btn btn-primary" id="set-comp">${icon("check")}Save fields</button></div>
            </div></div>
        </div>
        <div class="card mt-16">
            <div class="card-head"><h3>Exams & results</h3><span class="hint">Your exam calendar, and how exams link into the totals on each report.</span></div>
            <div class="card-body" id="tt-body"></div>
        </div>
        <div class="grid grid-2 mt-16">
            <div class="card"><div class="card-head"><h3>Stages & growth ladder</h3></div><div class="card-body stack">
                ${Object.values(FW.STAGES).map((st) => `<div><div class="row-between"><b>${esc(st.name)}</b><span class="small muted">${esc(st.grades)} - ${st.domains.length} domains</span></div><div class="row mt-8">${FW.LEVELS[st.levelSet].map((l, i, arr) => lvlChip(arr, i)).join("")}</div></div>`).join("")}
            </div></div>
            <div class="card"><div class="card-head"><h3>Data</h3></div><div class="card-body stack">
                <p class="small muted">This build keeps data in this browser. Export a backup before clearing browser data. The schema maps one-to-one to a server database when you move to multi-user hosting.</p>
                <div class="row"><button class="btn" id="data-export">${icon("download")}Export backup (JSON)</button><button class="btn" id="data-import">${icon("upload")}Import backup</button></div>
                <div class="row"><button class="btn btn-danger" id="data-reset">${icon("trash")}Reset to demo data</button></div>
            </div></div>
        </div>`;
        $("#set-save", root).addEventListener("click", () => {
            Object.assign(inst, { name: $("#set-name").value.trim() || inst.name, short: $("#set-short").value.trim() || inst.short, session: $("#set-session").value.trim(), type: $("#set-type").value, city: $("#set-city").value.trim(), cardTitle: $("#set-cardtitle").value.trim() || "Progress Report", activeExam: $("#set-exam").value, activeTerm: $("#set-term").value });
            App.setCtx({ exam: inst.activeExam, term: inst.activeTerm });
            Store.save(); toast("Institution saved"); App.render();
        });
        $("#set-comp", root).addEventListener("click", () => {
            $$("[data-cmax]", root).forEach((i) => { const v = Number(i.value); if (v > 0) db.componentMax[i.dataset.cmax] = v; });
            Store.save(); toast("Conversions saved");
        });
        resultsEditor($("#tt-body", root));
        $("#data-export", root).addEventListener("click", () => UI.download(`revu-hpc-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 1), "application/json"));
        $("#data-import", root).addEventListener("click", async () => {
            const f = await UI.pickFile(".json"); if (!f) return;
            try { const data = JSON.parse(await f.text()); if (data.version !== 1 || !data.papers) throw new Error("Not a revU backup"); localStorage.setItem("revu_hpc_v1", JSON.stringify(data)); Store.load(); toast("Backup restored"); App.render(); }
            catch (e) { toast(e.message, "err"); }
        });
        $("#data-reset", root).addEventListener("click", async () => {
            if (await UI.confirmBox("Reset demo data?", "All papers, marks and ratings in this browser will be replaced by the demo dataset.", "Reset")) { Store.reset(); App.setCtx({ classId: "c-7a", exam: Store.db.institution.activeExam, term: Store.db.institution.activeTerm }); toast("Demo data restored"); App.render(); }
        });
    };
})();
