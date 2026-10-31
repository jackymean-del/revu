// revU HPC - Holistic Progress Card generation, bulk publishing and printing.
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
    // The card
    // ---------------------------------------------------------------------
    V.renderCard = (sid, term) => {
        const db = Store.db; const s = Store.student(sid); const cls = Store.cls(s.classId); const st = Store.stageOf(cls); const L = Store.levelsOf(cls);
        const inst = db.institution; const prof = db.profiles[sid] || {}; const att = (db.attendance[term] || {})[sid];
        const exams = Store.examsOfTerm(term).filter((e) => db.papers.some((p) => p.classId === cls.id && p.exam === e.id && p.status === "published"));
        const subjects = [...new Set(db.papers.filter((p) => p.classId === cls.id && exams.some((e) => e.id === p.exam) && p.status === "published").map((p) => p.hpcSubject))];
        const order = FW.subjectsForGrade(cls.grade).map((x) => x.name);
        subjects.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
        const compKeys = FW.componentsForGrade(cls.grade);

        // Scholastic rows
        const rows = subjects.map((sub) => {
            const perExam = exams.map((e) => Store.subjectResult(cls.id, e.id, sub, sid));
            let got = 0, max = 0, any = false;
            perExam.forEach((r) => { if (r && r.any && !r.ab) { got += r.main; max += r.mainMax; any = true; } });
            const comps = {};
            compKeys.forEach((k) => {
                let g = 0, m = 0, has = false;
                perExam.forEach((r) => { if (r && r.comps[k] && r.comps[k].max) { has = true; m += r.comps[k].max; if (!r.ab) g += r.comps[k].got; } });
                comps[k] = has ? { shown: Store.convert(g, m, k), of: db.componentMax[k], raw: `${fmt(g)}/${fmt(m)}` } : null;
            });
            return { sub, perExam, pct: any && max ? (got / max) * 100 : null, comps };
        });
        const usedComps = compKeys.filter((k) => rows.some((r) => r.comps[k]));

        // Competency attainment from LO mastery
        const lom = Store.loMastery(sid, term);
        const compRows = [];
        subjects.forEach((sub) => {
            Store.libFor(cls.grade, sub).forEach((c) => {
                const vals = c.los.map((lo) => lom[lo.id]).filter(Boolean);
                if (vals.length) compRows.push({ sub, c, lvl: Math.round(Store.mean(vals.map((v) => v.lvl))), pct: Math.round(Store.mean(vals.map((v) => v.pct))) });
            });
        });

        // 360 domains
        const ds = Store.domainScores(sid, term);
        const norm = (v) => (v == null ? null : (v + 1) / L.length);
        const lab = (v) => (v == null ? "Not yet" : L[Math.round(v)].label);
        const series = [
            { name: "Teacher", color: SHEET_SERIES[0], values: ds.map((d) => norm(d.teacher)), labels: ds.map((d) => lab(d.teacher)) },
            { name: "Self", color: SHEET_SERIES[1], values: ds.map((d) => norm(d.self)), labels: ds.map((d) => lab(d.self)), fill: 0.04 },
            { name: "Parent", color: SHEET_SERIES[2], values: ds.map((d) => norm(d.parent)), labels: ds.map((d) => lab(d.parent)), fill: 0.04, dash: true }
        ];
        const h = Store.H(term);
        const peerNotes = Object.values(h.peerBy || {}).map((r) => (r[sid] || {}).note).filter(Boolean);
        const pn = (db.parentNotes[term] || {})[sid];
        const rem = (db.remarks[term] || {})[sid];
        const ct = Store.staff(cls.classTeacherId);

        return `<div class="hpc-sheet">
            <div class="hpc-top">
                <div class="school"><span class="ss-mono" aria-hidden="true">${esc(inst.short && inst.short.length <= 3 ? inst.short : UI.initials(inst.short || inst.name))}</span>
                <div><h2>${esc(inst.name)}</h2><div class="meta">${esc(inst.city || "")} - Academic Session ${esc(inst.session)}</div></div></div>
                <div class="meta" style="text-align:right">${esc(st.name)}<br>${esc(st.grades)}</div>
            </div>
            <div class="hpc-title">${esc((inst.cardTitle || "Progress Report").toUpperCase())} - <span>${esc(term.toUpperCase())}</span></div>

            <div class="hpc-part"><h4><span>About the learner</span></h4>
                <div class="hpc-profile">
                    <div><b>Name</b>${esc(s.name)}</div><div><b>Class & Roll</b>${esc(Store.className(cls))} - ${s.roll}</div><div><b>Date of birth</b>${esc(s.dob)}</div>
                    <div><b>Parent / Guardian</b>${esc(s.guardian)}</div><div><b>House</b>${esc(s.house)}</div><div><b>Attendance</b>${att ? `${att.present} / ${att.total} days (${pct(att.present, att.total)}%)` : "-"}</div>
                </div>
                <div class="hpc-voices" style="margin-top:10px">
                    <div class="hpc-voice"><div class="who">About me</div>${esc(prof.aboutMe || "-")}</div>
                    <div class="hpc-voice"><div class="who">When I grow up</div>${esc(prof.ambition || "-")}${(prof.interests || []).length ? `<div style="margin-top:4px;color:#475569">Interests: ${prof.interests.map(esc).join(", ")}</div>` : ""}</div>
                    <div class="hpc-voice"><div class="who">My goals</div>${(prof.goals || []).length ? prof.goals.map(esc).join("<br>") : "-"}</div>
                </div>
            </div>

            <div class="hpc-part"><h4><span>Subjects</span><span style="text-transform:none;letter-spacing:0;color:#64748b">Extra sections shown separately</span></h4>
                ${rows.length ? `<table class="hpc-table"><thead><tr><th>Subject</th>${exams.map((e) => `<th class="c">${esc(e.name)}</th>`).join("")}<th class="c">Grade</th>${usedComps.map((k) => `<th class="c">${esc(FW.COMPONENTS[k].label)}<br><span style="font-weight:500">out of ${db.componentMax[k]}</span></th>`).join("")}</tr></thead>
                <tbody>${rows.map((r) => `<tr><td><b>${esc(r.sub)}</b>${r.perExam.some((x) => x && x.papers.length > 1) ? `<div style="font-size:10.5px;color:#64748b">${esc([...new Set(r.perExam.filter(Boolean).flatMap((x) => x.papers.map((p) => p.subject)))].join(" + "))}</div>` : ""}</td>
                    ${r.perExam.map((x) => `<td class="c">${!x ? "-" : !x.any ? "<span style='color:#94a3b8'>Pending</span>" : x.ab ? "AB" : `${fmt(x.main)} / ${fmt(x.mainMax)}`}</td>`).join("")}
                    <td class="c"><b>${r.pct == null ? "-" : Store.gradeFor(r.pct)}</b></td>
                    ${usedComps.map((k) => `<td class="c" ${r.comps[k] ? `title="Marked ${r.comps[k].raw}"` : ""}>${r.comps[k] ? `${fmt(r.comps[k].shown)}${k === "enrichment" ? `<div style="font-size:10px;color:#64748b">${esc(FW.componentLabel(k, r.sub))}</div>` : ""}` : "-"}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<p style="color:#64748b;font-size:13px">No examinations published for this term yet.</p>`}
            </div>

            ${compRows.length ? `<div class="hpc-part"><h4><span>Skills achieved</span><span style="text-transform:none;letter-spacing:0;color:#64748b">From question-level marks mapped to outcomes</span></h4>
                <table class="hpc-table"><thead><tr><th>Subject</th><th>Skill area</th><th class="c">Score</th><th class="c">Level</th></tr></thead><tbody>
                ${compRows.map((r, i) => `<tr>${i === 0 || compRows[i - 1].sub !== r.sub ? `<td rowspan="${compRows.filter((x) => x.sub === r.sub).length}"><b>${esc(r.sub)}</b></td>` : ""}<td>${esc(r.c.title)}${r.c.kind !== "regular" ? ` <span style="font-size:10px;color:#8A5A00;font-weight:700">EXTRA</span>` : ""}</td><td class="c">${r.pct}%</td><td class="c">${lvlChip(L, r.lvl)}</td></tr>`).join("")}
                </tbody></table></div>` : ""}

            <div class="hpc-part"><h4><span>Growth 360°</span></h4>
                <div class="hpc-radar-wrap">
                    <div>${UI.radar({ axes: ds.map((d) => d.domain.name), series, size: 300, levels: L.length })}${UI.legend(series.map((x) => ({ name: x.name, color: x.color, dash: x.dash })))}</div>
                    <table class="hpc-table"><thead><tr><th>Domain</th><th class="c">Teacher</th><th class="c">Self</th><th class="c">Peer</th><th class="c">Parent</th></tr></thead><tbody>
                    ${ds.map((d) => `<tr><td>${esc(d.domain.name)}</td><td class="c">${lvlChip(L, d.teacher, { placeholder: "-" })}</td><td class="c">${lvlChip(L, d.self, { placeholder: "-" })}</td><td class="c">${lvlChip(L, d.peer, { placeholder: "-" })}</td><td class="c">${lvlChip(L, d.parent, { placeholder: "-" })}</td></tr>`).join("")}
                    </tbody></table>
                </div>
                <div style="font-size:11px;color:#64748b;margin-top:6px">${L.map((l) => `<b>${esc(l.label)}</b>: ${esc(l.desc)}`).join(" &nbsp;-&nbsp; ")}</div>
            </div>

            <div class="hpc-part"><h4><span>Voices</span></h4>
                <div class="hpc-voices">
                    <div class="hpc-voice"><div class="who">Peers say</div>${peerNotes.length ? peerNotes.map(esc).join("<br>") : "Peers rated this learner across all domains (see table above)."}</div>
                    <div class="hpc-voice"><div class="who">Parent - proud of</div>${pn && pn.proud ? esc(pn.proud) : "-"}</div>
                    <div class="hpc-voice"><div class="who">Parent - support at home</div>${pn && pn.support ? esc(pn.support) : "-"}</div>
                </div>
            </div>

            <div class="hpc-part"><h4><span>Teacher's remarks</span></h4>
                <div class="hpc-remark">${rem && rem.text ? esc(rem.text) : "<span style='color:#94a3b8'>Remark not added yet.</span>"}</div>
            </div>

            <div class="hpc-sign"><div>Class Teacher<br><b style="color:#0f172a">${esc(ct ? ct.name : "")}</b></div><div>Principal</div><div>Parent / Guardian${pn && pn.ack ? `<br><b style="color:#4B41C4">Acknowledged online</b>` : ""}</div></div>
            <div class="hpc-foot"><span>Generated with revU &middot; by bhusku</span><span>${rem && rem.status === "published" ? `Published ${esc(rem.at || "")}` : "DRAFT - not yet published"}</span></div>
        </div>`;
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
                <button class="btn" onclick="window.print()">${icon("print")}Print / PDF</button></div></div>
        <div class="card no-print" style="max-width:900px;margin:0 auto 16px">
            <div class="card-head"><h3>Teacher's remark</h3><div class="row">${chk(r.marks.done === r.marks.total, `Marks ${r.marks.done}/${r.marks.total}`)}${chk(r.teacher, "Growth rated")}${chk(r.self, "Self")}${chk(r.parent, "Parent")}</div></div>
            <div class="card-body stack">
                <textarea class="textarea" id="rm-text" rows="4" placeholder="Click Auto-draft to start from the data, then personalise.">${esc(rem ? rem.text : "")}</textarea>
                <div class="row"><button class="btn btn-soft" id="rm-draft">${icon("sparkle")}Auto-draft from data</button><button class="btn" id="rm-save">Save draft</button>
                ${rem && rem.status === "published" ? `<span class="badge badge-green">${icon("check")}Published ${esc(rem.at || "")}</span><button class="btn btn-ghost" id="rm-unpub">Unpublish</button>` : `<button class="btn btn-primary" id="rm-pub">${icon("send")}Publish to student & parent</button>`}</div>
                ${!r.teacher ? `<div class="alert alert-warn">${icon("alert")}<div class="body">Growth ratings are incomplete - <a href="#/growth">finish them</a> before publishing.</div></div>` : ""}
            </div>
        </div>
        <div id="card-sheet">${V.renderCard(sid, term)}</div>`;
        App.bindCtx(root);
        const refresh = () => { $("#card-sheet", root).innerHTML = V.renderCard(sid, term); };
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
            <button class="btn" id="bulk-print" ${published.length ? "" : "disabled"}>${icon("print")}Print ${published.length} published</button></div></div>
        <div class="toolbar">${App.classSelect()}${App.termSelect()}</div>
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
            area.innerHTML = published.map(({ s }) => V.renderCard(s.id, term)).join("");
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
