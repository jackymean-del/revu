// revU HPC - Holistic views: rating grid, quick capture, student self/peer/profile, parent feedback.
(function () {
    "use strict";
    const { icon, esc, $, $$, avatar, pct, lvlChip, toast, modal } = UI;
    const FW = HPC_FW;
    const V = App.views;

    // ---------------------------------------------------------------------
    // Holistic assessment - class grid (keyboard-first) + quick capture
    // ---------------------------------------------------------------------
    V.growth = (root) => {
        const cls = App.ensureClass(); const term = App.ctx.term;
        if (!cls) { root.innerHTML = `<div class="empty"><h4>No class assigned</h4></div>`; return; }
        const st = Store.stageOf(cls); const L = Store.levelsOf(cls); const studs = Store.studentsOf(cls.id);
        const ui = (V.growth.state = V.growth.state || { tab: "grid", dom: "all", sel: [], capDom: null, capLvl: null });
        if (ui.dom !== "all" && !st.domains.some((d) => d.id === ui.dom)) ui.dom = "all";
        const h = Store.H(term);
        const doms = ui.dom === "all" ? st.domains : st.domains.filter((d) => d.id === ui.dom);
        const comps = doms.flatMap((d) => d.competencies.map((c) => ({ d, c })));
        const rated = studs.filter((s) => Store.teacherRatedComplete(s.id, term)).length;
        const prevTerm = term === "Term 2" ? "Term 1" : null;
        let suggestCount = 0;
        studs.forEach((s) => comps.forEach(({ d, c }) => { if ((h.teacher[s.id] || {})[c.id] == null && Store.suggestion(s.id, term, d.id) != null) suggestCount++; }));

        root.innerHTML = `
        <div class="view-header"><div><h2>Growth</h2><span class="subtitle">${esc(st.name)} - ${st.domains.length} domains, ${st.domains.reduce((n, d) => n + d.competencies.length, 0)} indicators. Rate with number keys, or start from last term and adjust only what changed.</span></div>
        <div class="actions">${App.classSelect()}${App.termSelect()}</div></div>
        <div class="tabs"><button class="tab ${ui.tab === "grid" ? "active" : ""}" data-tab="grid">${icon("grader", "")}Rate <span class="badge badge-gray">${rated}/${studs.length}</span></button><button class="tab ${ui.tab === "capture" ? "active" : ""}" data-tab="capture">${icon("capture", "")}Quick note</button></div>
        <div id="hol-body"></div>`;
        App.bindCtx(root);
        $$("[data-tab]", root).forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.tab; V.growth(root); }));
        $$(".tab svg", root).forEach((s) => s.setAttribute("style", "width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2"));
        const body = $("#hol-body", root);

        if (ui.tab === "grid") {
            body.innerHTML = `
            <div class="toolbar" style="align-items:center">
                <div class="seg" id="dom-seg"><button class="${ui.dom === "all" ? "on" : ""}" data-d="all">All domains</button>${st.domains.map((d) => `<button class="${ui.dom === d.id ? "on" : ""}" data-d="${d.id}">${esc(d.name)}</button>`).join("")}</div>
                <div class="spacer"></div>
                ${suggestCount ? `<button class="btn btn-sm btn-accent" id="acc-sug">${icon("sparkle")}Accept ${suggestCount} suggestion${suggestCount > 1 ? "s" : ""} from notes</button>` : ""}
                ${prevTerm ? `<button class="btn btn-sm" id="copy-prev">${icon("copy")}Start from ${prevTerm} (empty cells)</button>` : ""}
            </div>
            <div class="row small muted" style="margin:-6px 0 10px">${L.map((l, i) => `<span class="row" style="gap:4px"><kbd class="badge badge-gray">${i + 1}</kbd>${lvlChip(L, i)}</span>`).join("")}<span><kbd class="badge badge-gray">0</kbd> clear</span><span>Arrow keys move. Click a cell to cycle.</span></div>
            <div class="table-wrap" style="max-height:calc(100vh - 340px)"><table class="table" id="hol-grid">
                <thead>
                    ${ui.dom === "all" ? `<tr><th class="sticky-col" rowspan="2">Student</th>${doms.map((d) => `<th colspan="${d.competencies.length}" style="text-align:center;background:var(--color-accent-soft);color:var(--color-accent)">${esc(d.name)}</th>`).join("")}<th rowspan="2"></th></tr>` : ""}
                    <tr>${ui.dom === "all" ? "" : `<th class="sticky-col">Student</th>`}${comps.map(({ c }, i) => `<th style="min-width:120px;white-space:normal;font-weight:600;vertical-align:top"><div>${esc(c.text)}</div><select class="select" data-fill="${i}" style="margin-top:6px;padding:3px 24px 3px 8px;font-size:11px" aria-label="Fill empty cells"><option value="">Fill empty...</option>${L.map((l, li) => `<option value="${li}">${esc(l.label)}</option>`).join("")}</select></th>`).join("")}${ui.dom === "all" ? "" : "<th></th>"}</tr>
                </thead>
                <tbody>${studs.map((s, ri) => `<tr>
                    <td class="sticky-col nowrap"><a href="#/student/${s.id}" style="color:inherit;text-decoration:none;flex-wrap:nowrap" class="row">${avatar(s, 24)}<span>${esc(s.name)}</span></a></td>
                    ${comps.map(({ d, c }, ci) => {
                        const v = (h.teacher[s.id] || {})[c.id];
                        const sug = v == null ? Store.suggestion(s.id, term, d.id) : null;
                        return `<td style="padding:3px 6px"><button class="lvl-cell ${sug != null ? "suggest" : ""}" data-r="${ri}" data-c="${ci}" data-s="${s.id}" data-k="${c.id}" ${sug != null ? `data-tip="Suggested from notes: ${esc(L[sug].label)}"` : ""} aria-label="${esc(s.name)} - ${esc(c.text)}">${lvlChip(L, v, sug != null ? { placeholder: L[sug].label + "?" } : null)}</button></td>`;
                    }).join("")}
                    <td>${Store.teacherRatedComplete(s.id, term) ? `<span class="badge badge-green">${icon("check")}</span>` : ""}</td>
                </tr>`).join("")}</tbody>
            </table></div>`;
            $$("#dom-seg button", body).forEach((b) => b.addEventListener("click", () => { ui.dom = b.dataset.d; V.growth(root); }));
            const setCell = (btn, v) => {
                const rec = (h.teacher[btn.dataset.s] = h.teacher[btn.dataset.s] || {});
                if (v == null) delete rec[btn.dataset.k]; else rec[btn.dataset.k] = v;
                btn.classList.remove("suggest"); btn.removeAttribute("data-tip");
                btn.innerHTML = lvlChip(L, v);
                Store.save();
            };
            const cells = $$(".lvl-cell", body);
            const at = (r, c) => body.querySelector(`.lvl-cell[data-r="${r}"][data-c="${c}"]`);
            cells.forEach((btn) => {
                btn.addEventListener("click", () => {
                    const cur = (h.teacher[btn.dataset.s] || {})[btn.dataset.k];
                    const next = cur == null ? 0 : cur + 1 >= L.length ? null : cur + 1;
                    setCell(btn, next);
                });
                btn.addEventListener("keydown", (e) => {
                    const r = Number(btn.dataset.r), c = Number(btn.dataset.c);
                    const n = Number(e.key);
                    if (!isNaN(n) && e.key.length === 1 && n >= 0 && n <= L.length) {
                        e.preventDefault(); setCell(btn, n === 0 ? null : n - 1);
                        const nx = at(r + 1, c) || at(0, c + 1); if (nx) nx.focus();
                        return;
                    }
                    const mv = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.key];
                    if (mv) { e.preventDefault(); const nx = at(r + mv[0], c + mv[1]); if (nx) nx.focus(); }
                    if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); setCell(btn, null); }
                });
            });
            $$("[data-fill]", body).forEach((sel) => sel.addEventListener("change", () => {
                if (sel.value === "") return;
                const { c } = comps[Number(sel.dataset.fill)];
                let n = 0;
                studs.forEach((s) => { const rec = (h.teacher[s.id] = h.teacher[s.id] || {}); if (rec[c.id] == null) { rec[c.id] = Number(sel.value); n++; } });
                Store.save(); toast(`${n} empty cell${n === 1 ? "" : "s"} filled`); V.growth(root);
            }));
            const acc = $("#acc-sug", body);
            if (acc) acc.addEventListener("click", () => {
                let n = 0;
                studs.forEach((s) => comps.forEach(({ d, c }) => { const rec = (h.teacher[s.id] = h.teacher[s.id] || {}); if (rec[c.id] == null) { const sg = Store.suggestion(s.id, term, d.id); if (sg != null) { rec[c.id] = sg; n++; } } }));
                Store.save(); toast(`${n} rating${n === 1 ? "" : "s"} accepted`); V.growth(root);
            });
            const cp = $("#copy-prev", body);
            if (cp) cp.addEventListener("click", () => {
                const ph = Store.H(prevTerm); let n = 0;
                studs.forEach((s) => comps.forEach(({ c }) => { const rec = (h.teacher[s.id] = h.teacher[s.id] || {}); const pv = (ph.teacher[s.id] || {})[c.id]; if (rec[c.id] == null && pv != null) { rec[c.id] = pv; n++; } }));
                Store.save(); toast(`${n} cell${n === 1 ? "" : "s"} pre-filled from ${prevTerm} - adjust what changed`); V.growth(root);
            });
        } else {
            // Quick capture: one observation for many students at once
            if (!ui.capDom) ui.capDom = st.domains[0].id;
            const recent = Store.db.observations.filter((o) => o.term === term && studs.some((s) => s.id === o.sid)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 12);
            body.innerHTML = `
            <div class="grid grid-main-side">
                <div class="card"><div class="card-head"><h3>Add a note</h3><span class="hint">Pick everyone it applies to - one note, many students.</span></div>
                <div class="card-body stack">
                    <div class="field"><div class="row-between"><span class="label">Students (${ui.sel.length} selected)</span><span class="row"><button class="btn btn-sm btn-ghost" id="sel-all">Select all</button><button class="btn btn-sm btn-ghost" id="sel-none">Clear</button></span></div>
                        <div class="row" style="gap:6px" id="cap-studs">${studs.map((s) => `<button class="chip ${ui.sel.includes(s.id) ? "on" : ""}" data-sid="${s.id}"><span class="dot" style="background:${s.color}"></span>${esc(s.name.split(" ")[0])} ${esc(s.name.split(" ")[1][0])}.</button>`).join("")}</div></div>
                    <div class="field"><span class="label">Domain</span><div class="row" style="gap:6px" id="cap-dom">${st.domains.map((d) => `<button class="chip ${ui.capDom === d.id ? "on" : ""}" data-d="${d.id}">${esc(d.name)}</button>`).join("")}</div></div>
                    <div class="field"><span class="label">Level seen (optional - feeds rating suggestions)</span><div class="row" style="gap:6px" id="cap-lvl"><button class="chip ${ui.capLvl == null ? "on" : ""}" data-l="">Note only</button>${L.map((l, i) => `<button class="chip ${ui.capLvl === i ? "on" : ""}" data-l="${i}">${esc(l.label)}</button>`).join("")}</div></div>
                    <div class="field"><label for="cap-note">What did you notice?</label><textarea class="textarea" id="cap-note" placeholder="e.g. Led the team during the science model activity and helped others finish."></textarea></div>
                    <div><button class="btn btn-primary" id="cap-save">${icon("check")}Save for ${ui.sel.length || "selected"} student${ui.sel.length === 1 ? "" : "s"}</button></div>
                </div></div>
                <div class="card"><div class="card-head"><h3>Recent - ${esc(term)}</h3></div><div class="list">
                    ${recent.length ? recent.map((o) => { const s = Store.student(o.sid); const d = st.domains.find((x) => x.id === o.domId); return `<div class="list-item">${avatar(s, 26)}<div class="grow"><div class="title small">${esc(s.name)}</div><div class="sub">${esc(o.note)}</div><div class="sub">${esc(d ? d.name : "")} - ${esc(o.date)}</div></div>${o.lvl != null ? lvlChip(L, o.lvl) : ""}</div>`; }).join("") : `<div class="empty">No observations yet.</div>`}
                </div></div>
            </div>`;
            $$("#cap-studs .chip", body).forEach((b) => b.addEventListener("click", () => { const id = b.dataset.sid; ui.sel = ui.sel.includes(id) ? ui.sel.filter((x) => x !== id) : ui.sel.concat(id); keepNote(() => V.growth(root)); }));
            $("#sel-all", body).addEventListener("click", () => { ui.sel = studs.map((s) => s.id); keepNote(() => V.growth(root)); });
            $("#sel-none", body).addEventListener("click", () => { ui.sel = []; keepNote(() => V.growth(root)); });
            $$("#cap-dom .chip", body).forEach((b) => b.addEventListener("click", () => { ui.capDom = b.dataset.d; keepNote(() => V.growth(root)); }));
            $$("#cap-lvl .chip", body).forEach((b) => b.addEventListener("click", () => { ui.capLvl = b.dataset.l === "" ? null : Number(b.dataset.l); keepNote(() => V.growth(root)); }));
            function keepNote(fn) { ui.note = $("#cap-note", body).value; fn(); const n = $("#cap-note"); if (n && ui.note) n.value = ui.note; }
            $("#cap-save", body).addEventListener("click", () => {
                const note = $("#cap-note", body).value.trim();
                if (!ui.sel.length) { toast("Select at least one student", "err"); return; }
                if (!note && ui.capLvl == null) { toast("Add a note or a level", "err"); return; }
                const today = new Date().toISOString().slice(0, 10);
                ui.sel.forEach((sid) => Store.db.observations.push({ id: Store.uid("ob"), sid, term, domId: ui.capDom, lvl: ui.capLvl, note: note || "(level only)", date: today, by: App.persona().staffId }));
                Store.save(); toast(`Saved for ${ui.sel.length} student${ui.sel.length > 1 ? "s" : ""}`);
                ui.sel = []; ui.note = ""; V.growth(root);
            });
        }
    };

    // Single-student observation modal (from the 360 page)
    V.captureModal = (sids) => {
        const s = Store.student(sids[0]); const cls = Store.cls(s.classId); const st = Store.stageOf(cls); const L = Store.levelsOf(cls); const term = App.ctx.term;
        modal({
            title: `Note - ${s.name}`,
            body: `<div class="stack"><div class="field"><label for="ob-dom">Domain</label><select class="select" id="ob-dom">${st.domains.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></div>
                <div class="field"><label for="ob-lvl">Level seen (optional)</label><select class="select" id="ob-lvl"><option value="">Note only</option>${L.map((l, i) => `<option value="${i}">${esc(l.label)} - ${esc(l.desc)}</option>`).join("")}</select></div>
                <div class="field"><label for="ob-note">Note</label><textarea class="textarea" id="ob-note"></textarea></div></div>`,
            foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save</button>`,
            onMount: (m) => $("[data-ok]", m.el).addEventListener("click", () => {
                const note = $("#ob-note", m.el).value.trim(); const lv = $("#ob-lvl", m.el).value;
                if (!note && lv === "") { toast("Add a note or a level", "err"); return; }
                Store.db.observations.push({ id: Store.uid("ob"), sid: s.id, term, domId: $("#ob-dom", m.el).value, lvl: lv === "" ? null : Number(lv), note: note || "(level only)", date: new Date().toISOString().slice(0, 10), by: App.persona().staffId });
                Store.save(); m.close(); toast("Note saved"); App.render();
            })
        });
    };

    // ---------------------------------------------------------------------
    // Student-facing
    // ---------------------------------------------------------------------
    const faceSet = (n) => (n === 4 ? ["smile1", "smile2", "smile3", "smile4"] : ["smile1", "smile2", "smile4"]);
    const meSid = () => App.persona().sid;

    V["me-report"] = (root) => V.renderMyCard(root, meSid(), "student");

    V["me-self"] = (root) => {
        const sid = meSid(); const s = Store.student(sid); const cls = Store.cls(s.classId); const st = Store.stageOf(cls); const term = App.ctx.term;
        const labels = FW.SELF_SCALES[st.levelSet]; const faces = faceSet(labels.length);
        const cur = Object.assign({}, Store.H(term).self[sid] || {});
        const done = Object.keys(cur).length;
        root.innerHTML = `
        <div class="view-header"><div><h2>How am I doing?</h2><span class="subtitle">Hi ${esc(s.name.split(" ")[0])}! Tap the face that feels true for you this term. There are no wrong answers.</span></div><div class="actions">${App.termSelect()}</div></div>
        <div class="card">${st.domains.map((d) => `<div class="self-q"><div><div class="stmt">${esc(d.self)}</div><div class="dom">${esc(d.name)}</div></div><div class="face-opts" data-dom="${d.id}">${labels.map((lb, i) => `<button type="button" class="face ${cur[d.id] === i ? "on" : ""}" data-v="${i}" aria-pressed="${cur[d.id] === i}">${icon(faces[i])}${esc(lb)}</button>`).join("")}</div></div>`).join("")}</div>
        <div class="row mt-16"><button class="btn btn-primary" id="self-save">${icon("check")}Save my answers</button><span class="small muted" id="self-count">${done}/${st.domains.length} answered</span></div>`;
        App.bindCtx(root);
        $$(".face-opts", root).forEach((g) => g.addEventListener("click", (e) => { const b = e.target.closest(".face"); if (!b) return; cur[g.dataset.dom] = Number(b.dataset.v); $$(".face", g).forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); }); $("#self-count", root).textContent = `${Object.keys(cur).length}/${st.domains.length} answered`; }));
        $("#self-save", root).addEventListener("click", () => { Store.H(term).self[sid] = cur; Store.save(); toast(Object.keys(cur).length === st.domains.length ? "Thank you! Your teacher can see your answers." : "Saved - you can finish later"); });
    };

    V["me-peer"] = (root) => {
        const sid = meSid(); const s = Store.student(sid); const cls = Store.cls(s.classId); const st = Store.stageOf(cls); const L = Store.levelsOf(cls); const term = App.ctx.term;
        const classmates = Store.studentsOf(cls.id); const i = classmates.findIndex((x) => x.id === sid);
        const peers = [classmates[(i + 1) % classmates.length], classmates[(i + 2) % classmates.length]];
        const h = Store.H(term); h.peerBy = h.peerBy || {};
        const mine = (h.peerBy[sid] = h.peerBy[sid] || {});
        const labels = FW.SELF_SCALES[st.levelSet]; const faces = faceSet(labels.length);
        root.innerHTML = `
        <div class="view-header"><div><h2>Peer feedback</h2><span class="subtitle">Your teacher paired you with two classmates. Be kind, honest and specific - they will only see a combined picture, never your name.</span></div><div class="actions">${App.termSelect()}</div></div>
        ${peers.map((p) => { const cur = mine[p.id] || {}; return `<div class="card" style="margin-bottom:16px" data-peer="${p.id}"><div class="card-head"><div class="row">${avatar(p)}<h3>${esc(p.name)}</h3></div>${Object.keys(cur).filter((k) => k !== "note").length === st.domains.length ? `<span class="badge badge-green">${icon("check")}Done</span>` : ""}</div>
            ${st.domains.map((d) => `<div class="self-q"><div><div class="stmt">${esc(d.self.replace(/^I /, p.name.split(" ")[0] + " ").replace(/\bmy\b/g, "their").replace(/\bmyself\b/g, "themselves").replace(/\bI\b/g, "they"))}</div><div class="dom">${esc(d.name)}</div></div><div class="face-opts" data-dom="${d.id}">${labels.map((lb, li) => `<button type="button" class="face ${cur[d.id] === li ? "on" : ""}" data-v="${li}">${icon(faces[li])}${esc(lb.replace(/^I /, "They ").replace("I can", "Can"))}</button>`).join("")}</div></div>`).join("")}
            <div class="card-body"><label class="label" for="pn-${p.id}">One thing ${esc(p.name.split(" ")[0])} does really well</label><input class="input" id="pn-${p.id}" style="width:100%;margin-top:6px" value="${esc(cur.note || "")}"></div></div>`; }).join("")}
        <button class="btn btn-primary" id="peer-save">${icon("send")}Submit peer feedback</button>`;
        App.bindCtx(root);
        $$("[data-peer]", root).forEach((card) => $$(".face-opts", card).forEach((g) => g.addEventListener("click", (e) => { const b = e.target.closest(".face"); if (!b) return; $$(".face", g).forEach((x) => x.classList.toggle("on", x === b)); })));
        $("#peer-save", root).addEventListener("click", () => {
            $$("[data-peer]", root).forEach((card) => {
                const rec = {}; $$(".face-opts", card).forEach((g) => { const on = $(".face.on", g); if (on) rec[g.dataset.dom] = Number(on.dataset.v); });
                rec.note = $("input", card).value.trim();
                mine[card.dataset.peer] = rec;
            });
            Store.save(); toast("Thank you - peer feedback submitted"); V["me-peer"](root);
        });
    };

    V["me-profile"] = (root) => {
        const sid = meSid(); const s = Store.student(sid);
        const prof = (Store.db.profiles[sid] = Store.db.profiles[sid] || { aboutMe: "", ambition: "", goals: [], interests: [] });
        const INTERESTS = ["Sports", "Art", "Music", "Dance", "Reading", "Science", "Coding", "Gardening", "Drama", "Cooking", "Puzzles", "Writing"];
        root.innerHTML = `
        <div class="view-header"><div><h2>About me & my goals</h2><span class="subtitle">This page appears on your report. Make it yours!</span></div></div>
        <div class="grid grid-2"><div class="card"><div class="card-body stack">
            <div class="field"><label for="pf-about">About me</label><textarea class="textarea" id="pf-about" placeholder="Things I love doing...">${esc(prof.aboutMe)}</textarea></div>
            <div class="field"><label for="pf-amb">When I grow up I want to be</label><input class="input" id="pf-amb" value="${esc(prof.ambition)}"></div>
            <div class="field"><span class="label">My interests</span><div class="row" style="gap:6px" id="pf-int">${INTERESTS.map((x) => `<button class="chip ${prof.interests.includes(x) ? "on" : ""}" data-i="${x}">${x}</button>`).join("")}</div></div>
        </div></div>
        <div class="card"><div class="card-head"><h3>My goals this year</h3></div><div class="card-body stack">
            <div id="pf-goals" class="stack" style="gap:8px">${prof.goals.map((g, i) => `<div class="row" style="flex-wrap:nowrap"><input class="input" style="flex:1" data-g="${i}" value="${esc(g)}"><button class="btn btn-sm btn-ghost btn-danger" data-gdel="${i}" aria-label="Remove goal">${icon("x")}</button></div>`).join("")}</div>
            <button class="btn btn-sm" id="pf-addg" style="align-self:flex-start">${icon("plus")}Add a goal</button>
        </div></div></div>
        <div class="mt-16"><button class="btn btn-primary" id="pf-save">${icon("check")}Save</button></div>`;
        const collect = () => { prof.aboutMe = $("#pf-about", root).value; prof.ambition = $("#pf-amb", root).value; prof.goals = $$("[data-g]", root).map((i) => i.value.trim()).filter(Boolean); };
        $$("#pf-int .chip", root).forEach((b) => b.addEventListener("click", () => { const x = b.dataset.i; prof.interests = prof.interests.includes(x) ? prof.interests.filter((y) => y !== x) : prof.interests.concat(x); b.classList.toggle("on"); }));
        $("#pf-addg", root).addEventListener("click", () => { collect(); prof.goals.push(""); V["me-profile"](root); const all = $$("[data-g]", root); all[all.length - 1].focus(); });
        $$("[data-gdel]", root).forEach((b) => b.addEventListener("click", () => { collect(); prof.goals.splice(Number(b.dataset.gdel), 1); V["me-profile"](root); }));
        $("#pf-save", root).addEventListener("click", () => { collect(); Store.save(); toast("Saved"); });
    };

    // ---------------------------------------------------------------------
    // Parent-facing
    // ---------------------------------------------------------------------
    V["parent-report"] = (root) => V.renderMyCard(root, App.persona().sid, "parent");

    V["parent-feedback"] = (root) => {
        const sid = App.persona().sid; const s = Store.student(sid); const cls = Store.cls(s.classId); const st = Store.stageOf(cls); const L = Store.levelsOf(cls); const term = App.ctx.term;
        const cur = Object.assign({}, Store.H(term).parent[sid] || {});
        const notes = Object.assign({ proud: "", support: "", ack: false }, (Store.db.parentNotes[term] || {})[sid] || {});
        const first = s.name.split(" ")[0];
        const faces = faceSet(L.length);
        const parentLabels = L.length === 4 ? ["Rarely", "Sometimes", "Often", "Always"] : ["Not yet", "Sometimes", "Regularly"];
        root.innerHTML = `
        <div class="view-header"><div><h2>Parent feedback - ${esc(first)}</h2><span class="subtitle">You see ${esc(first)} in ways school cannot. ${st.domains.length} quick taps and two short notes - about 2 minutes.</span></div><div class="actions">${App.termSelect()}</div></div>
        <div class="card"><div class="card-head"><h3>At home, I notice...</h3></div>${st.domains.map((d) => `<div class="self-q"><div><div class="stmt">${esc(d.parent)}</div><div class="dom">${esc(d.name)}</div></div><div class="face-opts" data-dom="${d.id}">${parentLabels.map((lb, i) => `<button type="button" class="face ${cur[d.id] === i ? "on" : ""}" data-v="${i}">${icon(faces[i])}${esc(lb)}</button>`).join("")}</div></div>`).join("")}</div>
        <div class="grid grid-2 mt-16">
            <div class="card card-pad"><div class="field"><label for="pa-proud">Something ${esc(first)} did recently that made you proud</label><textarea class="textarea" id="pa-proud">${esc(notes.proud)}</textarea></div></div>
            <div class="card card-pad"><div class="field"><label for="pa-support">How we will support ${esc(first)} at home</label><textarea class="textarea" id="pa-support">${esc(notes.support)}</textarea></div></div>
        </div>
        <label class="check mt-16"><input type="checkbox" id="pa-ack" ${notes.ack ? "checked" : ""}> I have seen ${esc(first)}'s ${esc(Store.db.institution.cardTitle || "Progress Report")} for ${esc(term)}.</label>
        <div class="mt-16"><button class="btn btn-primary" id="pa-save">${icon("send")}Submit feedback</button></div>`;
        App.bindCtx(root);
        $$(".face-opts", root).forEach((g) => g.addEventListener("click", (e) => { const b = e.target.closest(".face"); if (!b) return; cur[g.dataset.dom] = Number(b.dataset.v); $$(".face", g).forEach((x) => x.classList.toggle("on", x === b)); }));
        $("#pa-save", root).addEventListener("click", () => {
            Store.H(term).parent[sid] = cur;
            (Store.db.parentNotes[term] = Store.db.parentNotes[term] || {})[sid] = { proud: $("#pa-proud", root).value.trim(), support: $("#pa-support", root).value.trim(), ack: $("#pa-ack", root).checked };
            Store.save();
            const missing = st.domains.filter((d) => cur[d.id] == null).length;
            toast(missing ? `Saved - ${missing} question${missing > 1 ? "s" : ""} left` : "Thank you! Your feedback is on the card.");
        });
    };
})();
