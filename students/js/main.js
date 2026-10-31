// revU HPC - App shell: personas, navigation, routing, theme.
(function () {
    "use strict";
    const { icon, esc, $, $$ } = UI;

    const App = window.App = {
        ctx: { persona: "admin", classId: null, exam: null, term: null },
        views: {},
        route: { name: "dashboard", params: [] }
    };

    // ---------------------------------------------------------------------
    // Personas
    // ---------------------------------------------------------------------
    function personas() {
        const db = Store.db;
        const firstStudent = Store.studentsOf("c-7a")[0];
        return [
            { key: "admin", type: "staff", staffId: "st-admin", label: "Coordinator (Admin)" },
            { key: "st-rp", type: "staff", staffId: "st-rp", label: "Class Teacher - Grade 7-A" },
            { key: "st-sd", type: "staff", staffId: "st-sd", label: "Class Teacher - Grade 4-A" },
            { key: "st-mk", type: "staff", staffId: "st-mk", label: "Subject Teacher - Physics" },
            firstStudent && { key: "student", type: "student", sid: firstStudent.id, label: `Student - ${firstStudent.name}` },
            firstStudent && { key: "parent", type: "parent", sid: firstStudent.id, label: `Parent - ${firstStudent.name.split(" ")[0]}'s family` }
        ].filter(Boolean).filter((p) => p.type !== "staff" || db.staff.some((s) => s.id === p.staffId));
    }
    App.persona = () => personas().find((p) => p.key === App.ctx.persona) || personas()[0];
    App.isAdmin = () => App.persona().key === "admin";
    App.isStaff = () => App.persona().type === "staff";
    App.me = () => (App.isStaff() ? Store.staff(App.persona().staffId) : null);

    // Classes visible to the current staff persona
    App.myClasses = () => {
        const db = Store.db; const p = App.persona();
        if (p.type !== "staff") return [];
        if (p.key === "admin") return db.classes;
        const own = new Set(db.classes.filter((c) => c.classTeacherId === p.staffId).map((c) => c.id));
        db.papers.filter((x) => x.createdBy === p.staffId).forEach((x) => own.add(x.classId));
        return db.classes.filter((c) => own.has(c.id));
    };
    App.ensureClass = () => {
        const mine = App.myClasses();
        if (!mine.length) return null;
        if (!mine.some((c) => c.id === App.ctx.classId)) App.ctx.classId = mine[0].id;
        return Store.cls(App.ctx.classId);
    };
    App.setCtx = (patch) => {
        Object.assign(App.ctx, patch);
        try { localStorage.setItem("revu_hpc_ctx", JSON.stringify(App.ctx)); } catch (e) { /* ignore */ }
    };

    // Shared toolbar controls
    App.classSelect = (id) => {
        const mine = App.myClasses();
        return `<div class="field"><label for="${id || "ctx-class"}">Class & section</label><select class="select" id="${id || "ctx-class"}" data-ctx="classId">
            ${mine.map((c) => `<option value="${c.id}" ${c.id === App.ctx.classId ? "selected" : ""}>${esc(Store.className(c))} - ${esc(Store.stageOf(c).name)}</option>`).join("")}</select></div>`;
    };
    App.examSelect = (id) => `<div class="field"><label for="${id || "ctx-exam"}">Examination</label><select class="select" id="${id || "ctx-exam"}" data-ctx="exam">
        ${HPC_FW.EXAMS.map((e) => `<option value="${e.id}" ${e.id === App.ctx.exam ? "selected" : ""}>${esc(e.name)} (${e.term})</option>`).join("")}</select></div>`;
    App.termSelect = (id) => `<div class="field"><label for="${id || "ctx-term"}">Term</label><select class="select" id="${id || "ctx-term"}" data-ctx="term">
        ${["Term 1", "Term 2"].map((t) => `<option ${t === App.ctx.term ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
    App.bindCtx = (root) => $$("[data-ctx]", root).forEach((sel) => sel.addEventListener("change", () => { App.setCtx({ [sel.dataset.ctx]: sel.value }); App.render(); }));

    // ---------------------------------------------------------------------
    // Navigation
    // ---------------------------------------------------------------------
    function navFor(p) {
        if (p.type === "student") return [
            ["Me", [["me-report", "My report", "card"], ["me-self", "How I'm doing", "smile3"], ["me-peer", "Peer feedback", "users"], ["me-profile", "About me", "target"]]]
        ];
        if (p.type === "parent") return [
            ["My child", [["parent-report", "Report", "card"], ["parent-feedback", "Share feedback", "voices"]]]
        ];
        const sections = [
            ["", [["home", "Home", "dashboard"]]],
            ["Assess", [["outcomes", "Outcomes", "library"], ["papers", "Papers", "builder"], ["marks", "Marks", "grader"], ["growth", "Growth", "holistic"], ["voices", "Voices", "voices"]]],
            ["Share", [["students", "Students", "students"], ["reports", "Reports", "card"], ["guide", "How it works", "sparkle"]]]
        ];
        if (p.key === "admin") sections.push(["Admin", [["settings", "Settings", "settings"]]]);
        return sections;
    }
    function renderNav() {
        const p = App.persona();
        const active = App.route.name;
        const alias = { paper: "papers", preview: "papers", student: "students", report: "reports" };
        const cur = alias[active] || active;
        $("#sidebar-nav").innerHTML = navFor(p).map(([title, items]) =>
            (title ? `<div class="nav-section-title">${esc(title)}</div>` : "") + items.map(([route, label, ic]) =>
                `<a class="nav-item ${cur === route ? "active" : ""}" href="#/${route}">${icon(ic)}<span>${esc(label)}</span></a>`).join("")
        ).join("");
    }
    function renderHeader() {
        const p = App.persona();
        const db = Store.db;
        $("#sb-school-name").textContent = db.institution.name;
        $("#sb-school-mono").textContent = (db.institution.short && db.institution.short.length <= 3) ? db.institution.short : UI.initials(db.institution.short || db.institution.name);
        const exam = Store.examById(App.ctx.exam);
        $("#topbar-ctx").innerHTML = p.type === "staff" ? `<b>${esc(exam ? exam.name : "")}</b> &middot; ${esc(App.ctx.term)} &middot; Session ${esc(db.institution.session)}` : `${esc(App.ctx.term)} &middot; Session ${esc(db.institution.session)}`;
        $("#persona-select").innerHTML = personas().map((x) => `<option value="${x.key}" ${x.key === p.key ? "selected" : ""}>${esc(x.label)}</option>`).join("");
        let name, role;
        if (p.type === "staff") { const s = Store.staff(p.staffId); name = s.name; role = s.title; }
        else if (p.type === "student") { const s = Store.student(p.sid); name = s.name; role = `Student, ${Store.className(s.classId)}`; }
        else { const s = Store.student(p.sid); name = s.guardian; role = `Parent of ${s.name.split(" ")[0]}`; }
        $("#user-name").textContent = name;
        $("#user-role").textContent = role;
        $("#user-avatar").textContent = UI.initials(name.replace(/^(Dr|Mr|Mrs|Ms)\.?\s+/, ""));
    }

    // ---------------------------------------------------------------------
    // Router
    // ---------------------------------------------------------------------
    function parseHash() {
        const h = (location.hash || "").replace(/^#\/?/, "");
        const parts = h.split("/").filter(Boolean).map(decodeURIComponent);
        return { name: parts[0] || "", params: parts.slice(1) };
    }
    const defaultRoute = (p) => (p.type === "student" ? "me-report" : p.type === "parent" ? "parent-report" : "home");

    App.go = (path) => { if (location.hash === "#/" + path) App.render(); else location.hash = "#/" + path; };
    App.render = () => {
        const p = App.persona();
        let r = parseHash();
        const allowed = navFor(p).flatMap(([, items]) => items.map((i) => i[0]));
        const staffOnly = ["paper", "preview", "student", "report"];
        if (!r.name || (!allowed.includes(r.name) && !(p.type === "staff" && staffOnly.includes(r.name)))) {
            r = { name: defaultRoute(p), params: [] };
            history.replaceState(null, "", "#/" + r.name);
        }
        App.route = r;
        renderHeader();
        renderNav();
        const root = $("#app-content");
        const view = App.views[r.name];
        document.body.classList.remove("nav-open");
        if (!view) { root.innerHTML = `<div class="empty"><h4>Coming soon</h4></div>`; return; }
        try {
            view(root, r.params);
        } catch (err) {
            console.error(err);
            root.innerHTML = `<div class="alert alert-danger">${icon("alert")}<div class="body"><b>Something went wrong.</b> ${esc(err.message)}</div></div>`;
        }
        root.scrollTop = 0;
    };

    // ---------------------------------------------------------------------
    // Theme
    // ---------------------------------------------------------------------
    function applyTheme(theme) {
        if (theme !== "dark") theme = "light";
        document.body.classList.remove("theme-light", "theme-dark");
        document.body.classList.add("theme-" + theme);
        $$(".theme-pill-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === theme));
        try { localStorage.setItem("revu_theme", theme); } catch (e) { /* ignore */ }
    }

    // ---------------------------------------------------------------------
    // Boot
    // ---------------------------------------------------------------------
    function boot() {
        Store.load();
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem("revu_hpc_ctx") || "null"); } catch (e) { /* ignore */ }
        App.ctx = Object.assign({ persona: "admin", classId: "c-7a", exam: Store.db.institution.activeExam, term: Store.db.institution.activeTerm }, saved || {});
        let theme = "light";
        try { theme = localStorage.getItem("revu_theme") || "light"; } catch (e) { /* ignore */ }
        applyTheme(theme);

        $$(".theme-pill-btn").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.theme)));
        $("#persona-select").addEventListener("change", (e) => {
            App.setCtx({ persona: e.target.value });
            App.ensureClass();
            location.hash = "#/" + defaultRoute(App.persona());
            App.render();
        });
        $("#btn-menu").addEventListener("click", () => document.body.classList.toggle("nav-open"));
        $("#sidebar-scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
        window.addEventListener("hashchange", App.render);
        App.ensureClass();
        App.render();
    }
    document.addEventListener("DOMContentLoaded", boot);
})();
