// revU HPC - Exam views: LO library, exam builder (papers), paper preview, exam grader.
(function () {
    "use strict";
    const { icon, esc, $, $$, avatar, pct, fmt, toast, modal, confirmBox } = UI;
    const FW = HPC_FW;
    const V = App.views;

    const KIND_LABEL = { regular: "Core outcome", oral: "Oral", activity: "Activity", enrichment: "Enrichment", notebook: "Notebook" };
    const hpcSubjects = (grade) => FW.subjectsForGrade(grade).filter((s) => s.hpc).map((s) => s.name);

    // "English 80 + ASL 3 + Notebook 2"
    function breakdownHtml(p, opts) {
        const b = Store.breakdown(p);
        const parts = [`<span class="part">${esc(p.subject)} ${fmt(b.main)}</span>`];
        Object.entries(b.comps).forEach(([k, v]) => parts.push(`<span class="part add">${esc(FW.componentLabel(k, p.hpcSubject))} ${fmt(v)}</span>`));
        b.untagged.forEach((s) => parts.push(`<span class="part add" style="outline:2px dashed var(--color-warning)">${esc(s.name)} ${fmt(Store.secMax(s))} ?</span>`));
        return `<div class="breakdown">${parts.join('<span class="plus">+</span>')}${opts && opts.noRef ? "" : `<span class="ref">Paper total ${fmt(b.total)} (reference only)</span>`}</div>`;
    }
    function breakdownText(p) {
        const b = Store.breakdown(p);
        return [`${p.subject} ${fmt(b.main)}`].concat(Object.entries(b.comps).map(([k, v]) => `${FW.componentLabel(k, p.hpcSubject)} ${fmt(v)}`)).join(" + ");
    }
    function paperWarnings(p) {
        const w = [];
        const b = Store.breakdown(p);
        b.untagged.forEach((s) => w.push(`Extra section "${s.name}" has no report field - its marks won't reach the report.`));
        const isHpc = hpcSubjects(Store.cls(p.classId).grade).includes(p.hpcSubject);
        if (isHpc) {
            const unmapped = Store.units(p).filter((u) => !u.loIds || !u.loIds.length).map((u) => "Q" + u.label);
            if (unmapped.length) w.push(`${unmapped.length} question${unmapped.length > 1 ? "s are" : " is"} not mapped to an outcome (${unmapped.slice(0, 6).join(", ")}${unmapped.length > 6 ? "..." : ""}).`);
        }
        const zero = Store.units(p).filter((u) => !u.max).map((u) => "Q" + u.label);
        if (zero.length) w.push(`${zero.join(", ")} ${zero.length > 1 ? "have" : "has"} 0 marks.`);
        return w;
    }
    const renumber = (p) => { let n = 1; p.sections.forEach((s) => s.questions.forEach((q) => { q.label = String(n++); (q.parts || []).forEach((pt, i) => { pt.label = String.fromCharCode(97 + i); }); })); };
    const toVerb = (lo) => { const [w, ...rest] = lo.replace(/\.$/, "").split(" "); const v = /ies$/i.test(w) ? w.replace(/ies$/i, "y") : w.replace(/s$/i, ""); return [v.toLowerCase(), ...rest].join(" "); };

    // ---------------------------------------------------------------------
    // Competency & LO library
    // ---------------------------------------------------------------------
    V.outcomes = (root) => {
        const db = Store.db;
        const grades = [...new Set(db.classes.map((c) => c.grade).concat(Object.keys(db.library)))].sort((a, b) => Number(a) - Number(b));
        const st = (V.outcomes.state = V.outcomes.state || { grade: (Store.cls(App.ctx.classId) || {}).grade || grades[0], subject: null });
        if (!grades.includes(st.grade)) st.grade = grades[0];
        const subs = hpcSubjects(st.grade);
        if (!st.subject || !subs.includes(st.subject)) st.subject = subs[0];
        const comps = Store.libFor(st.grade, st.subject);
        const usage = {};
        db.papers.filter((p) => Store.cls(p.classId).grade === st.grade).forEach((p) => Store.units(p).forEach((u) => u.loIds.forEach((id) => { usage[id] = (usage[id] || 0) + 1; })));
        const kinds = ["regular"].concat(FW.componentsForGrade(st.grade));
        const total = comps.reduce((s, c) => s + c.los.length, 0);
        const canEdit = App.isAdmin();

        root.innerHTML = `
        <div class="view-header"><div><h2>Outcomes</h2><span class="subtitle">Every skill area and outcome in one place - including ${parseInt(st.grade, 10) <= 5 ? "Oral and Activity" : "Enrichment and Notebook"}. Map questions to outcomes once and reports fill themselves.</span></div>
        <div class="actions">${canEdit ? `<button class="btn" id="lib-tpl">${icon("download")}CSV template</button><button class="btn" id="lib-import">${icon("upload")}Import CSV</button><button class="btn btn-primary" id="lib-add">${icon("plus")}Add skill area</button>` : ""}</div></div>
        <div class="toolbar">
            <div class="field"><label for="lib-grade">Grade</label><select class="select" id="lib-grade">${grades.map((g) => `<option ${g === st.grade ? "selected" : ""} value="${g}">Grade ${g}</option>`).join("")}</select></div>
            <div class="field"><label>Subject</label><div class="seg" id="lib-subj">${subs.map((s) => `<button class="${s === st.subject ? "on" : ""}" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>
            <div class="spacer"></div><div class="small muted">${comps.length} skill areas - ${total} outcomes</div>
        </div>
        ${kinds.map((k) => {
            const list = comps.filter((c) => c.kind === k);
            return `<div class="card mt-16"><div class="card-head"><h3>${esc(k === "regular" ? "Core skill areas" : k === "enrichment" ? `Enrichment - ${FW.componentLabel(k, st.subject)}` : KIND_LABEL[k])}</h3><span class="hint">${k === "regular" ? "Counted in the subject total" : "Extra section - reported separately"}</span></div>
            <div class="lo-tree">${list.length ? list.map((c) => `<div class="comp"><div class="comp-title"><span class="code">${esc(c.code)}</span>${esc(c.title)}${canEdit ? `<button class="btn btn-sm btn-ghost" data-addlo="${c.id}">${icon("plus")}Outcome</button><button class="btn btn-sm btn-ghost btn-danger" data-delcomp="${c.id}" aria-label="Delete skill area">${icon("trash")}</button>` : ""}</div>
                ${c.los.map((lo) => `<div class="lo"><code>${esc(lo.code)}</code><span style="flex:1">${esc(lo.text)}</span>${usage[lo.id] ? `<span class="badge badge-green">${usage[lo.id]} question${usage[lo.id] > 1 ? "s" : ""}</span>` : `<span class="badge badge-gray">unused</span>`}</div>`).join("")}</div>`).join("") : `<div class="empty small">No ${esc(KIND_LABEL[k].toLowerCase())} skill areas yet.</div>`}</div></div>`;
        }).join("")}`;

        $("#lib-grade", root).addEventListener("change", (e) => { st.grade = e.target.value; st.subject = null; V.outcomes(root); });
        $$("#lib-subj button", root).forEach((b) => b.addEventListener("click", () => { st.subject = b.dataset.s; V.outcomes(root); }));
        if (!canEdit) return;
        const lib = () => ((db.library[st.grade] = db.library[st.grade] || {})[st.subject] = db.library[st.grade][st.subject] || []);
        $("#lib-add", root).addEventListener("click", () => {
            modal({
                title: "Add skill area", body: `<div class="stack">
                    <div class="grid grid-2"><div class="field"><label for="nc-code">Code</label><input class="input" id="nc-code" placeholder="EN${st.grade}.5"></div>
                    <div class="field"><label for="nc-kind">Type</label><select class="select" id="nc-kind">${kinds.map((k) => `<option value="${k}">${esc(KIND_LABEL[k])}</option>`).join("")}</select></div></div>
                    <div class="field"><label for="nc-title">Skill area</label><input class="input" id="nc-title" placeholder="e.g. Vocabulary"></div>
                    <div class="field"><label for="nc-los">Outcomes (one per line)</label><textarea class="textarea" id="nc-los"></textarea></div></div>`,
                foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Add</button>`,
                onMount: (m) => $("[data-ok]", m.el).addEventListener("click", () => {
                    const code = $("#nc-code", m.el).value.trim(), title = $("#nc-title", m.el).value.trim();
                    const los = $("#nc-los", m.el).value.split("\n").map((s) => s.trim()).filter(Boolean);
                    if (!code || !title || !los.length) { toast("Code, skill area and at least one outcome are required", "err"); return; }
                    const key = code.replace(/\W+/g, "").toLowerCase();
                    lib().push({ id: "cmp-" + key, code, title, kind: $("#nc-kind", m.el).value, los: los.map((t, i) => ({ id: `lo-${key}-${i + 1}`, code: `${code}.${i + 1}`, text: t })) });
                    Store.save(); m.close(); toast("Skill area added"); V.outcomes(root);
                })
            });
        });
        $$("[data-addlo]", root).forEach((b) => b.addEventListener("click", () => {
            const c = lib().find((x) => x.id === b.dataset.addlo);
            modal({
                title: `Add outcome to ${c.code}`, body: `<div class="field"><label for="nl-text">Outcome</label><input class="input" id="nl-text"></div>`,
                foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Add</button>`,
                onMount: (m) => $("[data-ok]", m.el).addEventListener("click", () => {
                    const t = $("#nl-text", m.el).value.trim(); if (!t) return;
                    const n = c.los.length + 1; const key = c.code.replace(/\W+/g, "").toLowerCase();
                    c.los.push({ id: `lo-${key}-${n}-${Date.now().toString(36)}`, code: `${c.code}.${n}`, text: t });
                    Store.save(); m.close(); V.outcomes(root);
                })
            });
        }));
        $$("[data-delcomp]", root).forEach((b) => b.addEventListener("click", async () => {
            if (!(await confirmBox("Delete skill area?", "Questions already mapped keep their tags, but these outcomes leave the picker.", "Delete"))) return;
            const arr = lib(); arr.splice(arr.findIndex((x) => x.id === b.dataset.delcomp), 1); Store.save(); V.outcomes(root);
        }));
        $("#lib-tpl", root).addEventListener("click", () => UI.download("outcomes-template.csv", "grade,subject,skill_code,skill_area,type,outcome\n7,English,EN7.5,Vocabulary,regular,Uses synonyms and antonyms appropriately\n7,English,EN7.N,Notebook,notebook,Maintains a complete and neat notebook\n", "text/csv"));
        $("#lib-import", root).addEventListener("click", async () => {
            const f = await UI.pickFile(".csv"); if (!f) return;
            const rows = (await f.text()).split(/\r?\n/).slice(1).filter((l) => l.trim()).map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()));
            let added = 0;
            rows.forEach(([grade, subject, code, title, kind, text]) => {
                if (!grade || !subject || !code || !text) return;
                const L = ((db.library[grade] = db.library[grade] || {})[subject] = db.library[grade][subject] || []);
                const key = code.replace(/\W+/g, "").toLowerCase();
                let c = L.find((x) => x.code === code);
                if (!c) { c = { id: "cmp-" + key, code, title: title || code, kind: KIND_LABEL[kind] ? kind : "regular", los: [] }; L.push(c); }
                if (!c.los.some((lo) => lo.text === text)) { c.los.push({ id: `lo-${key}-${c.los.length + 1}`, code: `${code}.${c.los.length + 1}`, text }); added++; }
            });
            Store.save(); toast(`${added} outcome${added === 1 ? "" : "s"} imported`); V.outcomes(root);
        });
    };

    // ---------------------------------------------------------------------
    // Papers list
    // ---------------------------------------------------------------------
    V.papers = (root) => {
        const cls = App.ensureClass(); const db = Store.db; const ctx = App.ctx;
        if (!cls) { root.innerHTML = `<div class="empty"><h4>No class assigned</h4></div>`; return; }
        const list = db.papers.filter((p) => p.classId === cls.id && p.exam === ctx.exam);
        const merged = {};
        list.forEach((p) => { if (p.hpcSubject !== p.subject) (merged[p.hpcSubject] = merged[p.hpcSubject] || []).push(p); });
        const subsCovered = new Set(list.filter((p) => p.status === "published").map((p) => p.hpcSubject));
        const missing = hpcSubjects(cls.grade).filter((s) => !subsCovered.has(s));

        root.innerHTML = `
        <div class="view-header"><div><h2>Papers</h2><span class="subtitle">Build question papers section by section. Extra sections (${parseInt(cls.grade, 10) <= 5 ? "Oral, Activity" : "Enrichment, Notebook"}) are reported separately and never inflate the subject total.</span></div>
        <div class="actions"><button class="btn" id="btn-merge">${icon("merge")}Merge papers</button><button class="btn btn-primary" id="btn-new">${icon("plus")}New question paper</button></div></div>
        <div class="toolbar">${App.classSelect()}${App.examSelect()}<div class="spacer"></div>
            ${missing.length ? `<span class="badge badge-warn">${icon("alert")}No published paper yet: ${esc(missing.join(", "))}</span>` : `<span class="badge badge-green">${icon("check")}All outcome subjects covered</span>`}</div>
        ${Object.keys(merged).length ? `<div class="alert alert-info" style="margin-bottom:16px">${icon("merge")}<div class="body">${Object.entries(merged).map(([s, ps]) => `<b>${esc(s)}</b> = ${ps.map((p) => esc(p.subject)).join(" + ")} (core sections add up to the ${esc(s)} total; matching fields such as Notebook are added together)`).join("<br>")}</div></div>` : ""}
        <div class="table-wrap"><table class="table">
            <thead><tr><th>Subject</th><th>Marks breakdown</th><th>Sections</th><th>Set by</th><th>Status</th><th>Checks</th><th class="num">Actions</th></tr></thead>
            <tbody>${list.length ? list.map((p) => {
                const w = paperWarnings(p);
                return `<tr>
                    <td><b>${esc(p.subject)}</b>${p.hpcSubject !== p.subject ? `<div class="small muted">${icon("merge", "")} into ${esc(p.hpcSubject)}</div>` : ""}</td>
                    <td class="small strong">${esc(breakdownText(p))}<div class="muted" style="font-weight:500">Paper total ${fmt(Store.breakdown(p).total)}</div></td>
                    <td class="small">${p.sections.map((s) => `<span class="badge ${s.type === "main" ? "badge-blue" : "badge-yellow"}" style="margin:1px">${esc(s.name)}</span>`).join("")}</td>
                    <td class="small">${esc((Store.staff(p.createdBy) || {}).name || "-")}</td>
                    <td>${p.status === "published" ? `<span class="badge badge-green">Published</span>` : `<span class="badge badge-gray">Draft</span>`}</td>
                    <td>${w.length ? `<span class="badge badge-warn" data-tip="${esc(w.map(esc).join("<br>"))}">${icon("alert")}${w.length} warning${w.length > 1 ? "s" : ""}</span>` : `<span class="badge badge-green">${icon("check")}OK</span>`}</td>
                    <td class="num nowrap"><a class="btn btn-sm" href="#/paper/${p.id}">${icon("edit")}Edit</a> <a class="btn btn-sm" href="#/preview/${p.id}">${icon("eye")}</a> ${p.status === "published" ? `<a class="btn btn-sm" href="#/marks/${p.id}">${icon("grader")}Marks</a>` : ""}</td>
                </tr>`;
            }).join("") : `<tr><td colspan="7"><div class="empty"><h4>No papers for this examination yet</h4>Create one, or copy last exam's paper as a starting point.</div></td></tr>`}</tbody>
        </table></div>`;
        App.bindCtx(root);
        $("#btn-new", root).addEventListener("click", () => newPaperModal(cls));
        $("#btn-merge", root).addEventListener("click", () => mergeModal(cls, list, root));
    };

    function newPaperModal(cls) {
        const db = Store.db;
        const subs = FW.subjectsForGrade(cls.grade);
        const prev = db.papers.filter((p) => p.classId === cls.id && p.exam !== App.ctx.exam);
        modal({
            title: `New question paper - ${Store.className(cls)}`,
            body: `<div class="stack">
                <div class="grid grid-2"><div class="field"><label for="np-sub">Subject</label><select class="select" id="np-sub">${subs.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}${s.hpc ? "" : " (marks only)"}</option>`).join("")}${parseInt(cls.grade, 10) >= 6 ? `<option>Physics</option><option>Chemistry</option><option>Biology</option>` : ""}<option value="__other">Other...</option></select></div>
                <div class="field hidden" id="np-other-wrap"><label for="np-other">Subject name</label><input class="input" id="np-other" placeholder="e.g. Sanskrit"></div>
                <div class="field"><label for="np-dur">Duration</label><input class="input" id="np-dur" value="1.5 hrs"></div></div>
                <div class="field"><label for="np-start">Start from</label><select class="select" id="np-start"><option value="blank">Blank paper (one core section)</option><option value="lo">Sections from Outcomes (one per skill area + extra sections)</option>${prev.map((p) => `<option value="copy:${p.id}">Copy: ${esc(p.title)}</option>`).join("")}</select>
                <span class="help">Hindi, Odia and Sanskrit can be typed or pasted directly into any question.</span></div></div>`,
            foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Create & open</button>`,
            onMount: (m) => {
                $("#np-sub", m.el).addEventListener("change", (e) => $("#np-other-wrap", m.el).classList.toggle("hidden", e.target.value !== "__other"));
                $("[data-ok]", m.el).addEventListener("click", () => {
                    let subject = $("#np-sub", m.el).value; if (subject === "__other") subject = $("#np-other", m.el).value.trim();
                    if (!subject) { toast("Enter a subject", "err"); return; }
                    const start = $("#np-start", m.el).value;
                    const exam = Store.examById(App.ctx.exam);
                    let p;
                    if (start.startsWith("copy:")) {
                        p = Store.clone(Store.paper(start.slice(5)));
                        p.id = Store.uid("pp"); p.sections.forEach((s) => { s.id = Store.uid("sec"); s.questions.forEach((q) => { q.id = Store.uid("q"); (q.parts || []).forEach((pt) => { pt.id = Store.uid("p"); }); }); });
                        p.subject = subject;
                    } else {
                        p = { id: Store.uid("pp"), classId: cls.id, subject, hpcSubject: FW.MERGE_HINTS[subject] && parseInt(cls.grade, 10) <= 10 ? subject : subject, settings: { answerSpace: false }, sections: [] };
                        const lib = Store.libFor(cls.grade, subject);
                        if (start === "lo" && lib.length) {
                            lib.filter((c) => c.kind === "regular").forEach((c) => p.sections.push({ id: Store.uid("sec"), name: c.title, type: "main", component: null, questions: [] }));
                            FW.componentsForGrade(cls.grade).forEach((k) => { if (lib.some((c) => c.kind === k)) p.sections.push({ id: Store.uid("sec"), name: FW.componentLabel(k, subject), type: "additional", component: k, questions: [] }); });
                        } else p.sections.push({ id: Store.uid("sec"), name: "Section A", type: "main", component: null, questions: [] });
                    }
                    Object.assign(p, { classId: cls.id, exam: exam.id, title: `${subject} - ${exam.name}`, duration: $("#np-dur", m.el).value, status: "draft", createdBy: App.persona().staffId, createdAt: new Date().toISOString().slice(0, 10) });
                    if (!p.hpcSubject || start.startsWith("copy:")) p.hpcSubject = subject;
                    Store.db.papers.push(p); Store.save(); m.close(); App.go("paper/" + p.id);
                });
            }
        });
    }

    function mergeModal(cls, list, root) {
        modal({
            title: "Merge papers into one subject",
            body: `<div class="stack"><p class="small muted">Example: Physics, Chemistry and Biology papers set by different teachers combine into Science. Core sections add up to the Science total; extra sections with the same report field (e.g. Notebook) are added together. Each teacher still grades their own paper.</p>
                <div class="field"><label>Papers</label>${list.map((p) => `<label class="check"><input type="checkbox" value="${p.id}" ${p.hpcSubject !== p.subject ? "checked" : ""}> ${esc(p.subject)} <span class="muted small">(${esc(breakdownText(p))})</span></label>`).join("")}</div>
                <div class="field"><label for="mg-into">Show on the report as</label><input class="input" id="mg-into" list="mg-subs" value="${esc(Object.values(list).find((p) => p.hpcSubject !== p.subject)?.hpcSubject || "Science")}"><datalist id="mg-subs">${hpcSubjects(cls.grade).map((s) => `<option value="${esc(s)}">`).join("")}</datalist></div></div>`,
            foot: `<button class="btn" data-unmerge>Unmerge selected</button><button class="btn btn-primary" data-ok>${icon("merge")}Merge</button>`,
            onMount: (m) => {
                const sel = () => $$("input[type=checkbox]:checked", m.el).map((i) => Store.paper(i.value));
                $("[data-ok]", m.el).addEventListener("click", () => {
                    const into = $("#mg-into", m.el).value.trim(); const ps = sel();
                    if (ps.length < 2 || !into) { toast("Pick at least two papers and a subject", "err"); return; }
                    ps.forEach((p) => { p.hpcSubject = into; }); Store.save(); m.close(); toast(`${ps.length} papers merged into ${into}`); V.papers(root);
                });
                $("[data-unmerge]", m.el).addEventListener("click", () => { sel().forEach((p) => { p.hpcSubject = p.subject; }); Store.save(); m.close(); toast("Unmerged"); V.papers(root); });
            }
        });
    }

    // ---------------------------------------------------------------------
    // Paper builder
    // ---------------------------------------------------------------------
    let activeRich = null;
    V.paper = (root, [pid]) => {
        const p = Store.paper(pid);
        if (!p) { root.innerHTML = `<div class="empty"><h4>Paper not found</h4></div>`; return; }
        const cls = Store.cls(p.classId);
        const grade = cls.grade;
        const compKeys = FW.componentsForGrade(grade);
        const lib = Store.libFor(grade, p.hpcSubject).length ? Store.libFor(grade, p.hpcSubject) : Store.libFor(grade, p.subject);
        const loIdx = Store.loIndex(grade);
        const isHpc = hpcSubjects(grade).includes(p.hpcSubject);
        const w = paperWarnings(p);
        const save = () => Store.save();
        renumber(p);

        const loTags = (ids) => (ids && ids.length ? ids.map((id) => `<span class="lo-tag" data-tip="${esc(loIdx[id] ? loIdx[id].text : id)}">${esc(loIdx[id] ? loIdx[id].code : "?")}</span>`).join("") : isHpc ? `<span class="lo-tag missing">${icon("alert", "")} Map outcome</span>` : "");
        const qHtml = (sec, q) => `
            <div class="q-row" data-q="${q.id}">
                <div class="q-num">Q${esc(q.label)}</div>
                <div class="q-body">
                    <div class="rich" contenteditable="true" data-rich="q" data-placeholder="Type or paste the question (Hindi, Odia, Sanskrit supported)">${UI.cleanRich(q.text)}</div>
                    ${q.qtype === "mcq" ? `<div class="mcq-opts">${q.options.map((o, i) => `<div class="opt"><b>(${String.fromCharCode(97 + i)})</b><input class="input" data-opt="${i}" value="${esc(o)}" placeholder="Option ${String.fromCharCode(97 + i)}" style="flex:1"></div>`).join("")}</div>` : ""}
                    ${q.image ? `<div class="q-img"><img src="${q.image.data}" class="img-${q.image.size}" alt="Question ${esc(q.label)} figure"><div class="stack" style="gap:4px"><div class="seg">${["s", "m", "l"].map((sz) => `<button class="${q.image.size === sz ? "on" : ""}" data-imgsize="${sz}">${sz.toUpperCase()}</button>`).join("")}</div><button class="btn btn-sm btn-ghost btn-danger" data-imgdel>${icon("trash")}Remove</button></div></div>` : ""}
                    ${(q.parts || []).length ? `<div class="q-parts">${q.parts.map((pt) => `<div class="q-part" data-part="${pt.id}"><b>(${pt.label})</b><div><div class="rich" contenteditable="true" data-rich="part" data-placeholder="Sub-question">${UI.cleanRich(pt.text)}</div><div class="lo-tags" data-maplo-part="${pt.id}">${loTags(pt.loIds)}</div></div><input class="input num" type="number" min="0" step="0.5" value="${pt.marks}" data-partmarks aria-label="Marks for ${q.label}${pt.label}"><button class="icon-btn" style="color:var(--text-subtle)" data-partdel aria-label="Delete sub-part">${icon("x")}</button></div>`).join("")}</div>` : ""}
                    <div class="row" style="margin-top:8px;gap:6px">
                        ${(q.parts || []).length ? "" : `<div class="lo-tags" data-maplo style="margin:0">${loTags(q.loIds)}</div>`}
                        <span class="src-tag">${q.source === "bank" ? "Bank" : q.source === "ai" ? "Suggested - review" : "Own"}</span>
                        <span style="flex:1"></span>
                        <button class="btn btn-sm btn-ghost" data-addpart>${icon("plus")}Sub-part</button>
                        <button class="btn btn-sm btn-ghost" data-img>${icon("image")}Image</button>
                    </div>
                </div>
                <div class="q-meta">
                    <select class="select" data-qtype aria-label="Question type">${[["short", "Short answer"], ["long", "Long answer"], ["mcq", "MCQ"], ["fill", "Fill in the blank"]].map(([v, l]) => `<option value="${v}" ${q.qtype === v ? "selected" : ""}>${l}</option>`).join("")}</select>
                    <div class="row" style="gap:6px;flex-wrap:nowrap"><input class="input num" type="number" min="0" step="0.5" value="${Store.qMarks(q)}" data-qmarks ${(q.parts || []).length ? "disabled title='Sum of sub-parts'" : ""} style="width:70px" aria-label="Marks"><span class="small muted">marks</span></div>
                    <button class="btn btn-sm btn-ghost btn-danger" data-qdel>${icon("trash")}Delete</button>
                </div>
            </div>`;

        root.innerHTML = `
        <div class="crumb"><a href="#/papers">Papers</a> / ${esc(Store.className(cls))} / ${esc(Store.examById(p.exam).name)}</div>
        <div class="view-header">
            <div style="flex:1;min-width:280px"><input class="input" id="pp-title" value="${esc(p.title)}" style="font-family:var(--font-heading);font-size:20px;font-weight:700;width:100%;max-width:560px" aria-label="Paper title"></div>
            <div class="actions">
                ${p.status === "published" ? `<span class="badge badge-green">Published</span>` : `<span class="badge badge-gray">Draft</span>`}
                <a class="btn" href="#/preview/${p.id}">${icon("print")}Preview & print</a>
                ${p.status === "published" ? `<button class="btn" id="pp-unpub">Move to draft</button><a class="btn btn-primary" href="#/marks/${p.id}">${icon("grader")}Marks</a>` : `<button class="btn btn-primary" id="pp-pub">${icon("check")}Publish paper</button>`}
            </div>
        </div>
        <div class="card card-pad" style="position:sticky;top:-24px;z-index:5;margin-bottom:16px">
            <div class="row-between">${breakdownHtml(p)}<div class="row small muted">${icon("info", "")}<span>Subject total counts core sections only</span></div></div>
            ${w.length ? `<div class="alert alert-warn mt-8">${icon("alert")}<div class="body">${w.map(esc).join("<br>")}</div></div>` : ""}
            <div class="row-between mt-8">${UI.symBar()}<div class="row">
                <label class="check"><input type="checkbox" id="pp-ans" ${p.settings.answerSpace ? "checked" : ""}> Show answer space</label>
                <div class="field" style="flex-direction:row;align-items:center;gap:6px"><label for="pp-dur" class="small">Duration</label><input class="input" id="pp-dur" value="${esc(p.duration || "")}" style="width:90px"></div>
                <div class="field" style="flex-direction:row;align-items:center;gap:6px"><label for="pp-hpc" class="small">Reports as</label><input class="input" id="pp-hpc" value="${esc(p.hpcSubject)}" style="width:130px" title="Set the same subject on several papers to merge them, e.g. Physics + Chemistry + Biology into Science"></div>
            </div></div>
        </div>
        <div id="secs">
        ${p.sections.map((sec, si) => `
            <div class="section-card ${sec.type === "additional" ? "add" : ""}" data-sec="${sec.id}">
                <div class="section-head">
                    <input class="input title" value="${esc(sec.name)}" data-secname aria-label="Section name">
                    <select class="select" data-sectype aria-label="Section type"><option value="main" ${sec.type === "main" ? "selected" : ""}>Core</option><option value="additional" ${sec.type === "additional" ? "selected" : ""}>Extra</option></select>
                    ${sec.type === "additional" ? `<select class="select" data-seccomp aria-label="Report field" style="${sec.component ? "" : "border-color:var(--color-warning)"}"><option value="">Report field...</option>${compKeys.map((k) => `<option value="${k}" ${sec.component === k ? "selected" : ""}>${esc(FW.componentLabel(k, p.hpcSubject))}</option>`).join("")}</select>` : ""}
                    <span class="badge ${sec.type === "main" ? "badge-green" : "badge-yellow"}">${sec.type === "main" ? "Counts in subject total" : "Not in subject total"}</span>
                    <span class="strong num">${fmt(Store.secMax(sec))} marks</span>
                    <span style="flex:1"></span>
                    ${si > 0 ? `<button class="btn btn-sm btn-ghost" data-secup title="Move up">↑</button>` : ""}
                    <button class="btn btn-sm btn-ghost btn-danger" data-secdel aria-label="Delete section">${icon("trash")}</button>
                </div>
                ${sec.questions.map((q) => qHtml(sec, q)).join("") || `<div class="empty small">No questions yet.</div>`}
                <div class="row" style="padding:10px 14px;border-top:1px solid var(--border-color)">
                    <button class="btn btn-sm" data-addq>${icon("plus")}Type a question</button>
                    <button class="btn btn-sm" data-bank>${icon("library")}From bank</button>
                    <button class="btn btn-sm btn-soft" data-ai>${icon("sparkle")}Suggest questions</button>
                </div>
            </div>`).join("")}
        </div>
        <div class="row"><button class="btn" id="add-main">${icon("plus")}Core section</button>
            <div class="row" style="gap:6px"><select class="select" id="add-preset" aria-label="Extra section field">${compKeys.map((k) => `<option value="${k}">${esc(FW.componentLabel(k, p.hpcSubject))}</option>`).join("")}</select><button class="btn" id="add-add">${icon("plus")}Extra section</button></div>
            <span class="small muted">${parseInt(grade, 10) <= 5 ? "Grades 1-5: Oral, Activity" : parseInt(grade, 10) <= 8 ? "Grades 6-8: Enrichment, Notebook" : ""}</span></div>`;

        const rerender = () => { save(); V.paper(root, [pid]); };
        const findQ = (el) => { const sec = p.sections.find((s) => s.id === el.closest("[data-sec]").dataset.sec); const qEl = el.closest("[data-q]"); return { sec, q: qEl ? sec.questions.find((x) => x.id === qEl.dataset.q) : null }; };

        // header fields
        $("#pp-title", root).addEventListener("input", (e) => { p.title = e.target.value; save(); });
        $("#pp-dur", root).addEventListener("input", (e) => { p.duration = e.target.value; save(); });
        $("#pp-hpc", root).addEventListener("change", (e) => { p.hpcSubject = e.target.value.trim() || p.subject; rerender(); });
        $("#pp-ans", root).addEventListener("change", (e) => { p.settings.answerSpace = e.target.checked; save(); });
        const pub = $("#pp-pub", root);
        if (pub) pub.addEventListener("click", async () => {
            const ww = paperWarnings(p);
            if (Store.units(p).length === 0) { toast("Add at least one question", "err"); return; }
            if (ww.length && !(await confirmBox("Publish with warnings?", ww.join(" "), "Publish anyway"))) return;
            p.status = "published"; rerender(); toast(`Published: ${breakdownText(p)}`);
        });
        const unpub = $("#pp-unpub", root);
        if (unpub) unpub.addEventListener("click", () => { p.status = "draft"; rerender(); });

        // rich text + symbol bar
        $$("[data-rich]", root).forEach((el) => el.addEventListener("focus", () => { activeRich = el; }));
        $$("[data-rich]", root).forEach((el) => el.addEventListener("input", () => {
            const { q } = findQ(el);
            const html = UI.cleanRich(el.innerHTML);
            if (el.dataset.rich === "q") q.text = html; else q.parts.find((x) => x.id === el.closest("[data-part]").dataset.part).text = html;
            save();
        }));
        $$("[data-rich]", root).forEach((el) => el.addEventListener("paste", (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData("text/plain");
            document.execCommand("insertText", false, text);
        }));
        $(".sym-bar", root).addEventListener("mousedown", (e) => {
            const b = e.target.closest("button"); if (!b) return;
            e.preventDefault();
            if (!activeRich || !document.body.contains(activeRich)) { toast("Click inside a question first", "err"); return; }
            activeRich.focus();
            if (b.dataset.cmd) document.execCommand(b.dataset.cmd); else document.execCommand("insertText", false, b.dataset.sym);
            activeRich.dispatchEvent(new Event("input"));
        });

        // section-level
        $$("[data-secname]", root).forEach((el) => el.addEventListener("input", () => { findQ(el).sec.name = el.value; save(); }));
        $$("[data-sectype]", root).forEach((el) => el.addEventListener("change", () => { const { sec } = findQ(el); sec.type = el.value; if (sec.type === "main") sec.component = null; rerender(); }));
        $$("[data-seccomp]", root).forEach((el) => el.addEventListener("change", () => { const { sec } = findQ(el); sec.component = el.value || null; if (sec.component && /^Section|Activity Corner/.test(sec.name)) sec.name = FW.componentLabel(sec.component, p.hpcSubject); rerender(); }));
        $$("[data-secdel]", root).forEach((el) => el.addEventListener("click", async () => { const { sec } = findQ(el); if (sec.questions.length && !(await confirmBox("Delete section?", `"${sec.name}" and its ${sec.questions.length} question(s) will be removed.`, "Delete"))) return; p.sections.splice(p.sections.indexOf(sec), 1); rerender(); }));
        $$("[data-secup]", root).forEach((el) => el.addEventListener("click", () => { const { sec } = findQ(el); const i = p.sections.indexOf(sec); p.sections.splice(i, 1); p.sections.splice(i - 1, 0, sec); rerender(); }));
        $("#add-main", root).addEventListener("click", () => { p.sections.push({ id: Store.uid("sec"), name: `Section ${String.fromCharCode(65 + p.sections.length)}`, type: "main", component: null, questions: [] }); rerender(); });
        $("#add-add", root).addEventListener("click", () => { const k = $("#add-preset", root).value; p.sections.push({ id: Store.uid("sec"), name: FW.componentLabel(k, p.hpcSubject), type: "additional", component: k, questions: [] }); rerender(); });

        const blankQ = () => ({ id: Store.uid("q"), label: "", text: "", marks: 1, qtype: "short", options: [], image: null, loIds: [], source: "own", parts: [] });
        $$("[data-addq]", root).forEach((el) => el.addEventListener("click", () => { findQ(el).sec.questions.push(blankQ()); rerender(); }));
        // LOs relevant to a section: Main -> regular LOs; Additional -> LOs of its component kind only
        const losFor = (sec) => lib.filter((c) => (sec.type === "main" ? c.kind === "regular" : sec.component ? c.kind === sec.component : c.kind !== "regular"));
        $$("[data-bank]", root).forEach((el) => el.addEventListener("click", () => bankModal(findQ(el).sec, losFor(findQ(el).sec), rerender)));
        $$("[data-ai]", root).forEach((el) => el.addEventListener("click", () => suggestModal(findQ(el).sec, losFor(findQ(el).sec), rerender)));

        // question-level
        $$("[data-qtype]", root).forEach((el) => el.addEventListener("change", () => { const { q } = findQ(el); q.qtype = el.value; if (q.qtype === "mcq" && q.options.length < 4) q.options = ["", "", "", ""]; rerender(); }));
        $$("[data-qmarks]", root).forEach((el) => el.addEventListener("change", () => { findQ(el).q.marks = Math.max(0, Number(el.value) || 0); rerender(); }));
        $$("[data-opt]", root).forEach((el) => el.addEventListener("input", () => { findQ(el).q.options[Number(el.dataset.opt)] = el.value; save(); }));
        $$("[data-qdel]", root).forEach((el) => el.addEventListener("click", () => { const { sec, q } = findQ(el); sec.questions.splice(sec.questions.indexOf(q), 1); rerender(); }));
        $$("[data-addpart]", root).forEach((el) => el.addEventListener("click", () => {
            const { q } = findQ(el);
            if (!q.parts.length) q.parts.push({ id: Store.uid("p"), label: "a", text: "", marks: Store.qMarks(q) || 1, loIds: q.loIds.slice() });
            q.parts.push({ id: Store.uid("p"), label: "", text: "", marks: 1, loIds: q.loIds.slice() });
            rerender();
        }));
        $$("[data-partmarks]", root).forEach((el) => el.addEventListener("change", () => { const { q } = findQ(el); q.parts.find((x) => x.id === el.closest("[data-part]").dataset.part).marks = Math.max(0, Number(el.value) || 0); rerender(); }));
        $$("[data-partdel]", root).forEach((el) => el.addEventListener("click", () => { const { q } = findQ(el); q.parts = q.parts.filter((x) => x.id !== el.closest("[data-part]").dataset.part); if (q.parts.length === 1) { q.marks = q.parts[0].marks; q.loIds = q.parts[0].loIds; q.parts = []; } rerender(); }));
        $$("[data-img]", root).forEach((el) => el.addEventListener("click", async () => {
            const f = await UI.pickFile("image/*"); if (!f) return;
            if (f.size > 1.5 * 1024 * 1024) { toast("Image is larger than 1.5 MB - please compress it first", "err"); return; }
            findQ(el).q.image = { data: await UI.readAsDataURL(f), size: "m" }; rerender();
        }));
        $$("[data-imgsize]", root).forEach((el) => el.addEventListener("click", () => { findQ(el).q.image.size = el.dataset.imgsize; rerender(); }));
        $$("[data-imgdel]", root).forEach((el) => el.addEventListener("click", () => { findQ(el).q.image = null; rerender(); }));
        const mapLo = (el, target) => {
            const { sec } = findQ(el);
            const comps = losFor(sec);
            const sel = new Set(target.loIds || []);
            modal({
                title: "Map outcomes",
                body: comps.length ? comps.map((c) => `<div style="margin-bottom:10px"><div class="strong small" style="margin-bottom:4px"><span class="code">${esc(c.code)}</span> ${esc(c.title)}</div>${c.los.map((lo) => `<label class="check" style="display:flex;padding:3px 0"><input type="checkbox" value="${lo.id}" ${sel.has(lo.id) ? "checked" : ""}><span><span class="code">${esc(lo.code)}</span> ${esc(lo.text)}</span></label>`).join("")}</div>`).join("") : `<div class="empty">No outcomes for this ${sec.type === "main" ? "subject" : "field"} yet. Add them under Outcomes.</div>`,
                foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save mapping</button>`,
                onMount: (m) => $("[data-ok]", m.el).addEventListener("click", () => { target.loIds = $$("input:checked", m.el).map((i) => i.value); m.close(); rerender(); })
            });
        };
        $$("[data-maplo]", root).forEach((el) => el.addEventListener("click", () => mapLo(el, findQ(el).q)));
        $$("[data-maplo-part]", root).forEach((el) => el.addEventListener("click", () => mapLo(el, findQ(el).q.parts.find((x) => x.id === el.dataset.maploPart))));
    };

    function bankModal(sec, comps, done) {
        const loIds = new Set(comps.flatMap((c) => c.los.map((l) => l.id)));
        const items = FW.QUESTION_BANK.filter((b) => loIds.has(b.lo));
        const loText = {}; comps.forEach((c) => c.los.forEach((l) => { loText[l.id] = l; }));
        modal({
            title: `Bank - ${sec.name}`, wide: true,
            body: items.length ? items.map((b, i) => `<label class="check" style="display:flex;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border-color)"><input type="checkbox" value="${i}" style="margin-top:3px"><span style="flex:1">${esc(b.text)}<div class="row mt-8" style="gap:6px"><span class="code">${esc(loText[b.lo].code)}</span><span class="small muted">${esc(loText[b.lo].text)}</span><span class="badge badge-gray">${b.marks} mark${b.marks > 1 ? "s" : ""}</span></div></span></label>`).join("") : `<div class="empty"><h4>No bank questions for these outcomes yet</h4>Questions you write are added to the bank automatically in a later release.</div>`,
            foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Add selected</button>`,
            onMount: (m) => $("[data-ok]", m.el).addEventListener("click", () => {
                $$("input:checked", m.el).forEach((i) => { const b = items[Number(i.value)]; sec.questions.push({ id: Store.uid("q"), label: "", text: esc(b.text), marks: b.marks, qtype: b.qtype, options: (b.options || []).slice(), image: null, loIds: [b.lo], source: "bank", parts: [] }); });
                m.close(); done();
            })
        });
    }

    // Offline drafting from LO wording. Drafts are tagged "Suggested - review".
    function suggestModal(sec, comps, done) {
        const los = comps.flatMap((c) => c.los);
        modal({
            title: `Suggest questions - ${sec.name}`,
            body: los.length ? `<div class="stack"><div class="alert alert-info">${icon("sparkle")}<div class="body">Drafts are written from the outcome wording and mapped automatically. Edit them before publishing.</div></div>
                <div class="field"><label for="sg-lo">Outcome</label><select class="select" id="sg-lo">${los.map((l) => `<option value="${l.id}">${esc(l.code)} - ${esc(l.text)}</option>`).join("")}</select></div>
                <div class="grid grid-2"><div class="field"><label for="sg-n">How many</label><select class="select" id="sg-n"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></div>
                <div class="field"><label for="sg-m">Marks each</label><input class="input" type="number" id="sg-m" value="2" min="1"></div></div></div>` : `<div class="empty">No outcomes for this section.</div>`,
            foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-soft" data-ok>${icon("sparkle")}Add drafts</button>`,
            onMount: (m) => { const ok = $("[data-ok]", m.el); ok.addEventListener("click", () => {
                const lo = los.find((l) => l.id === $("#sg-lo", m.el).value); if (!lo) return;
                const n = Number($("#sg-n", m.el).value), mk = Math.max(1, Number($("#sg-m", m.el).value) || 1);
                const v = toVerb(lo.text);
                const stems = [
                    { text: `Give two examples to show that you can ${v}.`, qtype: mk >= 4 ? "long" : "short" },
                    { text: `How would you ${v} in a real-life situation? Explain briefly.`, qtype: "short" },
                    { text: `Which of the following best shows how to ${v}?`, qtype: "mcq", options: ["", "", "", ""] },
                    { text: `Read the given text/figure carefully and ${v}.`, qtype: mk >= 4 ? "long" : "short" }
                ];
                for (let i = 0; i < n; i++) { const s = stems[i % stems.length]; sec.questions.push({ id: Store.uid("q"), label: "", text: esc(s.text), marks: s.qtype === "mcq" ? 1 : mk, qtype: s.qtype, options: s.options ? s.options.slice() : [], image: null, loIds: [lo.id], source: "ai", parts: [] }); }
                m.close(); done(); toast(`${n} draft${n > 1 ? "s" : ""} added - please review`);
            }); }
        });
    }

    // ---------------------------------------------------------------------
    // Print preview
    // ---------------------------------------------------------------------
    V.preview = (root, [pid]) => {
        const p = Store.paper(pid);
        if (!p) { root.innerHTML = `<div class="empty"><h4>Paper not found</h4></div>`; return; }
        const cls = Store.cls(p.classId); const inst = Store.db.institution; const b = Store.breakdown(p);
        const ans = p.settings.answerSpace;
        const lines = (m) => (ans ? `<div style="grid-column:2/3">${Array.from({ length: Math.min(8, Math.max(1, Math.ceil(m))) }, () => `<div class="ans-space"></div>`).join("")}</div>` : "");
        root.innerHTML = `
        <div class="crumb no-print"><a href="#/papers">Papers</a> / <a href="#/paper/${p.id}">${esc(p.title)}</a> / Preview</div>
        <div class="view-header"><div><h2>Print preview</h2><span class="subtitle">No QR codes, no wasted margins. Answer space is ${ans ? "shown" : "hidden"} - students write on separate sheets.</span></div>
        <div class="actions"><label class="check"><input type="checkbox" id="pv-ans" ${ans ? "checked" : ""}> Answer space</label><a class="btn" href="#/paper/${p.id}">${icon("edit")}Edit</a><button class="btn btn-primary" onclick="window.print()">${icon("print")}Print</button></div></div>
        <div class="paper-sheet">
            <div class="ph"><h2>${esc(inst.name)}</h2><div class="strong">${esc(Store.examById(p.exam).name)} Examination ${esc(inst.session)}</div>
                <div class="pinfo"><span>Class: ${esc(Store.className(cls))}</span><span>Subject: ${esc(p.subject)}</span></div>
                <div class="pinfo"><span>Time: ${esc(p.duration || "")}</span><span>Max. Marks: ${fmt(b.main)}${Object.values(b.comps).length ? " + " + Object.entries(b.comps).map(([k, v]) => `${fmt(v)} (${esc(FW.componentLabel(k, p.hpcSubject))})`).join(" + ") : ""}</span></div></div>
            ${p.sections.map((sec) => `<div class="psec"><h4>${esc(sec.name)}</h4>
                ${sec.questions.map((q) => `<div class="pq"><b>${esc(q.label)}.</b><div>${UI.cleanRich(q.text)}
                    ${q.qtype === "mcq" ? `<div class="mcq-opts">${q.options.map((o, i) => `<div>(${String.fromCharCode(97 + i)}) ${esc(o)}</div>`).join("")}</div>` : ""}
                    ${q.image ? `<div class="q-img"><img src="${q.image.data}" class="img-${q.image.size}" alt=""></div>` : ""}
                    ${(q.parts || []).map((pt) => `<div class="pq" style="grid-template-columns:24px 1fr 40px;margin:4px 0"><span>(${pt.label})</span><div>${UI.cleanRich(pt.text)}</div><span class="m">[${fmt(pt.marks)}]</span>${lines(pt.marks)}</div>`).join("")}
                </div><span class="m">${(q.parts || []).length ? "" : `[${fmt(q.marks)}]`}</span>${(q.parts || []).length ? "" : lines(q.marks)}</div>`).join("")}
            </div>`).join("")}
        </div>`;
        $("#pv-ans", root).addEventListener("change", (e) => { p.settings.answerSpace = e.target.checked; Store.save(); V.preview(root, [pid]); });
    };

    // ---------------------------------------------------------------------
    // Exam grader
    // ---------------------------------------------------------------------
    V.marks = (root, params) => {
        const db = Store.db; const ctx = App.ctx;
        let p = params && params[0] ? Store.paper(params[0]) : null;
        if (p) { App.setCtx({ classId: p.classId, exam: p.exam }); }
        const cls = App.ensureClass();
        if (!cls) { root.innerHTML = `<div class="empty"><h4>No class assigned</h4></div>`; return; }
        const papers = db.papers.filter((x) => x.classId === cls.id && x.exam === ctx.exam && x.status === "published");
        if (!p || p.classId !== cls.id || p.exam !== ctx.exam) p = papers[0];
        const st = (V.marks.state = V.marks.state || { mode: "table", sIdx: 0 });

        const head = `
        <div class="view-header"><div><h2>Marks</h2><span class="subtitle">Marks are saved per question. Subject totals count core sections only; each extra section is totalled separately for its report field.</span></div>
        <div class="actions">${p ? `<div class="seg" id="gr-mode"><button class="${st.mode === "table" ? "on" : ""}" data-m="table">Table</button><button class="${st.mode === "student" ? "on" : ""}" data-m="student">Student-wise</button></div>
            <button class="btn" id="gr-tpl">${icon("download")}Excel template</button><button class="btn" id="gr-up">${icon("upload")}Upload Excel</button>` : ""}</div></div>
        <div class="toolbar">${App.classSelect()}${App.examSelect()}
            <div class="field"><label for="gr-paper">Question paper</label><select class="select" id="gr-paper">${papers.map((x) => `<option value="${x.id}" ${p && x.id === p.id ? "selected" : ""}>${esc(x.subject)} - ${esc(breakdownText(x))}</option>`).join("")}</select></div>
            <div class="spacer"></div>${p ? `<div id="gr-progress" class="small muted"></div>` : ""}</div>`;

        if (!p) {
            root.innerHTML = head.replace(/<select class="select" id="gr-paper">.*?<\/select>/s, `<span class="small muted">No published papers</span>`) + `<div class="card empty"><h4>No published papers for this examination</h4>Publish a paper in Papers first.<div class="mt-16"><a class="btn btn-primary" href="#/papers">${icon("builder")}Open Papers</a></div></div>`;
            App.bindCtx(root); return;
        }
        const studs = Store.studentsOf(cls.id);
        const us = Store.units(p);
        const book = (db.marks[p.id] = db.marks[p.id] || {});
        const b = Store.breakdown(p);
        const compKeys = Object.keys(b.comps);
        const lockI = icon("lock", "lock");

        const progress = () => { const done = studs.filter((s) => { const r = Store.paperResult(p, s.id); return r && r.complete; }).length; const el = $("#gr-progress", root); if (el) el.innerHTML = `<b>${done}</b> of ${studs.length} students complete`; };
        const valOf = (sid, u) => { const r = book[sid]; if (!r) return ""; if (r.ab) return "AB"; const v = r.m[u.id]; return v == null ? "" : v; };

        let body = "";
        if (st.mode === "table") {
            // header rows: section / question / sub-part
            let r1 = `<th class="name sticky-col" rowspan="3">Roll - Student</th>`, r2 = "", r3 = "";
            p.sections.forEach((sec) => {
                const secUnits = us.filter((u) => u.section === sec);
                r1 += `<th class="sec ${sec.type === "additional" ? "add" : ""}" colspan="${secUnits.length + 1}">${esc(sec.name)}${sec.type === "additional" && (!sec.component || FW.componentLabel(sec.component, p.hpcSubject) !== sec.name) ? ` <span style="font-weight:600">(${esc(sec.component ? FW.componentLabel(sec.component, p.hpcSubject) : "no report field")})</span>` : ""}</th>`;
                sec.questions.forEach((q) => {
                    if (q.parts && q.parts.length) { r2 += `<th class="q" colspan="${q.parts.length}">Q${esc(q.label)}</th>`; q.parts.forEach((pt) => { r3 += `<th class="q">${esc(pt.label)}<span class="max">/${fmt(pt.marks)}</span></th>`; }); }
                    else r2 += `<th class="q" rowspan="2">Q${esc(q.label)}<span class="max">/${fmt(q.marks)}</span></th>`;
                });
                r2 += `<th class="sub" rowspan="2">${lockI} Sub<span class="max">/${fmt(Store.secMax(sec))}</span></th>`;
            });
            r1 += `<th class="tot" rowspan="3">${esc(p.subject)}<span class="max" style="display:block">/${fmt(b.main)}</span></th>`;
            compKeys.forEach((k) => { r1 += `<th class="comp" rowspan="3">${esc(FW.componentLabel(k, p.hpcSubject))}<span class="max" style="display:block">/${fmt(b.comps[k])}</span></th>`; });
            r1 += `<th rowspan="3" class="small" title="All sections - reference only">Paper<span class="max" style="display:block">ref.</span></th><th rowspan="3">AB</th>`;
            const rowHtml = (s) => {
                let cells = `<td class="name sticky-col"><span class="muted num">${s.roll}.</span> ${esc(s.name)}</td>`;
                p.sections.forEach((sec) => {
                    us.filter((u) => u.section === sec).forEach((u) => { const v = valOf(s.id, u); cells += `<td><input class="mk ${v === "AB" ? "ab" : ""}" inputmode="decimal" data-s="${s.id}" data-u="${u.id}" data-max="${u.max}" value="${esc(v)}" aria-label="${esc(s.name)} Q${esc(u.label)}"></td>`; });
                    cells += `<td class="sub" data-subof="${sec.id}"></td>`;
                });
                cells += `<td class="tot" data-main></td>` + compKeys.map((k) => `<td class="comp" data-comp="${k}"></td>`).join("") + `<td class="small muted num" data-paper></td>`;
                cells += `<td><input type="checkbox" data-ab="${s.id}" ${book[s.id] && book[s.id].ab ? "checked" : ""} aria-label="Absent"></td>`;
                return `<tr data-row="${s.id}">${cells}</tr>`;
            };
            body = `<div class="table-wrap" style="max-height:calc(100vh - 330px)"><table class="table marks-table"><thead><tr>${r1}</tr><tr>${r2}</tr><tr>${r3}</tr></thead><tbody>${studs.map(rowHtml).join("")}</tbody></table></div>
            <div class="row mt-8 small muted">${icon("info", "")}<span>Type <b>AB</b> in any cell (or tick AB) for an absent student. Enter moves down, Tab moves across. Saved automatically.</span></div>`;
        } else {
            st.sIdx = Math.min(st.sIdx, studs.length - 1);
            const s = studs[st.sIdx];
            body = `<div class="card"><div class="card-head"><div class="row">${avatar(s)}<div><h3>${esc(s.name)}</h3><span class="small muted">Roll ${s.roll} - ${st.sIdx + 1} of ${studs.length}</span></div></div>
                <div class="row"><label class="check"><input type="checkbox" data-ab="${s.id}" ${book[s.id] && book[s.id].ab ? "checked" : ""}> Absent</label><button class="btn btn-sm" id="sw-prev" ${st.sIdx === 0 ? "disabled" : ""}>${icon("back")}Previous</button><button class="btn btn-sm btn-primary" id="sw-next">${st.sIdx === studs.length - 1 ? "Finish" : "Submit & next"}${icon("arrow")}</button></div></div>
                <div data-row="${s.id}">${p.sections.map((sec) => `<div style="border-bottom:1px solid var(--border-color)"><div class="row-between" style="padding:10px 20px;background:${sec.type === "additional" ? "var(--color-secondary-soft)" : "var(--bg-sunken)"}"><b>${esc(sec.name)}</b><span class="small strong">Subtotal <span data-subof="${sec.id}"></span> / ${fmt(Store.secMax(sec))}</span></div>
                    ${us.filter((u) => u.section === sec).map((u) => `<div class="row-between" style="padding:8px 20px;border-top:1px dashed var(--border-color)"><span><b>Q${esc(u.label)}</b> <span class="small muted">${UI.cleanRich((u.q.parts || []).find((x) => x.id === u.id)?.text || u.q.text).replace(/<[^>]+>/g, " ").slice(0, 90)}</span></span><span class="row" style="gap:6px;flex-wrap:nowrap"><input class="input mk num" style="width:70px;text-align:center" inputmode="decimal" data-s="${s.id}" data-u="${u.id}" data-max="${u.max}" value="${esc(valOf(s.id, u))}" aria-label="Q${esc(u.label)}"><span class="small muted">/ ${fmt(u.max)}</span></span></div>`).join("")}</div>`).join("")}
                <div class="row" style="padding:12px 20px;gap:18px"><span class="strong">${esc(p.subject)}: <span data-main></span> / ${fmt(b.main)}</span>${compKeys.map((k) => `<span class="strong">${esc(FW.componentLabel(k, p.hpcSubject))}: <span data-comp="${k}"></span> / ${fmt(b.comps[k])}</span>`).join("")}<span class="small muted">Paper ref. <span data-paper></span></span></div></div></div>`;
        }
        root.innerHTML = head + body;
        App.bindCtx(root);
        $("#gr-paper", root).addEventListener("change", (e) => App.go("marks/" + e.target.value));
        $$("#gr-mode button", root).forEach((bt) => bt.addEventListener("click", () => { st.mode = bt.dataset.m; V.marks(root, [p.id]); }));

        const recalc = (sid) => {
            const row = root.querySelector(`[data-row="${sid}"]`); if (!row) return;
            const r = Store.paperResult(p, sid) || { sec: {}, main: 0, comps: {}, total: 0, ab: false };
            $$("[data-subof]", row).forEach((td) => { td.textContent = r.ab ? "AB" : fmt(r.sec[td.dataset.subof] || 0); });
            const m = $("[data-main]", row); if (m) m.textContent = r.ab ? "AB" : fmt(r.main);
            $$("[data-comp]", row).forEach((td) => { td.textContent = r.ab ? "AB" : fmt(r.comps[td.dataset.comp] || 0); });
            const pp = $("[data-paper]", row); if (pp) pp.textContent = r.ab ? "" : fmt(r.total);
        };
        studs.forEach((s) => recalc(s.id));
        progress();

        $$("input.mk", root).forEach((inp) => {
            inp.addEventListener("input", () => {
                const sid = inp.dataset.s, uidv = inp.dataset.u, max = Number(inp.dataset.max);
                const raw = inp.value.trim();
                const rec = (book[sid] = book[sid] || { ab: false, m: {} });
                if (/^ab$/i.test(raw)) {
                    rec.ab = true; inp.classList.add("ab"); inp.classList.remove("err");
                    const cb = root.querySelector(`[data-ab="${sid}"]`); if (cb) cb.checked = true;
                } else {
                    inp.classList.remove("ab");
                    if (raw === "") { delete rec.m[uidv]; inp.classList.remove("err"); }
                    else {
                        const n = Number(raw);
                        if (isNaN(n) || n < 0 || n > max) { inp.classList.add("err"); inp.title = `Must be between 0 and ${max}`; return; }
                        inp.classList.remove("err"); inp.title = ""; rec.m[uidv] = n; rec.ab = false;
                        const cb = root.querySelector(`[data-ab="${sid}"]`); if (cb) cb.checked = false;
                    }
                }
                Store.save(); recalc(sid); progress();
            });
            inp.addEventListener("keydown", (e) => {
                if (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                e.preventDefault();
                const all = $$(`input.mk[data-u="${inp.dataset.u}"]`, root);
                const i = all.indexOf(inp) + (e.key === "ArrowUp" ? -1 : 1);
                if (all[i]) { all[i].focus(); all[i].select(); }
            });
            inp.addEventListener("focus", () => inp.select());
        });
        $$("[data-ab]", root).forEach((cb) => cb.addEventListener("change", () => {
            const rec = (book[cb.dataset.ab] = book[cb.dataset.ab] || { ab: false, m: {} });
            rec.ab = cb.checked; Store.save();
            $$(`input.mk[data-s="${cb.dataset.ab}"]`, root).forEach((i) => { const u = us.find((x) => x.id === i.dataset.u); i.value = rec.ab ? "AB" : (rec.m[u.id] ?? ""); i.classList.toggle("ab", rec.ab); });
            recalc(cb.dataset.ab); progress();
        }));
        const prev = $("#sw-prev", root), next = $("#sw-next", root);
        if (prev) prev.addEventListener("click", () => { st.sIdx--; V.marks(root, [p.id]); });
        if (next) next.addEventListener("click", () => {
            const r = Store.paperResult(p, studs[st.sIdx].id);
            if (!r || !r.complete) toast("Some questions are blank - saved anyway", "err");
            if (st.sIdx < studs.length - 1) { st.sIdx++; V.marks(root, [p.id]); } else { toast("All students done"); st.mode = "table"; V.marks(root, [p.id]); }
        });
        $("#gr-tpl", root).addEventListener("click", () => excelTemplate(p).catch((e) => toast(e.message, "err")));
        $("#gr-up", root).addEventListener("click", () => excelUpload(p, () => V.marks(root, [p.id])).catch((e) => toast(e.message, "err")));
    };

    // ---------------------------------------------------------------------
    // Excel template: max-marks row, locked subtotal formulas, hidden paper ID
    // ---------------------------------------------------------------------
    const colName = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
    function templateLayout(p) {
        const us = Store.units(p);
        const cols = []; // {kind:'unit'|'sub'|'main'|'comp'|'paper', ...}
        let c = 4; // A=id (hidden), B=Roll, C=Name
        const secCols = {};
        p.sections.forEach((sec) => {
            const first = c;
            us.filter((u) => u.section === sec).forEach((u) => { cols.push({ kind: "unit", col: c++, u, sec }); });
            cols.push({ kind: "sub", col: c++, sec, from: first, to: c - 2 });
            secCols[sec.id] = c - 1;
        });
        const b = Store.breakdown(p);
        cols.push({ kind: "main", col: c++, subs: p.sections.filter((s) => s.type === "main").map((s) => secCols[s.id]) });
        Object.keys(b.comps).forEach((k) => cols.push({ kind: "comp", col: c++, key: k, subs: p.sections.filter((s) => s.type === "additional" && s.component === k).map((s) => secCols[s.id]) }));
        cols.push({ kind: "paper", col: c++, subs: p.sections.map((s) => secCols[s.id]) });
        return { cols, b };
    }
    async function excelTemplate(p) {
        const ExcelJS = await UI.loadExcel();
        const cls = Store.cls(p.classId); const studs = Store.studentsOf(cls.id); const book = Store.db.marks[p.id] || {};
        const { cols, b } = templateLayout(p);
        const wb = new ExcelJS.Workbook(); wb.creator = "revU";
        const ws = wb.addWorksheet("Marks", { views: [{ state: "frozen", xSplit: 3, ySplit: 4 }] });
        const meta = wb.addWorksheet("_meta"); meta.state = "veryHidden";
        meta.getCell("A1").value = "paperId"; meta.getCell("B1").value = p.id;
        cols.filter((x) => x.kind === "unit").forEach((x, i) => { meta.getCell(`A${i + 2}`).value = x.col; meta.getCell(`B${i + 2}`).value = x.u.id; });

        const green = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FF" } }, yellow = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBF3E2" } }, gray = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F7FF" } }, blue = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F3FF" } };
        ws.getCell("B1").value = `${Store.className(cls)} - ${p.title}  (${breakdownText(p)})`; ws.getCell("B1").font = { bold: true, size: 12 };
        ws.getCell("A2").value = "student_id"; ws.getCell("B2").value = "Roll"; ws.getCell("C2").value = "Student name";
        ws.getCell("B3").value = ""; ws.getCell("C3").value = "Question"; ws.getCell("C4").value = "Max marks";
        // row 2 section names, row 3 question labels, row 4 max marks
        p.sections.forEach((sec) => {
            const scs = cols.filter((x) => (x.kind === "unit" || x.kind === "sub") && x.sec === sec);
            const a = scs[0].col, z = scs[scs.length - 1].col;
            ws.mergeCells(2, a, 2, z);
            const cell = ws.getCell(2, a); cell.value = sec.type === "additional" ? `${sec.name} (Extra${sec.component ? " - " + FW.componentLabel(sec.component, p.hpcSubject) : ""})` : sec.name;
            cell.fill = sec.type === "additional" ? yellow : blue; cell.font = { bold: true }; cell.alignment = { horizontal: "center" };
        });
        cols.forEach((x) => {
            const h = ws.getCell(3, x.col), mx = ws.getCell(4, x.col);
            if (x.kind === "unit") { h.value = `Q${x.u.label}`; mx.value = x.u.max; }
            else if (x.kind === "sub") { h.value = "Subtotal"; mx.value = { formula: `SUM(${colName(x.from)}4:${colName(x.to)}4)` }; h.fill = gray; mx.fill = gray; }
            else if (x.kind === "main") { ws.getCell(2, x.col).value = p.subject; h.value = "Subject total"; mx.value = b.main; h.fill = green; mx.fill = green; ws.getCell(2, x.col).fill = green; }
            else if (x.kind === "comp") { ws.getCell(2, x.col).value = FW.componentLabel(x.key, p.hpcSubject); h.value = "Section total"; mx.value = b.comps[x.key]; h.fill = yellow; mx.fill = yellow; ws.getCell(2, x.col).fill = yellow; }
            else { ws.getCell(2, x.col).value = "Paper"; h.value = "Reference only"; mx.value = b.total; }
            h.font = { bold: true }; mx.font = { bold: true, color: { argb: "FF64748B" } }; h.alignment = mx.alignment = { horizontal: "center" };
            ws.getColumn(x.col).width = x.kind === "unit" ? 8 : 12;
        });
        [2, 3, 4].forEach((r) => { ws.getCell(r, 2).font = { bold: true }; ws.getCell(r, 3).font = { bold: true }; });
        ws.getColumn(1).hidden = true; ws.getColumn(2).width = 6; ws.getColumn(3).width = 26;

        studs.forEach((s, i) => {
            const r = 5 + i; const rec = book[s.id];
            ws.getCell(r, 1).value = s.id; ws.getCell(r, 2).value = s.roll; ws.getCell(r, 3).value = s.name;
            cols.forEach((x) => {
                const cell = ws.getCell(r, x.col);
                const ref = (c) => `${colName(c)}${r}`;
                if (x.kind === "unit") {
                    const v = rec ? (rec.ab ? "AB" : rec.m[x.u.id]) : null;
                    cell.value = v == null ? null : v;
                    cell.protection = { locked: false };
                    const a = `${colName(x.col)}${r}`;
                    cell.dataValidation = { type: "custom", allowBlank: true, showErrorMessage: true, errorTitle: "Invalid mark", error: `Enter 0-${x.u.max} or AB`, formulae: [`OR(UPPER(${a})="AB",AND(ISNUMBER(${a}),${a}>=0,${a}<=${colName(x.col)}$4))`] };
                } else if (x.kind === "sub") { cell.value = { formula: `SUM(${colName(x.from)}${r}:${colName(x.to)}${r})` }; cell.fill = gray; }
                else { cell.value = { formula: x.subs.length ? x.subs.map(ref).join("+") : "0" }; cell.fill = x.kind === "main" ? green : x.kind === "comp" ? yellow : undefined; cell.font = { bold: x.kind !== "paper" }; }
                cell.alignment = { horizontal: "center" };
            });
        });
        await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true });
        const buf = await wb.xlsx.writeBuffer();
        UI.download(`${Store.className(cls).replace(/\s+/g, "")}_${p.subject}_${p.exam}_marks.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        toast("Template downloaded - existing marks are pre-filled");
    }

    async function excelUpload(p, done) {
        const f = await UI.pickFile(".xlsx");
        if (!f) return;
        const ExcelJS = await UI.loadExcel();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await f.arrayBuffer());
        const meta = wb.getWorksheet("_meta"); const ws = wb.getWorksheet("Marks");
        if (!meta || !ws) throw new Error("This file is not a revU marks template. Download the template first.");
        const pid = meta.getCell("B1").value;
        if (pid !== p.id) throw new Error(`This template belongs to a different paper${Store.paper(pid) ? ` (${Store.paper(pid).title})` : ""}.`);
        const map = []; for (let i = 2; meta.getCell(`A${i}`).value; i++) map.push({ col: Number(meta.getCell(`A${i}`).value), uid: meta.getCell(`B${i}`).value });
        const us = Store.units(p); const book = (Store.db.marks[p.id] = Store.db.marks[p.id] || {});
        const studs = Store.studentsOf(p.classId);
        const cellVal = (c) => { const v = c.value; if (v && typeof v === "object") return v.result != null ? v.result : v.richText ? v.richText.map((t) => t.text).join("") : v.text != null ? v.text : null; return v; };
        let accepted = 0; const rejected = [];
        for (let r = 5; r <= ws.rowCount; r++) {
            const sid = cellVal(ws.getCell(r, 1)); const name = cellVal(ws.getCell(r, 3));
            if (!sid && !name) continue;
            const s = studs.find((x) => x.id === sid);
            if (!s) { rejected.push({ row: r, who: name || "-", reason: "Student not found in this class" }); continue; }
            const m = {}; let ab = false; const errs = []; let any = false;
            map.forEach(({ col, uid }) => {
                const u = us.find((x) => x.id === uid); if (!u) return;
                let v = cellVal(ws.getCell(r, col));
                if (v == null || v === "") return;
                any = true;
                if (typeof v === "string" && /^\s*ab\s*$/i.test(v)) { ab = true; return; }
                const n = Number(v);
                if (isNaN(n)) errs.push(`Q${u.label}: "${v}" is not a number`);
                else if (n < 0 || n > u.max) errs.push(`Q${u.label}: ${n} exceeds max ${u.max}`);
                else m[uid] = n;
            });
            if (!any) continue;
            if (errs.length) { rejected.push({ row: r, who: s.name, reason: errs.join("; ") }); continue; }
            book[s.id] = { ab, m: ab ? {} : m }; accepted++;
        }
        Store.save();
        modal({
            title: "Upload summary",
            body: `<div class="stack"><div class="alert alert-ok">${icon("check")}<div class="body"><b>${accepted}</b> row${accepted === 1 ? "" : "s"} accepted and saved.</div></div>
                ${rejected.length ? `<div class="alert alert-warn">${icon("alert")}<div class="body"><b>${rejected.length}</b> row${rejected.length === 1 ? "" : "s"} rejected - the rest of the file was still imported. Fix these and upload again.</div></div>
                <div class="table-wrap"><table class="table"><thead><tr><th>Excel row</th><th>Student</th><th>Reason</th></tr></thead><tbody>${rejected.map((x) => `<tr><td class="num">${x.row}</td><td>${esc(x.who)}</td><td class="small">${esc(x.reason)}</td></tr>`).join("")}</tbody></table></div>` : ""}</div>`,
            foot: `<button class="btn btn-primary" data-close>Done</button>`
        });
        done();
    }

    V.breakdownText = breakdownText;
})();
