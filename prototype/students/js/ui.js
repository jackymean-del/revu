// revU HPC - UI toolkit: icons, escaping, modal, toast, charts, rich text and file helpers.
(function () {
    "use strict";

    const P = {
        dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
        library: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><path d="M9 7h7M9 11h5"/>',
        builder: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h3"/>',
        grader: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
        holistic: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="4"/>',
        capture: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        students: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
        card: '<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="11" r="2.5"/><path d="M5 16.5c.8-1.6 1.9-2.3 3-2.3s2.2.7 3 2.3M14 9h5M14 13h5"/>',
        voices: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M8 9h8M8 13h5"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
        wave: '<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
        mountain: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
        cloud: '<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>',
        seed: '<ellipse cx="12" cy="14" rx="5" ry="6"/><path d="M12 8c0-2 1-4 3-5"/>',
        sprout: '<path d="M12 22V11"/><path d="M12 11c0-4-3-6-7-6 0 4 3 6 7 6zM12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/>',
        tree: '<path d="M12 22v-6"/><path d="M12 2l6 9h-3l4 5H5l4-5H6z"/>',
        star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
        run: '<circle cx="14" cy="4" r="2"/><path d="M6 21l3-6 3 2v5M9 15l2-6 4 2 3-1M11 9l-4 1-2 3"/>',
        heart: '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/>',
        bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/>',
        book: '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>',
        palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 000 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0022 9.8C22 5.5 17.5 2 12 2z"/>',
        target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        chat: '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
        users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        tool: '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
        compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
        plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>',
        download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
        print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
        sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
        check: '<polyline points="20 6 9 17 4 12"/>',
        x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
        alert: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
        image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
        merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 009 9"/>',
        eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
        arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
        back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
        copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
        send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>',
        smile3: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
        smile2: '<circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
        smile1: '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
        smile4: '<circle cx="12" cy="12" r="10"/><path d="M7 13a5 5 0 0010 0z"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>'
    };
    const icon = (name, cls) => `<svg viewBox="0 0 24 24" class="${cls || ""}" aria-hidden="true">${P[name] || P.info}</svg>`;

    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
    const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    const avatar = (s, size) => `<span class="s-avatar" style="background:${s.color || "#685DBC"};${size ? `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px` : ""}">${esc(initials(s.name))}</span>`;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const fmt = (n) => (n == null || isNaN(n) ? "-" : Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());

    // Rich text: keep only tags needed for equations and emphasis
    function cleanRich(html) {
        const tpl = document.createElement("template");
        tpl.innerHTML = String(html || "");
        const ALLOWED = { SUP: 1, SUB: 1, B: 1, I: 1, U: 1, BR: 1, STRONG: 1, EM: 1 };
        const walk = (node) => {
            Array.from(node.childNodes).forEach((ch) => {
                if (ch.nodeType === 1) {
                    if (!ALLOWED[ch.tagName]) {
                        walk(ch);
                        const frag = document.createDocumentFragment();
                        while (ch.firstChild) frag.appendChild(ch.firstChild);
                        if (ch.tagName === "DIV" || ch.tagName === "P") frag.appendChild(document.createElement("br"));
                        ch.replaceWith(frag);
                    } else {
                        Array.from(ch.attributes).forEach((a) => ch.removeAttribute(a.name));
                        walk(ch);
                    }
                } else if (ch.nodeType !== 3) ch.remove();
            });
        };
        walk(tpl.content);
        return tpl.innerHTML.replace(/(<br>)+$/, "");
    }
    const SYMBOLS = ["√", "÷", "×", "±", "≤", "≥", "≠", "π", "θ", "°", "→", "⇌", "Δ", "∞", "½", "¼"];
    const symBar = () => `<div class="sym-bar" data-symbar>
        <button type="button" data-cmd="superscript" title="Superscript">x<sup>2</sup></button>
        <button type="button" data-cmd="subscript" title="Subscript">x<sub>2</sub></button>
        <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
        ${SYMBOLS.map((s) => `<button type="button" data-sym="${s}" title="Insert ${s}">${s}</button>`).join("")}
    </div>`;

    // Level chip
    function lvlChip(levels, idx, opts) {
        if (idx == null || isNaN(idx)) return `<span class="lvl lvl-none">${opts && opts.placeholder ? esc(opts.placeholder) : "Not yet"}</span>`;
        const i = Math.max(0, Math.min(levels.length - 1, Math.round(idx)));
        const L = levels[i];
        const cls = levels.length === 4 ? `lvl-${i}` : `lvl-${i === 0 ? 0 : i === 1 ? 1 : 3}`;
        return `<span class="lvl ${cls}" title="${esc(L.desc)}">${icon(L.icon)}${esc(L.label)}</span>`;
    }

    // Toast
    function toast(msg, kind) {
        const el = document.createElement("div");
        el.className = `toast ${kind || "ok"}`;
        el.innerHTML = `${esc(msg)}`;
        $("#toast-root").appendChild(el);
        setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 2600);
    }

    // Modal: returns { el, close }
    function modal({ title, body, foot, wide, onMount }) {
        const root = $("#modal-root");
        const back = document.createElement("div");
        back.className = "modal-back";
        back.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
            <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
            <div class="modal-body">${body}</div>
            ${foot ? `<div class="modal-foot">${foot}</div>` : ""}
        </div>`;
        root.appendChild(back);
        const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
        const onKey = (e) => { if (e.key === "Escape") close(); };
        document.addEventListener("keydown", onKey);
        back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) close(); });
        const api = { el: back, close };
        if (onMount) onMount(api);
        const first = back.querySelector("input, select, textarea, button.btn-primary");
        if (first) first.focus();
        return api;
    }
    function confirmBox(title, text, okLabel) {
        return new Promise((resolve) => {
            const m = modal({
                title, body: `<p>${esc(text)}</p>`,
                foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>${esc(okLabel || "Confirm")}</button>`,
                onMount: (api) => api.el.querySelector("[data-ok]").addEventListener("click", () => { api.close(); resolve(true); })
            });
            m.el.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) resolve(false); });
        });
    }

    // Tooltip (charts + anything with data-tip)
    let tipEl = null;
    document.addEventListener("mouseover", (e) => {
        const t = e.target.closest("[data-tip]");
        if (!t) { if (tipEl) tipEl.remove(), (tipEl = null); return; }
        if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "chart-tip"; document.body.appendChild(tipEl); }
        tipEl.innerHTML = t.getAttribute("data-tip");
    });
    document.addEventListener("mousemove", (e) => {
        if (!tipEl) return;
        const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
        let x = e.clientX + 14, y = e.clientY + 14;
        if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
        if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
        tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
    });

    // Radar chart. values are 0..1 (or null). series: [{name, color, values, dash}]
    function radar({ axes, series, size, levels }) {
        const S = size || 300, cx = S / 2, cy = S / 2, R = S / 2 - 68, n = axes.length;
        const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
        const rings = (levels || 3);
        let g = "";
        for (let k = 1; k <= rings; k++) {
            const pts = axes.map((_, i) => pt(i, k / rings).join(",")).join(" ");
            g += `<polygon class="grid-line" points="${pts}"/>`;
        }
        axes.forEach((a, i) => {
            const [x, y] = pt(i, 1);
            g += `<line class="grid-line" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
            const [lx, ly] = pt(i, 1.2);
            const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
            const words = a.split(" ");
            const lines = []; let cur = "";
            words.forEach((w) => { if ((cur + " " + w).trim().length > 14 && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
            if (cur) lines.push(cur);
            g += `<text class="axis-label" x="${lx}" y="${ly - (lines.length - 1) * 6}" text-anchor="${anchor}" dominant-baseline="middle">${lines.map((l, li) => `<tspan x="${lx}" dy="${li ? 12 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
        });
        series.forEach((s) => {
            const valid = s.values.map((v, i) => (v == null ? null : pt(i, Math.max(0.04, v))));
            if (valid.every((v) => v == null)) return;
            const pts = valid.map((p, i) => (p || pt(i, 0)).join(",")).join(" ");
            g += `<polygon points="${pts}" fill="${s.color}" fill-opacity="${s.fill == null ? 0.12 : s.fill}" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>`;
            valid.forEach((p, i) => {
                if (!p) return;
                g += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${s.color}" stroke="var(--bg-card)" stroke-width="2"/>`;
                g += `<circle cx="${p[0]}" cy="${p[1]}" r="11" fill="transparent" data-tip="<div class='tt'>${esc(axes[i])}</div>${esc(s.name)}: ${esc(s.labels ? s.labels[i] : Math.round(s.values[i] * 100) + "%")}"/>`;
            });
        });
        return `<svg class="chart-svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="Radar chart of ${series.map((s) => s.name).join(", ")}">${g}</svg>`;
    }
    function legend(items) {
        return `<div class="legend">${items.map((i) => `<span><span class="sw ${i.dash ? "dash" : ""}" style="background:${i.color};color:${i.color}"></span>${esc(i.name)}</span>`).join("")}</div>`;
    }

    // Level distribution as a stacked bar (sequential ramp)
    function levelBar(levels, counts, label) {
        const total = counts.reduce((s, v) => s + v, 0);
        if (!total) return `<div class="stacked-bar"><span style="flex:1;background:var(--bg-sunken)"></span></div>`;
        const clsFor = (i) => (levels.length === 4 ? `lvl-${i}` : `lvl-${i === 0 ? 0 : i === 1 ? 1 : 3}`);
        return `<div class="stacked-bar" role="img" aria-label="${esc(label || "Level distribution")}">${counts.map((c, i) => c ? `<span class="${clsFor(i)}" style="flex:${c}" data-tip="<div class='tt'>${esc(label || "")}</div>${esc(levels[i].label)}: ${c} student${c > 1 ? "s" : ""} (${pct(c, total)}%)"></span>` : "").join("")}</div>`;
    }

    // Files
    function download(filename, content, mime) {
        const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    function pickFile(accept) {
        return new Promise((resolve) => {
            const inp = document.createElement("input");
            inp.type = "file"; inp.accept = accept || "";
            inp.onchange = () => resolve(inp.files[0] || null);
            inp.click();
        });
    }
    function readAsDataURL(file) {
        return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
    }
    let excelPromise = null;
    function loadExcel() {
        if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
        if (!excelPromise) excelPromise = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
            s.onload = () => resolve(window.ExcelJS);
            s.onerror = () => { excelPromise = null; reject(new Error("Could not load the Excel library. Check your internet connection.")); };
            document.head.appendChild(s);
        });
        return excelPromise;
    }

    window.UI = { icon, esc, $, $$, initials, avatar, pct, fmt, cleanRich, symBar, lvlChip, toast, modal, confirmBox, radar, legend, levelBar, download, pickFile, readAsDataURL, loadExcel };
})();
