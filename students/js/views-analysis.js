// revU - Exam analysis: how a class did on one paper, the moment marks are in.
// Questions, outcomes, mistakes and every student's change since the previous exam.
(function () {
    "use strict";
    const { icon, esc, $, $$, fmt, lvlChip, toast } = UI;
    const FW = HPC_FW;
    const V = App.views;

    // Everything the page and its download need, computed once
    function analyse(p) {
        const cls = Store.cls(p.classId); const L = Store.levelsOf(cls);
        const studs = Store.studentsOf(cls.id);
        const us = Store.units(p);
        const b = Store.breakdown(p);
        const book = Store.db.marks[p.id] || {};
        const cuts = Store.LEVEL_CUTS[L.length] || Store.LEVEL_CUTS[3];
        const lvlOf = (pct) => cuts.filter((c) => pct >= c).length;
        const loIdx = Store.loIndex(cls.grade);

        // Previous exam for the same subject: the closest earlier exam with a published paper
        const order = Store.exams().map((e) => e.id);
        const prevPaper = Store.db.papers.filter((x) => x.classId === p.classId && x.hpcSubject === p.hpcSubject && x.status === "published" && order.indexOf(x.exam) < order.indexOf(p.exam))
            .sort((a, c) => order.indexOf(c.exam) - order.indexOf(a.exam))[0];
        const corePct = (paper, sid) => { const r = Store.paperResult(paper, sid); const bb = Store.breakdown(paper); return r && r.complete && !r.ab && bb.main ? (r.main / bb.main) * 100 : null; };

        const students = studs.map((s) => {
            const r = Store.paperResult(p, s.id);
            const pct = corePct(p, s.id);
            const prev = prevPaper ? corePct(prevPaper, s.id) : null;
            const tags = {};
            Object.values(Store.mistakesOf(p.id, s.id)).forEach((ts) => ts.forEach((t) => { tags[t] = (tags[t] || 0) + 1; }));
            const topTag = Object.entries(tags).sort((a, c) => c[1] - a[1])[0];
            return { s, r, pct, grade: pct == null ? null : Store.gradeFor(pct), ab: !!(r && r.ab), marked: !!(r && r.complete), prev, change: pct != null && prev != null ? pct - prev : null, topTag: topTag ? topTag[0] : null };
        });
        const marked = students.filter((x) => x.marked && !x.ab && x.pct != null);
        const avg = marked.length ? Store.mean(marked.map((x) => x.pct)) : null;

        const questions = us.map((u) => {
            const vals = marked.map((x) => Number((book[x.s.id] || { m: {} }).m[u.id])).filter((v) => !isNaN(v));
            const tagCount = {};
            marked.forEach((x) => (Store.mistakesOf(p.id, x.s.id)[u.id] || []).forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
            const top = Object.entries(tagCount).sort((a, c) => c[1] - a[1])[0];
            const a = vals.length ? Store.mean(vals) : null;
            return { u, avg: a, pct: a == null || !u.max ? null : (a / u.max) * 100, full: vals.filter((v) => v >= u.max).length, n: vals.length, topTag: top ? { tag: top[0], n: top[1] } : null };
        });

        const outcomes = {};
        us.forEach((u) => u.loIds.forEach((lo) => { (outcomes[lo] = outcomes[lo] || { units: [] }).units.push(u); }));
        const outcomeRows = Object.entries(outcomes).map(([lo, o]) => {
            const per = marked.map((x) => {
                let g = 0, m = 0;
                o.units.forEach((u) => { const v = (book[x.s.id] || { m: {} }).m[u.id]; if (v !== undefined && v !== "") { g += Number(v) || 0; m += u.max; } });
                return m ? { x, pct: (g / m) * 100 } : null;
            }).filter(Boolean);
            const counts = L.map(() => 0); per.forEach((v) => { counts[lvlOf(v.pct)]++; });
            return { info: loIdx[lo] || { code: "?", text: lo }, pct: per.length ? Store.mean(per.map((v) => v.pct)) : null, counts, support: per.filter((v) => lvlOf(v.pct) === 0).map((v) => v.x.s.name) };
        }).sort((a, c) => (a.pct == null ? 1 : c.pct == null ? -1 : a.pct - c.pct));

        const mistakes = {};
        marked.forEach((x) => Object.entries(Store.mistakesOf(p.id, x.s.id)).forEach(([uid, ts]) => {
            const u = us.find((y) => y.id === uid); const v = Number((book[x.s.id] || { m: {} }).m[uid]);
            ts.forEach((t) => { const m = (mistakes[t] = mistakes[t] || { n: 0, lost: 0, students: new Set() }); m.n++; m.students.add(x.s.id); if (u && !isNaN(v)) m.lost += Math.max(0, u.max - v); });
        }));
        const mistakeRows = Object.entries(mistakes).map(([t, m]) => ({ t, ...m, students: m.students.size })).sort((a, c) => c.lost - a.lost);
        const grades = {}; marked.forEach((x) => { grades[x.grade] = (grades[x.grade] || 0) + 1; });
        return { p, cls, L, b, students, marked, avg, questions, outcomeRows, mistakeRows, grades, prevPaper, studs };
    }

    V.analysis = (root, params) => {
        const db = Store.db; const ctx = App.ctx;
        let p = params && params[0] ? Store.paper(params[0]) : null;
        if (p) App.setCtx({ classId: p.classId, exam: p.exam });
        const cls = App.ensureClass();
        if (!cls) { root.innerHTML = `<div class="empty"><h4>No class assigned</h4></div>`; return; }
        const papers = db.papers.filter((x) => x.classId === cls.id && x.exam === ctx.exam && x.status === "published");
        if (!p || p.classId !== cls.id || p.exam !== ctx.exam) p = papers[0];
        const head = `<div class="view-header"><div><h2>Exam analysis</h2><span class="subtitle">How the class did on one paper - question by question, outcome by outcome, mistake by mistake - and how each student moved since the previous exam.</span></div>
            <div class="actions">${p ? `<button class="btn" id="an-xlsx">${icon("download")}Download analysis (Excel)</button>` : ""}</div></div>
            <div class="toolbar">${App.classSelect()}${App.examSelect()}
                <div class="field"><label for="an-paper">Paper</label><select class="select" id="an-paper">${papers.map((x) => `<option value="${x.id}" ${p && x.id === p.id ? "selected" : ""}>${esc(x.subject)} - ${esc(V.breakdownText(x))}</option>`).join("") || "<option>No published papers</option>"}</select></div></div>`;
        if (!p) { root.innerHTML = head + `<div class="card empty"><h4>No published papers for this exam yet</h4>Build one in Papers, publish it, and enter marks.</div>`; App.bindCtx(root); return; }

        const a = analyse(p);
        const { L, students, marked, avg, questions, outcomeRows, mistakeRows, grades, prevPaper } = a;
        const gradeOrder = (db.institution.type === "higher" ? FW.GRADE_SCALES.higher : FW.GRADE_SCALES.school).map(([, g]) => g);
        const maxG = Math.max(1, ...Object.values(grades));
        const best = marked.slice().sort((x, y) => y.pct - x.pct)[0], worst = marked.slice().sort((x, y) => x.pct - y.pct)[0];
        const absent = students.filter((x) => x.ab).length;
        const bar = (pct) => `<div class="an-bar"><span style="width:${Math.max(0, Math.min(100, pct || 0))}%"></span></div>`;
        const chg = (d) => (d == null ? `<span class="muted">-</span>` : `<span class="strong" style="color:${d >= 5 ? "var(--color-success)" : d <= -5 ? "var(--color-danger)" : "var(--text-subtle)"}">${d > 0 ? "▲" : d < 0 ? "▼" : ""} ${fmt(Math.round(Math.abs(d)))}</span>`);

        root.innerHTML = head + `
        <div class="grid grid-4">
            <div class="card stat"><span class="k">Marked</span><span class="v">${marked.length}<small class="muted" style="font-size:16px">/${students.length}</small></span><span class="s">${absent ? `${absent} absent` : "No absences"}</span></div>
            <div class="card stat"><span class="k">Class average (core)</span><span class="v">${avg == null ? "-" : `${Math.round(avg)}%`}</span><span class="s">${avg == null ? "" : `Grade ${Store.gradeFor(avg)} - out of ${fmt(a.b.main)}`}</span></div>
            <div class="card stat"><span class="k">Highest</span><span class="v">${best ? `${Math.round(best.pct)}%` : "-"}</span><span class="s">${best ? esc(best.s.name) : ""}</span></div>
            <div class="card stat"><span class="k">Lowest</span><span class="v">${worst ? `${Math.round(worst.pct)}%` : "-"}</span><span class="s">${worst ? esc(worst.s.name) : ""}</span></div>
        </div>
        ${marked.length < students.length - absent ? `<div class="alert alert-info mt-16">${icon("info")}<div class="body">${students.length - absent - marked.length} student${students.length - absent - marked.length === 1 ? " is" : "s are"} not fully marked yet - figures below cover the ${marked.length} marked. <a href="#/marks/${p.id}">Finish marking</a></div></div>` : ""}

        <div class="grid grid-main-side mt-16">
            <div class="card"><div class="card-head"><h3>Questions</h3><span class="hint">Lowest scores first need re-teaching</span></div>
                <div class="table-wrap" style="border:0;border-radius:0"><table class="table"><thead><tr><th>Q</th><th>Section</th><th>Outcome</th><th class="num">Avg</th><th style="width:22%">Score</th><th class="num">Full marks</th><th>Most common mistake</th></tr></thead><tbody>
                ${questions.map((q) => `<tr><td class="strong">Q${esc(q.u.label)}</td><td class="small">${esc(q.u.section.name)}</td><td class="small">${q.u.loIds.map((id) => `<span class="code">${esc((Store.loIndex(a.cls.grade)[id] || {}).code || "?")}</span>`).join(" ") || "-"}</td>
                    <td class="num">${q.avg == null ? "-" : `${fmt(Math.round(q.avg * 10) / 10)}/${fmt(q.u.max)}`}</td><td>${q.pct == null ? "" : `<div class="row" style="gap:6px;flex-wrap:nowrap">${bar(q.pct)}<span class="small strong num">${Math.round(q.pct)}%</span></div>`}</td>
                    <td class="num">${q.full}/${q.n}</td><td class="small">${q.topTag ? `<span class="badge badge-yellow">${esc(FW.MISTAKES[q.topTag.tag].label)} &times;${q.topTag.n}</span>` : `<span class="muted">-</span>`}</td></tr>`).join("")}
                </tbody></table></div></div>
            <div class="stack">
                <div class="card"><div class="card-head"><h3>Grades</h3></div><div class="card-body">
                    ${gradeOrder.filter((g) => grades[g]).map((g) => `<div class="row" style="gap:8px;flex-wrap:nowrap;margin-bottom:6px"><span class="strong" style="width:28px">${g}</span><div class="an-bar" style="flex:1"><span style="width:${(grades[g] / maxG) * 100}%"></span></div><span class="small num" style="width:64px;text-align:right">${grades[g]} student${grades[g] === 1 ? "" : "s"}</span></div>`).join("") || `<div class="muted">No marks yet.</div>`}
                </div></div>
                <div class="card"><div class="card-head"><h3>Mistakes</h3><span class="hint">From teachers' tags</span></div><div class="list">
                    ${mistakeRows.length ? mistakeRows.slice(0, 6).map((m) => `<div class="list-item" style="align-items:flex-start"><div class="grow"><div class="title small">${esc(FW.MISTAKES[m.t].label)} <span class="muted">- ${m.n} times, ${m.students} student${m.students === 1 ? "" : "s"}, ${fmt(Math.round(m.lost * 10) / 10)} marks lost</span></div><div class="sub">${esc(FW.MISTAKES[m.t].tip)}</div></div></div>`).join("")
                        : `<div class="empty small">No mistakes tagged yet. Tap <b>+</b> next to a mark in Marks to note why it was lost.</div>`}
                </div></div>
            </div>
        </div>

        <div class="card mt-16"><div class="card-head"><h3>Outcomes</h3><span class="hint">Weakest first - who needs support</span></div>
            <div class="table-wrap" style="border:0;border-radius:0"><table class="table"><thead><tr><th>Outcome</th><th class="num">Class</th><th style="width:22%">Levels</th><th>Needs support (${esc(L[0].label)})</th></tr></thead><tbody>
            ${outcomeRows.map((o) => `<tr><td><span class="code">${esc(o.info.code)}</span> ${esc(o.info.text)}</td><td class="num strong">${o.pct == null ? "-" : `${Math.round(o.pct)}%`}</td><td>${UI.levelBar(L, o.counts, o.info.text)}</td><td class="small">${o.support.length ? esc(o.support.slice(0, 5).join(", ")) + (o.support.length > 5 ? ` +${o.support.length - 5}` : "") : `<span class="muted">None</span>`}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty small">No outcomes mapped on this paper.</div></td></tr>`}
            </tbody></table></div></div>

        <div class="card mt-16"><div class="card-head"><h3>Students</h3><span class="hint">${prevPaper ? `Change against ${esc(Store.examById(prevPaper.exam).name)} (${esc(prevPaper.subject)})` : "No earlier exam in this subject to compare"}</span></div>
            <div class="table-wrap" style="border:0;border-radius:0"><table class="table"><thead><tr><th>Roll</th><th>Student</th><th class="num">Core %</th><th class="num">Grade</th><th class="num">Change</th><th>Main mistake</th><th></th></tr></thead><tbody>
            ${students.map((x) => `<tr><td class="num">${x.s.roll}</td><td>${esc(x.s.name)}</td><td class="num">${x.ab ? "AB" : x.pct == null ? `<span class="muted">not marked</span>` : `${Math.round(x.pct)}%`}</td><td class="num strong">${x.grade || "-"}</td><td class="num">${chg(x.change)}</td>
                <td class="small">${x.topTag ? esc(FW.MISTAKES[x.topTag].label) : `<span class="muted">-</span>`}</td><td class="num"><a class="btn btn-sm" href="#/report/${x.s.id}">${icon("card")}Report</a></td></tr>`).join("")}
            </tbody></table></div></div>`;
        App.bindCtx(root);
        $("#an-paper", root).addEventListener("change", (e) => App.go("analysis/" + e.target.value));
        $("#an-xlsx", root).addEventListener("click", () => exportAnalysis(a).catch((err) => toast(err.message, "err")));
    };

    async function exportAnalysis(a) {
        const ExcelJS = await UI.loadExcel();
        const wb = new ExcelJS.Workbook(); wb.creator = "revU";
        const title = `${Store.className(a.cls)} - ${a.p.title}`;
        const head = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B41C4" } }, alignment: { vertical: "middle", wrapText: true } };
        const sheet = (name, cols, widths, rows) => {
            const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 2 }] });
            ws.addRow([`${title} - ${name}`]).font = { bold: true, size: 12 };
            ws.addRow(cols).eachCell((c) => { c.style = head; });
            widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
            rows.forEach((r) => ws.addRow(r));
            ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
        };
        const idx = Store.loIndex(a.cls.grade);
        sheet("Students", ["Roll", "Student", "Core %", "Grade", "Change vs previous", "Main mistake"], [6, 26, 10, 8, 18, 22],
            a.students.map((x) => [x.s.roll, x.s.name, x.ab ? "AB" : x.pct == null ? "" : Math.round(x.pct * 10) / 10, x.grade || "", x.change == null ? "" : Math.round(x.change * 10) / 10, x.topTag ? FW.MISTAKES[x.topTag].label : ""]));
        sheet("Questions", ["Question", "Section", "Outcomes", "Max", "Class average", "Score %", "Full marks", "Most common mistake"], [10, 22, 22, 8, 14, 10, 12, 24],
            a.questions.map((q) => [`Q${q.u.label}`, q.u.section.name, q.u.loIds.map((id) => (idx[id] || {}).code).join(", "), q.u.max, q.avg == null ? "" : Math.round(q.avg * 10) / 10, q.pct == null ? "" : Math.round(q.pct), `${q.full}/${q.n}`, q.topTag ? `${FW.MISTAKES[q.topTag.tag].label} x${q.topTag.n}` : ""]));
        sheet("Outcomes", ["Code", "Outcome", "Class %", ...a.L.map((l) => l.label), "Needs support"], [10, 50, 10, ...a.L.map(() => 12), 50],
            a.outcomeRows.map((o) => [o.info.code, o.info.text, o.pct == null ? "" : Math.round(o.pct), ...o.counts, o.support.join(", ")]));
        sheet("Mistakes", ["Mistake", "Times", "Students", "Marks lost", "Practice tip"], [22, 8, 10, 12, 70],
            a.mistakeRows.map((m) => [FW.MISTAKES[m.t].label, m.n, m.students, Math.round(m.lost * 10) / 10, FW.MISTAKES[m.t].tip]));
        const buf = await wb.xlsx.writeBuffer();
        UI.download(`${Store.className(a.cls).replace(/\s+/g, "")}_${a.p.subject}_${a.p.exam}_analysis.xlsx`.replace(/[^\w.-]/g, ""), new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        toast("Analysis downloaded");
    }
})();
