// revU - student progress report: generation, bulk publishing and printing.
(function () {
    "use strict";
    const { icon, esc, $, $$, avatar, pct, fmt, lvlChip, toast, confirmBox } = UI;
    const FW = HPC_FW;
    const V = App.views;
    const SHEET_SERIES = ["#685DBC", "#0e8a7a", "#c47a0c"];

    // Readiness of one student's card for a term
    function readiness(sid, term) {
        const s = Store.student(sid); const db = Store.db;
        const exams = Store.examsOfTerm(term).map((e) => e.id);
        const ps = db.papers.filter((p) => p.classId === s.classId && exams.includes(p.exam) && p.status === "published");
        const marksDone = ps.filter((p) => { const r = Store.paperResult(p, sid); return r && r.complete; }).length;
        return {
            marks: { done: marksDone, total: ps.length },
            teacher: Store.teacherRatedComplete(sid, term),
            self: Store.selfDone(sid, term),
            parent: Store.parentDone(sid, term),
            remark: (db.remarks[term] || {})[sid]
        };
    }
    const canPublish = (r) => r.teacher && r.marks.done === r.marks.total && r.remark && r.remark.text;

    // ---------------------------------------------------------------------
    // The report - one A4 sheet, front and back. Every line is derived from
    // the same numbers, so sections can never contradict each other.
    // ---------------------------------------------------------------------
    // Map a level index onto the 4-step ramp (3-step sets use steps 0, 1, 3)
    const ramp = (L, v) => (v == null ? null : L.length === 4 ? Math.round(v) : [0, 1, 3][Math.round(v)]);
    const dot = (L, v) => `<span class="rp-dot lv${ramp(L, v)}"></span>`;
    const lvl = (L, v) => (v == null ? `<span class="rp-lvl none">-</span>` : `<span class="rp-lvl">${dot(L, v)}${esc(L[Math.round(v)].label)}</span>`);

    V.renderCard = (sid, term, opts) => {
        const detail = !!(opts && opts.detail);
        const db = Store.db; const s = Store.student(sid); const cls = Store.cls(s.classId); const st = Store.stageOf(cls); const L = Store.levelsOf(cls);
        const inst = db.institution; const prof = db.profiles[sid] || {}; const att = (db.attendance[term] || {})[sid];
        // One shared engine computes everything the report says (see Store.insights)
        const ins = Store.insights(sid, term);
        const { rows, graded, overall, ds, items, counts, strengths, nexts, stretch } = ins;
        // Learning insights: the three biggest things to work on and one thing going well
        const learn = ins.academic.filter((x) => x.tone === "focus").slice(0, 3).concat(ins.academic.filter((x) => x.tone === "good").slice(0, 1));
        const learnHtml = (x) => (x.kind === "mistake" || x.kind === "answers"
            ? `<b>${esc(x.title)}</b>${esc(x.kind === "mistake" ? x.text.slice(x.title.length) : ` - ${x.text}`)}`
            : `<b>${esc(x.title)}.</b> ${esc(x.text)}`) + (x.tip ? `<span class="tip">Tip: ${esc(x.tip)}</span>` : "");
        const lom = Store.loMastery(sid, term);
        const cols = (rows[0] ? rows[0].tr.parts : []).map((p, i) => ({ i, label: p.label, short: p.short, outOf: p.outOf })).filter((c) => rows.some((r) => r.tr.parts[c.i].status !== "none"));
        const fullMax = cols.reduce((s2, c) => s2 + c.outOf, 0);
        const cell = (p) => (p.status === "ok" ? fmt(p.score) : p.status === "ab" ? "AB" : p.status === "pending" ? `<span class="pend">pending</span>` : "-");

        // Voices - shown only when there is real input
        const h = Store.H(term);
        const peerNotes = Object.values(h.peerBy || {}).map((r) => (r[sid] || {}).note).filter(Boolean);
        const pn = (db.parentNotes[term] || {})[sid];
        const voices = [];
        const sentence = (t) => (t ? String(t).trim().replace(/([^.!?])$/, "$1.") : "");
        const me = [sentence(prof.aboutMe), prof.ambition ? `When I grow up: ${prof.ambition}.` : "", (prof.goals || []).length ? `My goals: ${prof.goals.join("; ")}.` : ""].filter(Boolean);
        if (me.length) voices.push(["In my words", me.join(" ")]);
        if (peerNotes.length) voices.push(["My classmates say", peerNotes.join(" · ")]);
        if (pn && (pn.proud || pn.support)) voices.push(["At home", [pn.proud ? `Proud of: ${pn.proud}.` : "", pn.support ? `Support: ${pn.support}.` : ""].filter(Boolean).join(" ")]);
        const rem = (db.remarks[term] || {})[sid];
        const ct = Store.staff(cls.classTeacherId);

        const norm = (v) => (v == null ? null : (v + 1) / L.length);
        const lab = (v) => (v == null ? "Not yet" : L[Math.round(v)].label);
        const series = [
            { name: "Teacher", color: SHEET_SERIES[0], values: ds.map((d) => norm(d.teacher)), labels: ds.map((d) => lab(d.teacher)) },
            { name: "Self", color: SHEET_SERIES[1], values: ds.map((d) => norm(d.self)), labels: ds.map((d) => lab(d.self)), fill: 0.04 },
            { name: "Parent", color: SHEET_SERIES[2], values: ds.map((d) => norm(d.parent)), labels: ds.map((d) => lab(d.parent)), fill: 0.04, dash: true }
        ];
        const hasPeer = ds.some((d) => d.peer != null);
        const scale = (inst.type === "higher" ? FW.GRADE_SCALES.higher : FW.GRADE_SCALES.school).map(([min, g], i, arr) => `${g} ${min}${i ? `-${arr[i - 1][0] - 1}` : "+"}`).join(" · ");

        return `<article class="rp">
            <header class="rp-head">
                <div class="rp-school"><span class="rp-mono" aria-hidden="true">${esc(inst.short && inst.short.length <= 3 ? inst.short : UI.initials(inst.short || inst.name))}</span>
                    <div><b>${esc(inst.name)}</b><small>${esc([inst.city, `Session ${inst.session}`].filter(Boolean).join(" · "))}</small></div></div>
                <div class="rp-title"><span>${esc(inst.cardTitle || "Progress Report")}</span><b>${esc(st.name)} · <i>${esc(term)}</i></b></div>
            </header>

            <section class="rp-student">
                <div><small>Student</small><b>${esc(s.name)}</b></div>
                <div><small>Class · Roll</small><b>${esc(Store.className(cls))} · ${s.roll}</b></div>
                <div><small>Date of birth</small><b>${esc(s.dob)}</b></div>
                <div><small>Attendance</small><b>${att ? `${pct(att.present, att.total)}%` : "-"}</b>${att ? ` <span style="color:var(--rp-subtle)">${att.present}/${att.total}</span>` : ""}</div>
            </section>

            <section class="rp-glance">
                <div class="rp-box"><small>Overall</small>
                    ${overall == null ? `<div class="rp-grade"><b>-</b></div><div style="color:var(--rp-subtle)">No marks yet</div>` : `<div class="rp-grade"><b>${Store.gradeFor(overall)}</b><span>${Math.round(overall)}%</span></div><div style="color:var(--rp-subtle)">Average of ${graded.length} subject${graded.length === 1 ? "" : "s"}</div>`}
                </div>
                <div class="rp-box"><small>Growth across ${items.length} skills</small>
                    ${items.length ? `<div class="rp-spread" role="img" aria-label="${L.map((l, i) => `${l.label} ${counts[i]}`).join(", ")}">${counts.map((c, i) => (c ? `<span class="lv${ramp(L, i)}" style="flex:${c}"></span>` : "")).join("")}</div>
                    <div class="rp-keys">${L.map((l, i) => `<span>${dot(L, i)} ${esc(l.label)} <b>${pct(counts[i], items.length)}%</b></span>`).join("")}</div>` : `<div style="color:var(--rp-subtle)">Not rated yet</div>`}
                </div>
                <div class="rp-box rp-sn">
                    <div><small>Strengths</small><ul>${strengths.length ? strengths.map((it) => `<li>${esc(it.name)} <em>${esc(it.where)}</em></li>`).join("") : "<li>To be observed</li>"}</ul></div>
                    <div class="next"><small>Next steps</small><ul>${nexts.length ? nexts.map((it) => `<li>${esc(it.name)} <em>${esc(it.where)}</em></li>`).join("") : stretch ? `<li>Stretch further in ${esc(stretch.name)} <em>${esc(stretch.where)}</em></li>` : "<li>To be set</li>"}</ul></div>
                </div>
            </section>

            <section class="rp-sec"><h3>Subjects <small>Term total = ${cols.map((c) => `${esc(c.label)} ${c.outOf}`).join(" + ")}${fullMax ? ` = ${fullMax}` : ""}</small></h3>
                ${rows.length ? `<div class="rp-table-wrap"><table class="rp-table">
                    <thead><tr><th>Subject</th>${cols.map((c) => `<th class="c" title="${esc(c.label)}">${esc(c.short)}<br><small>/${c.outOf}</small></th>`).join("")}<th class="c">Total<br><small>/${fullMax}</small></th><th class="c">Grade</th><th style="width:52%">Skills</th></tr></thead>
                    <tbody>${rows.map((r) => `<tr>
                        <td class="sub">${esc(r.sub)}${r.sources.length ? `<small>${esc(r.sources.join(" + "))}</small>` : ""}</td>
                        ${cols.map((c) => `<td class="c">${cell(r.tr.parts[c.i])}</td>`).join("")}
                        <td class="c tot">${r.tr.pct == null ? "-" : fmt(r.tr.total)}${r.tr.pct != null && r.tr.markedMax !== fullMax ? `<small style="color:var(--rp-subtle)">/${r.tr.markedMax}</small>` : ""}${r.tr.pct != null && (!r.tr.complete || r.tr.absentExcluded) ? "*" : ""}</td>
                        <td class="c gr">${r.tr.grade || "-"}</td>
                        <td>${r.skills.length ? `<div class="rp-skills">${r.skills.map((k) => `<span class="rp-skill ${k.c.kind !== "regular" ? "x" : ""}" title="${esc(L[k.lvl].label)} - ${k.pct}%">${dot(L, k.lvl)}${esc(k.c.title.replace(/\s*\(.*\)$/, ""))}</span>`).join("")}</div>` : `<span class="pend">Marks only</span>`}</td>
                    </tr>`).join("")}</tbody></table></div>
                    ${rows.some((r) => r.tr.pct != null && (!r.tr.complete || r.tr.absentExcluded)) ? `<div style="font-size:9.5px;color:var(--rp-subtle);margin-top:3px">* Graded on the parts ${rows.some((r) => r.tr.absentExcluded) ? "attended (AB = absent)" : "marked so far"}${rows.some((r) => r.tr.absentExcluded) && rows.some((r) => !r.tr.complete) ? "; some parts are still being marked" : ""}.</div>` : ""}` : `<p style="color:var(--rp-subtle)">No examinations published for this term yet.</p>`}
            </section>

            ${learn.length ? `<section class="rp-sec"><h3>Learning insights <small>From question-level marks and the teachers' mistake notes</small></h3>
                <div class="rp-ins">${learn.map((x) => `<div class="rp-in ${x.tone}">${learnHtml(x)}</div>`).join("")}</div></section>` : ""}

            <section class="rp-sec rp-two">
                <div><h3>Growth 360° <small>Teacher, self${hasPeer ? ", peers" : ""} and home</small></h3>
                    <table class="rp-table"><thead><tr><th>Area</th><th>Teacher</th><th>Self</th>${hasPeer ? "<th>Peers</th>" : ""}<th>Home</th></tr></thead><tbody>
                    ${ds.map((d) => `<tr><td>${esc(d.domain.name)}</td><td>${lvl(L, d.teacher)}</td><td>${lvl(L, d.self)}</td>${hasPeer ? `<td>${lvl(L, d.peer)}</td>` : ""}<td>${lvl(L, d.parent)}</td></tr>`).join("")}
                    </tbody></table></div>
                <div>${UI.radar({ axes: ds.map((d) => d.domain.name), series, size: 230, levels: L.length })}${UI.legend(series.map((x) => ({ name: x.name, color: x.color, dash: x.dash })))}</div>
            </section>

            ${voices.length ? `<section class="rp-sec"><h3>Voices</h3><div class="rp-voices">${voices.map(([who, txt]) => `<div class="rp-voice"><small>${esc(who)}</small>${esc(txt)}</div>`).join("")}</div></section>` : ""}

            <section class="rp-sec"><h3>Teacher's note</h3>
                <div class="rp-note ${rem && rem.text ? "" : "empty"}">${rem && rem.text ? esc(rem.text) : "To be added by the class teacher."}</div>
            </section>

            <footer class="rp-sign"><div>Class teacher<b>${esc(ct ? ct.name : "")}</b></div><div>Principal<b>&nbsp;</b></div><div>Parent / guardian<b>${pn && pn.ack ? "Seen online" : "&nbsp;"}</b></div></footer>
            <div class="rp-legend">
                <span><b>Levels:</b> ${L.map((l) => `${esc(l.label)} - ${esc(l.desc.toLowerCase())}`).join(" · ")}</span>
                <span><b>Grades:</b> ${esc(scale)}</span>
                <span><b>Skills:</b> from question-level marks mapped to outcomes; dashed = extra sections</span>
            </div>
            <div class="rp-foot"><span>Generated with revU · by bhusku</span><span>${rem && rem.status === "published" ? `Published ${esc(rem.at || "")}` : "Draft - not yet published"}</span></div>

            ${detail ? `<section class="rp-sec rp-appendix"><h3>Outcome detail <small>${esc(s.name)} · ${esc(term)}</small></h3><div class="rp-outcomes">
                ${rows.filter((r) => r.skills.length).map((r) => `<div class="grp"><b>${esc(r.sub)}</b>${r.skills.flatMap((k) => k.c.los.filter((lo) => lom[lo.id]).map((lo) => `<div class="o">${dot(L, lom[lo.id].lvl)}<span>${esc(lo.text)}</span><span>${lom[lo.id].pct}%</span></div>`)).join("")}</div>`).join("")}
            </div></section>` : ""}
        </article>`;
    };

    // ---------------------------------------------------------------------
    // Single card (staff) with remark editor
    // ---------------------------------------------------------------------
    V.report = (root, [sid]) => {
        const s = Store.student(sid);
        if (!s) { root.innerHTML = `<div class="empty"><h4>Student not found</h4></div>`; return; }
        const term = App.ctx.term; const db = Store.db;
        const remarks = (db.remarks[term] = db.remarks[term] || {});
        const r = readiness(sid, term);
        const rem = remarks[sid];
        const studs = Store.studentsOf(s.classId); const i = studs.findIndex((x) => x.id === sid);
        const chk = (ok, label) => `<span class="badge ${ok ? "badge-green" : "badge-warn"}">${icon(ok ? "check" : "alert")}${label}</span>`;
        root.innerHTML = `
        <div class="crumb no-print"><a href="#/reports">Reports</a> / ${esc(Store.className(s.classId))}</div>
        <div class="view-header"><div><h2>${esc(s.name)}</h2><span class="subtitle">${esc(Store.db.institution.cardTitle || "Progress Report")} - ${esc(term)}</span></div>
            <div class="actions">${App.termSelect()}
                <a class="btn" href="#/report/${studs[(i - 1 + studs.length) % studs.length].id}" aria-label="Previous student">${icon("back")}</a><a class="btn" href="#/report/${studs[(i + 1) % studs.length].id}" aria-label="Next student">${icon("arrow")}</a>
                <label class="check"><input type="checkbox" id="rp-detail" ${App.ctx.reportDetail ? "checked" : ""}> Outcome detail</label>
                <button class="btn" onclick="window.print()">${icon("print")}Print / PDF</button></div></div>
        <div class="card no-print" style="max-width:794px;margin:0 auto 16px">
            <div class="card-head"><h3>Teacher's remark</h3><div class="row">${chk(r.marks.done === r.marks.total, `Marks ${r.marks.done}/${r.marks.total}`)}${chk(r.teacher, "Growth rated")}${chk(r.self, "Self")}${chk(r.parent, "Parent")}</div></div>
            <div class="card-body stack">
                <textarea class="textarea" id="rm-text" rows="4" placeholder="Click Auto-draft to start from the data, then personalise.">${esc(rem ? rem.text : "")}</textarea>
                <div class="row"><button class="btn btn-soft" id="rm-draft">${icon("sparkle")}Auto-draft from data</button><button class="btn" id="rm-save">Save draft</button>
                ${rem && rem.status === "published" ? `<span class="badge badge-green">${icon("check")}Published ${esc(rem.at || "")}</span><button class="btn btn-ghost" id="rm-unpub">Unpublish</button>` : `<button class="btn btn-primary" id="rm-pub">${icon("send")}Publish to student & parent</button>`}</div>
                ${!r.teacher ? `<div class="alert alert-warn">${icon("alert")}<div class="body">Growth ratings are incomplete - <a href="#/growth">finish them</a> before publishing.</div></div>` : ""}
            </div>
        </div>
        <div id="card-sheet">${V.renderCard(sid, term, { detail: App.ctx.reportDetail })}</div>`;
        App.bindCtx(root);
        const refresh = () => { $("#card-sheet", root).innerHTML = V.renderCard(sid, term, { detail: App.ctx.reportDetail }); };
        $("#rp-detail", root).addEventListener("change", (e) => { App.setCtx({ reportDetail: e.target.checked }); refresh(); });
        $("#rm-draft", root).addEventListener("click", () => { $("#rm-text", root).value = Store.draftRemark(sid, term); });
        $("#rm-save", root).addEventListener("click", () => { remarks[sid] = Object.assign({}, remarks[sid], { text: $("#rm-text", root).value.trim(), status: (remarks[sid] || {}).status || "draft" }); Store.save(); refresh(); toast("Draft saved"); });
        const pub = $("#rm-pub", root);
        if (pub) pub.addEventListener("click", () => {
            const text = $("#rm-text", root).value.trim();
            remarks[sid] = { text, status: "draft" };
            const rr = readiness(sid, term);
            if (!canPublish(rr)) { Store.save(); toast(!text ? "Add a remark first" : !rr.teacher ? "Growth ratings are incomplete" : "Some marks are still pending", "err"); return; }
            remarks[sid] = { text, status: "published", at: new Date().toISOString().slice(0, 10) };
            Store.save(); toast("Published - visible to student and parent"); V.report(root, [sid]);
        });
        const un = $("#rm-unpub", root);
        if (un) un.addEventListener("click", () => { remarks[sid].status = "draft"; Store.save(); V.report(root, [sid]); });
    };

    // ---------------------------------------------------------------------
    // Cards list - bulk draft / publish / print
    // ---------------------------------------------------------------------
    V.reports = (root) => {
        const cls = App.ensureClass(); const term = App.ctx.term; const db = Store.db;
        if (!cls) { root.innerHTML = `<div class="empty"><h4>No class assigned</h4></div>`; return; }
        const studs = Store.studentsOf(cls.id);
        const remarks = (db.remarks[term] = db.remarks[term] || {});
        const rs = studs.map((s) => ({ s, r: readiness(s.id, term) }));
        const ready = rs.filter((x) => canPublish(x.r) && (x.r.remark || {}).status !== "published").length;
        const noRemark = rs.filter((x) => !x.r.remark || !x.r.remark.text).length;
        const published = rs.filter((x) => (x.r.remark || {}).status === "published");
        root.innerHTML = `
        <div class="view-header"><div><h2>Reports</h2><span class="subtitle">Draft every remark from the data in one click, review, then publish the whole class. Cards fill themselves from papers, ratings and voices.</span></div>
        <div class="actions"><button class="btn btn-soft" id="bulk-draft" ${noRemark ? "" : "disabled"}>${icon("sparkle")}Auto-draft ${noRemark} remark${noRemark === 1 ? "" : "s"}</button>
            <button class="btn btn-primary" id="bulk-pub" ${ready ? "" : "disabled"}>${icon("send")}Publish ${ready} ready</button>
            <button class="btn" id="bulk-print" ${published.length ? "" : "disabled"}>${icon("print")}Print ${published.length} published</button>
            <button class="btn" id="bulk-xlsx">${icon("download")}Class results (Excel)</button></div></div>
        <div class="toolbar">${App.classSelect()}${App.termSelect()}<div class="spacer"></div><label class="check"><input type="checkbox" id="bulk-detail" ${App.ctx.reportDetail ? "checked" : ""}> Include outcome detail when printing</label><span class="small muted">Compact report: one A4 sheet, front and back</span></div>
        <div class="table-wrap"><table class="table">
            <thead><tr><th>Roll</th><th>Student</th><th>Marks</th><th>Growth</th><th>Self</th><th>Parent</th><th>Remark</th><th>Status</th><th></th></tr></thead>
            <tbody>${rs.map(({ s, r }) => {
                const b = (ok) => (ok ? `<span class="badge badge-green">${icon("check")}</span>` : `<span class="badge badge-gray">-</span>`);
                return `<tr><td class="num">${s.roll}</td><td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(s, 26)}<b>${esc(s.name)}</b></div></td>
                    <td class="small ${r.marks.done < r.marks.total ? "" : "muted"}">${r.marks.done}/${r.marks.total} papers</td>
                    <td>${b(r.teacher)}</td><td>${b(r.self)}</td><td>${b(r.parent)}</td>
                    <td class="small" style="max-width:280px">${r.remark && r.remark.text ? esc(r.remark.text.slice(0, 80)) + (r.remark.text.length > 80 ? "..." : "") : `<span class="muted">-</span>`}</td>
                    <td>${(r.remark || {}).status === "published" ? `<span class="badge badge-green">Published</span>` : canPublish(r) ? `<span class="badge badge-blue">Ready</span>` : `<span class="badge badge-gray">In progress</span>`}</td>
                    <td><a class="btn btn-sm" href="#/report/${s.id}">${icon("card")}Open</a></td></tr>`;
            }).join("")}</tbody></table></div>
        <div id="print-area" class="hidden"></div>`;
        App.bindCtx(root);
        $("#bulk-detail", root).addEventListener("change", (e) => App.setCtx({ reportDetail: e.target.checked }));
        $("#bulk-xlsx", root).addEventListener("click", () => V.exportClassResults(cls.id, term).catch((err) => toast(err.message, "err")));
        $("#bulk-draft", root).addEventListener("click", () => {
            let n = 0; rs.forEach(({ s, r }) => { if (!r.remark || !r.remark.text) { remarks[s.id] = { text: Store.draftRemark(s.id, term), status: "draft" }; n++; } });
            Store.save(); toast(`${n} remark${n === 1 ? "" : "s"} drafted - review before publishing`); V.reports(root);
        });
        $("#bulk-pub", root).addEventListener("click", async () => {
            if (!(await confirmBox(`Publish ${ready} cards?`, "Students and parents will see these cards immediately.", "Publish"))) return;
            const at = new Date().toISOString().slice(0, 10);
            rs.forEach(({ s, r }) => { if (canPublish(r) && r.remark.status !== "published") remarks[s.id] = { text: r.remark.text, status: "published", at }; });
            Store.save(); toast("Published"); V.reports(root);
        });
        $("#bulk-print", root).addEventListener("click", () => {
            const area = $("#print-area", root);
            area.innerHTML = published.map(({ s }) => V.renderCard(s.id, term, { detail: App.ctx.reportDetail })).join("");
            area.classList.remove("hidden");
            $$(".table-wrap", root).forEach((t) => t.classList.add("no-print"));
            setTimeout(() => { window.print(); area.classList.add("hidden"); area.innerHTML = ""; }, 50);
        });
    };

    // ---------------------------------------------------------------------
    // Student / parent card viewer (published cards only)
    // ---------------------------------------------------------------------
    V.renderMyCard = (root, sid, who) => {
        const db = Store.db; const term = App.ctx.term;
        const pubTerms = ["Term 1", "Term 2"].filter((t) => ((db.remarks[t] || {})[sid] || {}).status === "published");
        const show = pubTerms.includes(term) ? term : pubTerms[pubTerms.length - 1];
        const first = Store.student(sid).name.split(" ")[0];
        root.innerHTML = `
        <div class="view-header"><div><h2>${who === "student" ? `My ${esc(Store.db.institution.cardTitle || "Progress Report")}` : `${esc(first)}'s ${esc(Store.db.institution.cardTitle || "Progress Report")}`}</h2>
            <span class="subtitle">${show ? `Showing ${esc(show)}.` : ""} ${show !== term ? `The ${esc(term)} card will appear here once your class teacher publishes it.` : ""}</span></div>
            <div class="actions">${App.termSelect()}${who === "parent" ? `<a class="btn btn-soft" href="#/parent-feedback">${icon("voices")}Give feedback</a>` : `<a class="btn btn-soft" href="#/me-self">${icon("smile3")}How I'm doing</a>`}${show ? `<button class="btn" onclick="window.print()">${icon("print")}Print / PDF</button>` : ""}</div></div>
        ${show ? V.renderCard(sid, show) : `<div class="card empty"><h4>No card published yet</h4>You will be notified when it is ready.</div>`}`;
        App.bindCtx(root);
    };
})();
