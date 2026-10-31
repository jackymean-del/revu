// revU - "How it works": a live, step-by-step trace of one student from question marks to
// the printed report, plus the class results download. Everything shown comes from the
// same Store.insights engine the report uses, so the explanation can never drift.
(function () {
    "use strict";
    const { icon, esc, $, $$, fmt, lvlChip, toast } = UI;
    const FW = HPC_FW;
    const V = App.views;

    // Outcome -> the questions that measured it, for one subject in one term
    function outcomeTrace(sid, term, classId, subject) {
        const exams = Store.examsOfTerm(term).map((e) => e.id);
        const papers = Store.db.papers.filter((p) => p.classId === classId && exams.includes(p.exam) && p.status === "published" && p.hpcSubject === subject);
        const by = {};
        papers.forEach((p) => {
            const rec = (Store.db.marks[p.id] || {})[sid];
            Store.units(p).forEach((u) => u.loIds.forEach((lo) => {
                const t = (by[lo] = by[lo] || { qs: [], got: 0, max: 0 });
                const v = rec && !rec.ab ? rec.m[u.id] : undefined;
                t.qs.push({ exam: Store.examById(p.exam).name, label: u.label, max: u.max, got: v, extra: u.section.type !== "main" });
                if (v !== undefined && v !== null && v !== "") { t.got += Number(v) || 0; t.max += u.max; }
            }));
        });
        return { papers, by };
    }

    V.guide = (root) => {
        const cls = App.ensureClass(); const term = App.ctx.term;
        if (!cls) { root.innerHTML = `<div class="empty"><h4>No class assigned</h4></div>`; return; }
        const studs = Store.studentsOf(cls.id);
        const ui = (V.guide.state = V.guide.state || {});
        if (!studs.some((s) => s.id === ui.sid)) ui.sid = studs[0].id;
        const ins = Store.insights(ui.sid, term);
        const { student: s, L, rows } = ins;
        if (!rows.some((r) => r.sub === ui.sub)) ui.sub = (rows.find((r) => r.skills.length) || rows[0] || {}).sub;
        const row = rows.find((r) => r.sub === ui.sub);
        const first = s.name.split(" ")[0];
        const cuts = Store.LEVEL_CUTS[L.length] || Store.LEVEL_CUTS[3];
        const bands = L.map((l, i) => `${l.label} ${i === 0 ? `below ${cuts[0]}%` : i === L.length - 1 ? `${cuts[i - 1]}% and above` : `${cuts[i - 1]}-${cuts[i] - 1}%`}`);
        const trace = row ? outcomeTrace(s.id, term, cls.id, row.sub) : { papers: [], by: {} };
        const loIdx = Store.loIndex(cls.grade);
        const mainPaper = trace.papers.slice().sort((a, b) => Store.breakdown(b).total - Store.breakdown(a).total)[0];
        const scale = (Store.db.institution.type === "higher" ? FW.GRADE_SCALES.higher : FW.GRADE_SCALES.school);
        const step = (n, title, sub) => `<div class="card-head"><div class="row" style="gap:10px"><span class="gd-num">${n}</span><div><h3>${esc(title)}</h3>${sub ? `<div class="small muted">${sub}</div>` : ""}</div></div></div>`;

        root.innerHTML = `
        <div class="view-header"><div><h2>How revU works</h2><span class="subtitle">No black box. Follow one student from question marks to the printed report - every number below is live, and every sentence shows the rule that wrote it.</span></div></div>
        <div class="toolbar">${App.classSelect()}
            <div class="field"><label for="gd-student">Student</label><select class="select" id="gd-student">${studs.map((x) => `<option value="${x.id}" ${x.id === s.id ? "selected" : ""}>${x.roll}. ${esc(x.name)}</option>`).join("")}</select></div>
            ${App.termSelect()}
            <div class="field"><label for="gd-subject">Subject to trace</label><select class="select" id="gd-subject">${rows.map((r) => `<option ${r.sub === ui.sub ? "selected" : ""}>${esc(r.sub)}</option>`).join("")}</select></div>
        </div>

        <div class="gd-flow">${[["1", "Marks", "per question"], ["2", "Outcomes", "% to level"], ["3", "Skills", "average of outcomes"], ["4", "Grades", "term total"], ["5", "Growth 360°", "4 voices"], ["6", "Insights", "rules, not guesses"], ["7", "Report", "print & download"]]
            .map(([n, t, d]) => `<a href="#gd-${n}" class="gd-step"><b>${n}</b><span>${t}</span><small>${d}</small></a>`).join('<span class="gd-arrow" aria-hidden="true">&rarr;</span>')}</div>

        <div class="card mt-16" id="gd-1">${step(1, "Teachers enter marks - once, per question", "Three ways, same result: the Marks table, student-by-student, or the Excel template. Totals are never typed - they are calculated.")}
            <div class="card-body grid grid-2">
                <div class="stack" style="gap:10px">
                    <div class="gd-way"><b>Table</b><span>Students in rows, questions in columns grouped by section, locked subtotals. Enter moves down.</span></div>
                    <div class="gd-way"><b>Student-wise</b><span>One student at a time, question by question - ideal with the answer sheet in hand.</span></div>
                    <div class="gd-way"><b>Excel</b><span>Download the template (max-marks row, locked formulas, hidden paper ID), fill offline, upload. Bad rows are listed with the reason; good rows still import.</span></div>
                    <div class="small muted">Type <b>AB</b> for absent. A mark above the question's maximum is refused. Core sections add to the subject; extra sections (Oral, Activity, Enrichment, Notebook) go to their own report field.</div>
                    ${mainPaper ? `<div><a class="btn btn-sm" href="#/marks/${mainPaper.id}">${icon("grader")}Open ${esc(mainPaper.subject)} - ${esc(Store.examById(mainPaper.exam).name)} in Marks</a></div>` : ""}
                </div>
                <div>${mainPaper ? (() => {
                    const rec = (Store.db.marks[mainPaper.id] || {})[s.id];
                    const us = Store.units(mainPaper);
                    return `<div class="small strong" style="margin-bottom:6px">${esc(first)}'s marks - ${esc(mainPaper.subject)}, ${esc(Store.examById(mainPaper.exam).name)}</div>
                    <div class="table-wrap" style="max-height:280px"><table class="table"><thead><tr><th>Q</th><th>Section</th><th>Outcome</th><th class="num">Marks</th></tr></thead><tbody>
                    ${us.map((u) => `<tr><td>Q${esc(u.label)}</td><td class="small">${esc(u.section.name)}${u.section.type !== "main" ? ` <span class="badge badge-yellow">extra</span>` : ""}</td><td class="small">${u.loIds.map((id) => `<span class="code">${esc(loIdx[id] ? loIdx[id].code : "?")}</span>`).join(" ") || "-"}</td><td class="num">${rec ? (rec.ab ? "AB" : `${fmt(rec.m[u.id])} / ${fmt(u.max)}`) : `- / ${fmt(u.max)}`}</td></tr>`).join("")}
                    </tbody></table></div>`;
                })() : `<div class="empty">No published papers for this subject in ${esc(term)}.</div>`}</div>
            </div>
        </div>

        <div class="card mt-16" id="gd-2">${step(2, "Each outcome gets a level from the questions that measured it", `Marks on every question mapped to an outcome are pooled across the term. Then: ${bands.map(esc).join(" · ")}.`)}
            <div class="table-wrap" style="border:0;border-radius:0"><table class="table"><thead><tr><th>Outcome</th><th>Measured by</th><th class="num">Marks</th><th class="num">%</th><th>Level</th></tr></thead><tbody>
            ${row && row.skills.length ? row.skills.flatMap((k) => k.outs.map((o) => { const t = trace.by[o.lo.id] || { qs: [], got: 0, max: 0 };
                return `<tr><td><span class="code">${esc(o.lo.code)}</span> ${esc(o.lo.text)}</td><td class="small">${t.qs.map((q) => `${esc(q.exam)} Q${esc(q.label)}`).join(", ")}</td><td class="num">${fmt(t.got)} / ${fmt(t.max)}</td><td class="num strong">${o.pct}%</td><td>${lvlChip(L, o.lvl)}</td></tr>`; })).join("")
                : `<tr><td colspan="5"><div class="empty">${row ? "This is a marks-only subject - no outcomes are mapped." : "Nothing to trace yet."}</div></td></tr>`}
            </tbody></table></div>
        </div>

        <div class="card mt-16" id="gd-3">${step(3, "Skill areas average their outcomes", "A skill area's level is the average of its outcome levels, rounded; its % is the average of their percentages. These are the chips on the report.")}
            <div class="card-body"><div class="gd-skills">${row && row.skills.length ? row.skills.map((k) => `<div class="gd-skill"><div class="row-between"><b>${esc(k.c.title)}</b>${lvlChip(L, k.lvl)}</div>
                <div class="small muted">${k.outs.map((o) => `${esc(o.lo.code)} ${o.pct}% (${esc(L[o.lvl].label)})`).join(" + ")} &rarr; average ${k.pct}%</div></div>`).join("") : `<div class="empty">No skill areas for this subject.</div>`}</div></div>
        </div>

        <div class="card mt-16" id="gd-4">${step(4, "Grades come from the term total", `Each part is scaled from its own marks (set in Settings &rarr; Term total), added up and graded on the school scale.`)}
            <div class="card-body grid grid-2">
                <div>${row ? `<table class="table" style="border:1px solid var(--border-color);border-radius:8px"><thead><tr><th>${esc(row.sub)}</th><th class="num">Scaled</th></tr></thead><tbody>
                    ${row.tr.parts.filter((p) => p.status !== "none").map((p) => {
                        const raw = p.part.fields ? (() => { let g = 0, m = 0; Store.examsOfTerm(term).forEach((e) => { const r = Store.subjectResult(cls.id, e.id, row.sub, s.id); if (r) Object.values(r.comps).forEach((c) => { g += c.got; m += c.max; }); }); return m ? `${fmt(g)}/${fmt(m)} in extra sections` : ""; })()
                            : (() => { const r = Store.subjectResult(cls.id, p.part.exam, row.sub, s.id); return r && r.any ? (r.ab ? "absent" : `${fmt(r.main)}/${fmt(r.mainMax)} in ${Store.examById(p.part.exam).name} core sections`) : "not marked yet"; })();
                        return `<tr><td>${esc(p.label)} <span class="small muted">- ${esc(raw)}</span></td><td class="num">${p.status === "ok" ? `${fmt(p.score)} / ${p.outOf}` : p.status === "ab" ? "AB" : "pending"}</td></tr>`; }).join("")}
                    <tr><td class="strong">Term total${row.tr.absentExcluded ? ` <span class="small muted">- absent part left out</span>` : ""}</td><td class="num strong">${row.tr.pct == null ? "-" : `${fmt(row.tr.total)} / ${row.tr.markedMax}`}</td></tr>
                    </tbody></table>` : ""}</div>
                <div><div class="small strong" style="margin-bottom:6px">Grade scale</div><div class="row" style="gap:6px">${scale.map(([min, g], i) => `<span class="badge ${row && row.tr.grade === g ? "badge-blue" : "badge-gray"}" style="${row && row.tr.grade === g ? "outline:2px solid var(--color-primary)" : ""}">${g} &middot; ${min}${i ? `-${scale[i - 1][0] - 1}` : "+"}</span>`).join("")}</div>
                    ${row && row.tr.pct != null ? `<p class="mt-8">${esc(first)} scored <b>${Math.round(row.tr.pct)}%</b> in ${esc(row.sub)} &rarr; grade <b>${esc(row.tr.grade)}</b>. The overall grade on the report is the average of all graded subjects: <b>${ins.overall == null ? "-" : `${Math.round(ins.overall)}% (${Store.gradeFor(ins.overall)})`}</b>.</p>` : ""}
                    <p class="small muted mt-8">Parts not marked yet show as "pending" and are never counted as zero. An absence shows as AB and is ${Store.db.absentAsZero ? "counted as zero (school setting)" : "left out of the grade - the grade uses the parts attended (change this in Settings &rarr; Term total)"}.</p></div>
            </div>
        </div>

        <div class="card mt-16" id="gd-5">${step(5, "Growth 360° - four voices, side by side", "Teachers rate each growth area's indicators (keyboard grid, or accept suggestions from their notes). Students, two classmates and parents answer one-tap questions. Voices are shown next to each other - never blended - so gaps are visible.")}
            <div class="table-wrap" style="border:0;border-radius:0"><table class="table"><thead><tr><th>Area</th><th>Teacher <span class="small muted">(average of indicators)</span></th><th>Self</th><th>Peers</th><th>Home</th></tr></thead><tbody>
            ${ins.ds.map((d) => `<tr><td>${esc(d.domain.name)}</td><td>${lvlChip(L, d.teacher)}</td><td>${lvlChip(L, d.self)}</td><td>${lvlChip(L, d.peer)}</td><td>${lvlChip(L, d.parent)}</td></tr>`).join("")}
            </tbody></table></div>
        </div>

        <div class="card mt-16" id="gd-6">${step(6, "Insights - written by rules you can read", `All ${ins.items.length} rated items (skill areas and growth areas) go on one 0-100 scale. Strengths are the top ${Math.min(3, ins.items.length)}; next steps are the lowest under ${Store.NEXT_BELOW}.`)}
            <div class="card-body grid grid-2">
                <div><div class="small strong" style="margin-bottom:6px">Strengths</div>
                    ${ins.strengths.map((it, i) => `<div class="gd-why"><b>${esc(it.name)}</b> <span class="muted">${esc(it.where)}</span><div class="small muted">Score ${Math.round(it.score)} - rank ${i + 1} of ${ins.items.length}</div></div>`).join("") || `<div class="muted">Nothing rated yet.</div>`}</div>
                <div><div class="small strong" style="margin-bottom:6px">Next steps</div>
                    ${ins.nexts.map((it) => `<div class="gd-why next"><b>${esc(it.name)}</b> <span class="muted">${esc(it.where)}</span><div class="small muted">Score ${Math.round(it.score)} - below ${Store.NEXT_BELOW}, among the lowest</div></div>`).join("")
                        || (ins.stretch ? `<div class="gd-why next"><b>Stretch: ${esc(ins.stretch.name)}</b> <span class="muted">${esc(ins.stretch.where)}</span><div class="small muted">Everything is ${Store.NEXT_BELOW}+; this is the lowest (${Math.round(ins.stretch.score)})</div></div>` : `<div class="muted">None.</div>`)}</div>
            </div>
            <div class="card-body" style="border-top:1px solid var(--border-color)">
                <div class="small strong" style="margin-bottom:6px">Teacher's note - auto-draft, sentence by sentence</div>
                <table class="table" style="border:1px solid var(--border-color);border-radius:8px"><thead><tr><th style="width:45%">Sentence</th><th>Rule</th><th>Data it used</th></tr></thead><tbody>
                ${ins.remark.map((p) => `<tr><td>${esc(p.text)}</td><td class="small">${esc(p.rule)}</td><td class="small">${esc(p.data)}</td></tr>`).join("")}
                </tbody></table>
                <p class="small muted mt-8">The teacher always reads, edits and approves the note before it is published.</p>
            </div>
        </div>

        <div class="card mt-16" id="gd-7">${step(7, "Report and downloads", "Everything above lands on one A4 sheet. Download what you need, cleanly.")}
            <div class="card-body gd-downloads">
                <a class="gd-dl" href="#/report/${s.id}">${icon("card")}<b>${esc(first)}'s report</b><span>Open, then Print / PDF. One A4 sheet, front and back.</span></a>
                <a class="gd-dl" href="#/reports">${icon("print")}<b>Whole class, one PDF</b><span>Reports &rarr; Print published &rarr; "Save as PDF". Each student starts on a new page.</span></a>
                <button class="gd-dl" id="gd-xlsx">${icon("download")}<b>Class results (Excel)</b><span>Results, skills, growth 360°, outcome detail and notes - one sheet each.</span></button>
                <a class="gd-dl" href="#/marks">${icon("grader")}<b>Marks template (Excel)</b><span>Per paper, from Marks. Fill offline, upload back.</span></a>
                <a class="gd-dl" href="#/settings">${icon("upload")}<b>Full backup (JSON)</b><span>Settings &rarr; Export backup. Restores everything.</span></a>
            </div>
        </div>`;
        App.bindCtx(root);
        $("#gd-student", root).addEventListener("change", (e) => { ui.sid = e.target.value; V.guide(root); });
        $("#gd-subject", root).addEventListener("change", (e) => { ui.sub = e.target.value; V.guide(root); });
        $("#gd-xlsx", root).addEventListener("click", () => V.exportClassResults(cls.id, term).catch((err) => toast(err.message, "err")));
        $$(".gd-step", root).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); const t = root.querySelector(a.getAttribute("href")); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }));
    };

    // ---------------------------------------------------------------------
    // Class results workbook
    // ---------------------------------------------------------------------
    V.exportClassResults = async (classId, term) => {
        const ExcelJS = await UI.loadExcel();
        const cls = Store.cls(classId); const studs = Store.studentsOf(classId); const db = Store.db;
        const all = studs.map((s) => ({ s, ins: Store.insights(s.id, term) }));
        const L = Store.levelsOf(cls);
        const subjects = [...new Set(all.flatMap((a) => a.ins.rows.map((r) => r.sub)))];
        const wb = new ExcelJS.Workbook(); wb.creator = "revU";
        const head = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B41C4" } }, alignment: { vertical: "middle", horizontal: "center", wrapText: true } };
        const sub2 = { font: { bold: true, color: { argb: "FF2A2363" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FF" } }, alignment: { horizontal: "center", wrapText: true } };
        const sheet = (name, cols, widths) => {
            const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 2, ySplit: 2 }] });
            ws.addRow([`${db.institution.name} - ${Store.className(cls)} - ${term} - ${name}`]).font = { bold: true, size: 12 };
            const hr = ws.addRow(cols); hr.eachCell((c) => { Object.assign(c, { style: head }); }); hr.height = 30;
            (widths || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
            ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
            return ws;
        };
        const lvLabel = (v) => (v == null ? "" : L[Math.round(v)].label);

        // 1. Results: term-total parts per subject, total, grade
        const partsOf = (sub) => { const r = all.map((a) => a.ins.rows.find((x) => x.sub === sub)).find(Boolean); return r ? r.tr.parts.filter((p) => all.some((a) => { const rr = a.ins.rows.find((x) => x.sub === sub); return rr && rr.tr.parts.find((q) => q.part.key === p.part.key && q.status !== "none"); })) : []; };
        const resCols = ["Roll", "Student"]; const subHdr = ["", ""];
        subjects.forEach((sub) => { partsOf(sub).forEach((p) => { resCols.push(sub); subHdr.push(`${p.short || p.label} /${p.outOf}`); }); resCols.push(sub, sub); subHdr.push("Total", "Grade"); });
        resCols.push("Overall %", "Overall grade", "Attendance %"); subHdr.push("", "", "");
        const ws1 = sheet("Results", resCols, [6, 24]);
        const sh = ws1.addRow(subHdr); sh.eachCell((c) => { c.style = sub2; });
        ws1.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
        // One merged heading per subject; filters sit on the part row
        for (let c = 3, start = 3; c <= resCols.length + 1; c++) {
            if (c > resCols.length || resCols[c - 1] !== resCols[start - 1]) { if (c - 1 > start) ws1.mergeCells(2, start, 2, c - 1); start = c; }
        }
        ws1.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: resCols.length } };
        all.forEach(({ s, ins }) => {
            const vals = [s.roll, s.name];
            subjects.forEach((sub) => {
                const r = ins.rows.find((x) => x.sub === sub);
                partsOf(sub).forEach((p) => { const q = r && r.tr.parts.find((x) => x.part.key === p.part.key); vals.push(!q ? "" : q.status === "ok" ? q.score : q.status === "ab" ? "AB" : q.status === "pending" ? "pending" : ""); });
                vals.push(r && r.tr.pct != null ? r.tr.total : "", r ? r.tr.grade || "" : "");
            });
            const att = (db.attendance[term] || {})[s.id];
            vals.push(ins.overall == null ? "" : Math.round(ins.overall * 10) / 10, ins.overall == null ? "" : Store.gradeFor(ins.overall), att && att.total ? Math.round((att.present / att.total) * 1000) / 10 : "");
            ws1.addRow(vals);
        });
        for (let c = 3; c <= resCols.length; c++) ws1.getColumn(c).width = 10;

        // 2. Skills: every skill area's level
        const skillCols = []; subjects.forEach((sub) => Store.libFor(cls.grade, sub).forEach((c) => skillCols.push({ sub, c })));
        const ws2 = sheet("Skills", ["Roll", "Student", ...skillCols.map((k) => `${k.sub}: ${k.c.title}`)], [6, 24]);
        all.forEach(({ s, ins }) => ws2.addRow([s.roll, s.name, ...skillCols.map((k) => { const r = ins.rows.find((x) => x.sub === k.sub); const sk = r && r.skills.find((x) => x.c.id === k.c.id); return sk ? `${L[sk.lvl].label} (${sk.pct}%)` : ""; })]));
        for (let c = 3; c <= skillCols.length + 2; c++) ws2.getColumn(c).width = 18;

        // 3. Growth 360
        const doms = Store.stageOf(cls).domains;
        const g360 = ["Roll", "Student"]; doms.forEach((d) => g360.push(...["Teacher", "Self", "Peers", "Home"].map((w) => `${d.name}: ${w}`)));
        const ws3 = sheet("Growth 360", g360, [6, 24]);
        all.forEach(({ s, ins }) => ws3.addRow([s.roll, s.name, ...ins.ds.flatMap((d) => [lvLabel(d.teacher), lvLabel(d.self), lvLabel(d.peer), lvLabel(d.parent)])]));
        for (let c = 3; c <= g360.length; c++) ws3.getColumn(c).width = 14;

        // 4. Outcome detail (long format - filter by anything)
        const ws4 = sheet("Outcomes", ["Roll", "Student", "Subject", "Skill area", "Code", "Outcome", "%", "Level"], [6, 24, 16, 24, 10, 50, 7, 12]);
        all.forEach(({ s, ins }) => ins.rows.forEach((r) => r.skills.forEach((k) => k.outs.forEach((o) => ws4.addRow([s.roll, s.name, r.sub, k.c.title, o.lo.code, o.lo.text, o.pct, L[o.lvl].label])))));

        // 5. Insights & notes
        const ws5 = sheet("Insights", ["Roll", "Student", "Strengths", "Next steps", "Teacher's note", "Status"], [6, 24, 40, 40, 70, 12]);
        all.forEach(({ s, ins }) => {
            const rem = (db.remarks[term] || {})[s.id];
            const row = ws5.addRow([s.roll, s.name, ins.strengths.map((i) => `${i.name} (${i.where})`).join("; "), (ins.nexts.length ? ins.nexts : ins.stretch ? [ins.stretch] : []).map((i) => `${i.name} (${i.where})`).join("; "), rem && rem.text ? rem.text : "", rem ? rem.status : "not started"]);
            row.alignment = { wrapText: true, vertical: "top" };
        });

        const buf = await wb.xlsx.writeBuffer();
        UI.download(`${Store.className(cls).replace(/\s+/g, "")}_${term.replace(/\s+/g, "")}_results.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        toast("Class results downloaded");
    };
})();
