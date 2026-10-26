/* NeumaSim — Editor e interfaz */
(function () {
  'use strict';
  const NS = window.NS, DEF = NS.DEF, COL = NS.COL;
  const { L, T, esc, FONT } = NS.svg;
  const $ = (s, r = document) => r.querySelector(s);
  const GRID = 10;
  const snap = (v) => Math.round(v / GRID) * GRID;
  const STORE = 'neumasim.circuit.v1';

  const App = (NS.App = {
    circ: { comps: [], tubes: [] },
    nid: 1,
    view: { x: 0, y: 0, s: 1 },
    sel: null,
    mode: 'edit',
    paused: false,
    speed: 1,
    sim: null,
    wiring: null,
    placing: null,
    drag: null,
    pan: null,
    pressed: null,
    undo: [],
    redo: [],
    mouse: { x: 0, y: 0, inside: false },
    hoverPort: null,
  });

  // ---------------------------------------------------------------- geometría
  function rotPt(x, y, r) {
    switch (((r % 360) + 360) % 360) {
      case 90: return [-y, x];
      case 180: return [-x, -y];
      case 270: return [y, -x];
      default: return [x, y];
    }
  }
  function portsWorld(c) {
    return DEF[c.type].ports(c).map((p) => {
      const [rx, ry] = rotPt(p.x, p.y, c.rot || 0);
      const dv = NS.DIRS[p.dir];
      const [dx, dy] = rotPt(dv[0], dv[1], c.rot || 0);
      return Object.assign({}, p, { wx: c.x + rx, wy: c.y + ry, dx: Math.round(dx), dy: Math.round(dy) });
    });
  }
  function compById(id) { return App.circ.comps.find((c) => c.id === id); }
  function portWorld(ref) {
    const c = compById(ref.c);
    if (!c) return null;
    return portsWorld(c).find((p) => p.id === ref.p) || null;
  }
  function route(a, b, wps) {
    const S = 20;
    const A1 = { x: a.wx + a.dx * S, y: a.wy + a.dy * S };
    const B1 = b ? { x: b.wx + b.dx * S, y: b.wy + b.dy * S } : null;
    const seq = [A1].concat(wps || []);
    if (B1) seq.push(B1);
    const pts = [{ x: a.wx, y: a.wy }, A1];
    const endAxis = b ? (b.dx !== 0 ? 'h' : 'v') : null;
    let prevLast = a.dx !== 0 ? 'v' : 'h'; // hace que el primer tramo arranque en el eje del puerto
    for (let i = 0; i < seq.length - 1; i++) {
      const s = seq[i], t = seq[i + 1];
      const last = b && i === seq.length - 2;
      const first = prevLast === 'h' ? 'v' : 'h';
      if (s.x === t.x || s.y === t.y) {
        pts.push(t);
        prevLast = s.x === t.x ? 'v' : 'h';
        continue;
      }
      if (last && first === endAxis) {
        if (first === 'v') {
          const my = Math.round((s.y + t.y) / 2 / 5) * 5;
          pts.push({ x: s.x, y: my }, { x: t.x, y: my }, t);
        } else {
          const mx = Math.round((s.x + t.x) / 2 / 5) * 5;
          pts.push({ x: mx, y: s.y }, { x: mx, y: t.y }, t);
        }
        prevLast = endAxis;
      } else {
        if (first === 'v') pts.push({ x: s.x, y: t.y }, t);
        else pts.push({ x: t.x, y: s.y }, t);
        prevLast = first === 'v' ? 'h' : 'v';
      }
    }
    if (b) pts.push({ x: b.wx, y: b.wy });
    // simplificar
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (q && q.x === p.x && q.y === p.y) continue;
      out.push(p);
    }
    for (let i = out.length - 2; i > 0; i--) {
      const p = out[i - 1], q = out[i], r = out[i + 1];
      if ((p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y)) {
        // colineales: eliminar sólo si q está entre p y r
        const between = (p.x === q.x ? (q.y - p.y) * (r.y - q.y) : (q.x - p.x) * (r.x - q.x)) >= 0;
        if (between) out.splice(i, 1);
      }
    }
    return out;
  }
  function tubePts(t) {
    const a = portWorld(t.a), b = portWorld(t.b);
    if (!a || !b) return null;
    return route(a, b, t.pts);
  }
  const ptsStr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

  // ---------------------------------------------------------------- DOM
  const svg = $('#canvas');
  const world = $('#world');
  const gridPat = $('#gridPat');
  const gridPat2 = $('#gridPat2');

  function toWorld(e) {
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left - App.view.x) / App.view.s, y: (e.clientY - r.top - App.view.y) / App.view.s };
  }
  function applyView() {
    const v = App.view;
    const tr = `translate(${v.x} ${v.y}) scale(${v.s})`;
    world.setAttribute('transform', tr);
    gridPat.setAttribute('patternTransform', tr);
    gridPat2.setAttribute('patternTransform', tr);
    $('#zoomLbl').textContent = Math.round(v.s * 100) + '%';
  }

  // ---------------------------------------------------------------- render
  let renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }
  function drawCtx(c, opts) {
    const sim = App.mode === 'sim' && App.sim && !opts.preview;
    const conns = opts.conns || {};
    return {
      sim,
      st: sim ? c.st : null,
      rot: c.rot || 0,
      P: sim ? (pid) => App.sim.p(c, pid) : null,
      conn: (pid) => (conns[c.id + ':' + pid] || 0) > 0,
    };
  }
  function connCounts() {
    const m = {};
    for (const t of App.circ.tubes) {
      const ka = t.a.c + ':' + t.a.p, kb = t.b.c + ':' + t.b.p;
      m[ka] = (m[ka] || 0) + 1;
      m[kb] = (m[kb] || 0) + 1;
    }
    return m;
  }
  function circuitSVG(opts = {}) {
    const exp = !!opts.export;
    const sim = App.mode === 'sim' && App.sim;
    const conns = connCounts();
    const out = [];
    // tubos
    for (const t of App.circ.tubes) {
      const pts = tubePts(t);
      if (!pts) continue;
      const s = ptsStr(pts);
      let col = COL.line, w = 1.8;
      if (sim) {
        const p = App.sim.pKey(t.a.c + ':' + t.a.p);
        col = NS.pcol(p);
        w = p > 0.3 ? 3 : 2;
      }
      const isSel = App.sel && App.sel.kind === 'tube' && App.sel.id === t.id;
      if (!exp) out.push(`<polyline points="${s}" fill="none" stroke="transparent" stroke-width="12" data-tube="${t.id}" style="cursor:pointer"/>`);
      if (isSel && !exp) out.push(`<polyline points="${s}" fill="none" stroke="${COL.sel}" stroke-width="${w + 5}" stroke-opacity=".45" stroke-linejoin="round" pointer-events="none"/>`);
      out.push(`<polyline points="${s}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`);
    }
    // componentes
    for (const c of App.circ.comps) {
      const def = DEF[c.type];
      const bb = def.bbox;
      const isSel = App.sel && App.sel.kind === 'comp' && App.sel.id === c.id;
      out.push(`<g ${exp ? '' : `data-comp="${c.id}"`} transform="translate(${c.x} ${c.y}) rotate(${c.rot || 0})">`);
      if (!exp) out.push(`<rect x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" fill="transparent" class="hit ${def.manual && App.mode === 'sim' ? 'manual' : ''}"/>`);
      if (isSel && !exp) out.push(`<rect x="${bb.x - 3}" y="${bb.y - 3}" width="${bb.w + 6}" height="${bb.h + 6}" rx="6" fill="rgba(245,158,11,.07)" stroke="${COL.sel}" stroke-width="1.5" stroke-dasharray="5 4" pointer-events="none"/>`);
      out.push(`<g pointer-events="none">${def.draw(c, drawCtx(c, { conns }))}</g>`);
      out.push('</g>');
    }
    // conexiones (puertos)
    for (const c of App.circ.comps) {
      for (const p of portsWorld(c)) {
        const k = c.id + ':' + p.id;
        const n = conns[k] || 0;
        if (n >= 2) out.push(`<circle cx="${p.wx}" cy="${p.wy}" r="3.4" fill="${sim ? NS.pcol(App.sim.pKey(k)) : COL.line}" pointer-events="none"/>`);
        if (exp) continue;
        const hov = App.hoverPort === k;
        const wiringFrom = App.wiring && App.wiring.from.c === c.id && App.wiring.from.p === p.id;
        if (App.mode === 'edit') {
          if (n === 0 || hov || wiringFrom) {
            out.push(`<circle cx="${p.wx}" cy="${p.wy}" r="${hov || wiringFrom ? 5.5 : 3.6}" fill="${hov || wiringFrom ? COL.accent : '#fff'}" stroke="${hov || wiringFrom ? COL.accent : COL.line}" stroke-width="1.4" pointer-events="none"/>`);
          }
          out.push(`<circle cx="${p.wx}" cy="${p.wy}" r="9" fill="transparent" data-port="${k}" style="cursor:crosshair"/>`);
        } else if (n === 0 && !p.ex) {
          out.push(`<circle cx="${p.wx}" cy="${p.wy}" r="3" fill="#fff" stroke="${COL.line}" stroke-width="1.2" pointer-events="none"/>`);
        }
      }
    }
    // tubo en construcción
    if (!exp && App.wiring) {
      const a = portWorld(App.wiring.from);
      if (a) {
        let pts;
        const hp = App.hoverPort ? App.hoverPort.split(':') : null;
        const b = hp ? portWorld({ c: hp[0], p: hp[1] }) : null;
        if (b) pts = route(a, b, App.wiring.pts);
        else {
          pts = route(a, null, App.wiring.pts.concat([{ x: snap(App.mouse.wx), y: snap(App.mouse.wy) }]));
        }
        out.push(`<polyline points="${ptsStr(pts)}" fill="none" stroke="${COL.accent}" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/>`);
        for (const w of App.wiring.pts) out.push(`<circle cx="${w.x}" cy="${w.y}" r="3" fill="${COL.accent}" pointer-events="none"/>`);
      }
    }
    // fantasma al colocar
    if (!exp && App.placing && App.mouse.inside) {
      const fake = { id: '_ghost', type: App.placing, x: snap(App.mouse.wx), y: snap(App.mouse.wy), rot: 0, props: Object.assign({}, DEF[App.placing].defaults) };
      out.push(`<g transform="translate(${fake.x} ${fake.y})" opacity=".55" pointer-events="none">${DEF[App.placing].draw(fake, { sim: false, rot: 0 })}</g>`);
    }
    return out.join('');
  }
  function render() {
    world.innerHTML = circuitSVG();
    $('#emptyState').hidden = App.circ.comps.length > 0 || !!App.placing;
  }

  // ---------------------------------------------------------------- deshacer
  function snapshot() { return JSON.stringify(App.circ); }
  function pushUndo(s) {
    App.undo.push(s || snapshot());
    if (App.undo.length > 150) App.undo.shift();
    App.redo = [];
  }
  function restore(s) {
    App.circ = JSON.parse(s);
    refreshNid();
    App.sel = null;
    changed();
  }
  function doUndo() {
    if (App.mode !== 'edit' || !App.undo.length) return;
    App.redo.push(snapshot());
    restore(App.undo.pop());
    toast('Deshecho');
  }
  function doRedo() {
    if (App.mode !== 'edit' || !App.redo.length) return;
    App.undo.push(snapshot());
    restore(App.redo.pop());
  }
  function refreshNid() {
    let m = 0;
    for (const x of App.circ.comps.concat(App.circ.tubes)) {
      const n = parseInt(String(x.id).replace(/\D/g, ''), 10);
      if (n > m) m = n;
    }
    App.nid = m + 1;
  }
  let saveTimer = null;
  function changed() {
    requestRender();
    renderInspector();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE, snapshot()); } catch (e) { /* sin almacenamiento */ }
    }, 300);
  }

  // ---------------------------------------------------------------- edición
  function nextCylLetter() {
    const used = new Set(App.circ.comps.filter(isCyl).map((c) => (c.props.label || '').toUpperCase()));
    for (const l of 'ABCDEFGH') if (!used.has(l)) return l;
    return 'Z';
  }
  const isCyl = (c) => c.type === 'cyl_se' || c.type === 'cyl_de';
  function addComp(type, x, y) {
    pushUndo();
    const c = { id: 'c' + App.nid++, type, x: snap(x), y: snap(y), rot: 0, props: Object.assign({}, DEF[type].defaults) };
    if (isCyl(c)) c.props.label = nextCylLetter();
    App.circ.comps.push(c);
    App.sel = { kind: 'comp', id: c.id };
    changed();
    return c;
  }
  function deleteSel() {
    if (!App.sel || App.mode !== 'edit') return;
    pushUndo();
    if (App.sel.kind === 'comp') {
      const id = App.sel.id;
      App.circ.comps = App.circ.comps.filter((c) => c.id !== id);
      App.circ.tubes = App.circ.tubes.filter((t) => t.a.c !== id && t.b.c !== id);
    } else {
      App.circ.tubes = App.circ.tubes.filter((t) => t.id !== App.sel.id);
    }
    App.sel = null;
    changed();
  }
  function rotateSel() {
    if (!App.sel || App.sel.kind !== 'comp' || App.mode !== 'edit') return;
    const c = compById(App.sel.id);
    pushUndo();
    c.rot = ((c.rot || 0) + 90) % 360;
    // los codos de sus tubos dejan de tener sentido
    for (const t of App.circ.tubes) if (t.a.c === c.id || t.b.c === c.id) t.pts = [];
    changed();
  }
  function duplicateSel() {
    if (!App.sel || App.sel.kind !== 'comp' || App.mode !== 'edit') return;
    const c = compById(App.sel.id);
    pushUndo();
    const n = JSON.parse(JSON.stringify(c));
    n.id = 'c' + App.nid++;
    n.x += 40; n.y += 40;
    if (isCyl(n)) n.props.label = nextCylLetter();
    App.circ.comps.push(n);
    App.sel = { kind: 'comp', id: n.id };
    changed();
  }
  function addTube(from, to, pts) {
    if (from.c === to.c && from.p === to.p) return;
    const dup = App.circ.tubes.some((t) => (t.a.c === from.c && t.a.p === from.p && t.b.c === to.c && t.b.p === to.p) || (t.b.c === from.c && t.b.p === from.p && t.a.c === to.c && t.a.p === to.p));
    if (dup) { toast('Esos dos puntos ya están conectados'); return; }
    pushUndo();
    const t = { id: 't' + App.nid++, a: from, b: to, pts: pts || [] };
    App.circ.tubes.push(t);
    changed();
  }

  // ---------------------------------------------------------------- eventos lienzo
  function setHint(txt) { $('#hint').innerHTML = txt; }
  function defaultHint() {
    if (App.mode === 'sim') setHint('<b>Simulando.</b> Mantén pulsados los pulsadores con el ratón · <kbd>Mayús</kbd>+clic los deja enclavados · clic en palancas para cambiarlas.');
    else if (App.placing) setHint('Haz clic en el lienzo para colocar <b>' + esc(DEF[App.placing].name) + '</b> · <kbd>Esc</kbd> cancela.');
    else if (App.wiring) setHint('Haz clic en otra <b>conexión</b> para terminar el tubo · clic en el lienzo añade un codo · <kbd>Esc</kbd> cancela.');
    else setHint('Arrastra componentes desde la izquierda · clic en una <b>conexión ○</b> para tirar un tubo · <kbd>R</kbd> girar · <kbd>Supr</kbd> borrar · <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer.');
  }

  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointerdown', (e) => {
    const w = toWorld(e);
    App.mouse.wx = w.x; App.mouse.wy = w.y;
    if (e.button === 2) {
      if (App.wiring) { App.wiring = null; defaultHint(); requestRender(); }
      else if (App.placing) { App.placing = null; defaultHint(); requestRender(); }
      return;
    }
    const portEl = e.target.closest('[data-port]');
    const compEl = e.target.closest('[data-comp]');
    const tubeEl = e.target.closest('[data-tube]');

    if (App.mode === 'sim') {
      if (compEl) {
        const c = compById(compEl.dataset.comp);
        const def = DEF[c.type];
        selectObj({ kind: 'comp', id: c.id });
        if (def.manual === 'momentary') {
          if (e.shiftKey) { c.st.latched = !c.st.latched; c.st.manual = c.st.latched; }
          else { c.st.manual = true; c.st.latched = false; App.pressed = c; }
          svg.setPointerCapture(e.pointerId);
        } else if (def.manual === 'toggle') {
          c.st.lever = !c.st.lever;
        }
        return;
      }
      startPan(e);
      return;
    }

    if (App.placing) {
      addComp(App.placing, w.x, w.y);
      if (!e.shiftKey) App.placing = null;
      defaultHint();
      return;
    }
    if (portEl) {
      const [c, p] = portEl.dataset.port.split(':');
      if (!App.wiring) {
        App.wiring = { from: { c, p }, pts: [] };
      } else {
        const from = App.wiring.from;
        const pts = App.wiring.pts;
        App.wiring = null;
        if (!(from.c === c && from.p === p)) addTube(from, { c, p }, pts);
      }
      defaultHint();
      requestRender();
      return;
    }
    if (App.wiring) {
      App.wiring.pts.push({ x: snap(w.x), y: snap(w.y) });
      requestRender();
      return;
    }
    if (compEl) {
      const c = compById(compEl.dataset.comp);
      selectObj({ kind: 'comp', id: c.id });
      App.drag = { id: c.id, ox: w.x - c.x, oy: w.y - c.y, before: snapshot(), moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (tubeEl) {
      selectObj({ kind: 'tube', id: tubeEl.dataset.tube });
      return;
    }
    selectObj(null);
    startPan(e);
  });
  function startPan(e) {
    App.pan = { sx: e.clientX, sy: e.clientY, vx: App.view.x, vy: App.view.y };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
  }
  svg.addEventListener('pointermove', (e) => {
    const w = toWorld(e);
    App.mouse.wx = w.x; App.mouse.wy = w.y; App.mouse.inside = true;
    if (App.pan) {
      App.view.x = App.pan.vx + e.clientX - App.pan.sx;
      App.view.y = App.pan.vy + e.clientY - App.pan.sy;
      applyView();
      return;
    }
    if (App.drag) {
      const c = compById(App.drag.id);
      const nx = snap(w.x - App.drag.ox), ny = snap(w.y - App.drag.oy);
      if (nx !== c.x || ny !== c.y) {
        if (!App.drag.moved) { pushUndo(App.drag.before); App.drag.moved = true; }
        const dx = nx - c.x, dy = ny - c.y;
        c.x = nx; c.y = ny;
        // desplazar codos de tubos que unen dos componentes que se mueven… (solo uno aquí): se descartan codos
        for (const t of App.circ.tubes) {
          if ((t.a.c === c.id || t.b.c === c.id) && t.pts.length && t.a.c === t.b.c) t.pts.forEach((p) => { p.x += dx; p.y += dy; });
        }
        requestRender();
      }
      return;
    }
    // puerto bajo el ratón
    const portEl = e.target.closest && e.target.closest('[data-port]');
    const hp = portEl ? portEl.dataset.port : null;
    if (hp !== App.hoverPort) { App.hoverPort = hp; requestRender(); }
    if (App.wiring || App.placing) requestRender();
    showTip(e);
  });
  svg.addEventListener('pointerleave', () => { App.mouse.inside = false; hideTip(); if (App.placing) requestRender(); });
  function endPointer() {
    if (App.pressed) {
      if (!App.pressed.st.latched) App.pressed.st.manual = false;
      App.pressed = null;
    }
    if (App.drag) {
      if (App.drag.moved) changed();
      App.drag = null;
    }
    if (App.pan) { App.pan = null; svg.classList.remove('panning'); }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0015);
    zoomAt(e.clientX, e.clientY, f);
  }, { passive: false });
  function zoomAt(cx, cy, f) {
    const r = svg.getBoundingClientRect();
    const v = App.view;
    const ns = Math.max(0.25, Math.min(3, v.s * f));
    const px = cx - r.left, py = cy - r.top;
    v.x = px - ((px - v.x) * ns) / v.s;
    v.y = py - ((py - v.y) * ns) / v.s;
    v.s = ns;
    applyView();
  }
  function fitView() {
    const r = svg.getBoundingClientRect();
    const bb = circuitBBox();
    if (!bb) { App.view = { x: r.width / 2 - 150, y: 80, s: 1 }; applyView(); return; }
    const pad = 50;
    const s = Math.max(0.3, Math.min(1.4, Math.min((r.width - pad * 2) / bb.w, (r.height - pad * 2) / bb.h)));
    App.view.s = s;
    App.view.x = (r.width - bb.w * s) / 2 - bb.x * s;
    App.view.y = (r.height - bb.h * s) / 2 - bb.y * s;
    applyView();
  }
  function circuitBBox() {
    if (!App.circ.comps.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const c of App.circ.comps) {
      const b = DEF[c.type].bbox;
      for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
        const [rx, ry] = rotPt(x, y, c.rot || 0);
        add(c.x + rx, c.y + ry);
      }
    }
    for (const t of App.circ.tubes) for (const p of tubePts(t) || []) add(p.x, p.y);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // tooltip con el nombre del componente / conexión
  const tip = $('#tip');
  function showTip(e) {
    if (App.drag || App.pan || App.wiring) { hideTip(); return; }
    const portEl = e.target.closest && e.target.closest('[data-port]');
    const compEl = e.target.closest && e.target.closest('[data-comp]');
    let html = '';
    if (portEl) {
      const [cid, pid] = portEl.dataset.port.split(':');
      const c = compById(cid);
      const p = DEF[c.type].ports(c).find((q) => q.id === pid);
      html = `Conexión <b>${esc(p.name || pid)}</b> · ${portRole(c, p)}`;
    } else if (compEl && App.mode === 'sim') {
      const c = compById(compEl.dataset.comp);
      const d = DEF[c.type];
      if (d.manual === 'momentary') html = 'Mantén pulsado para accionar · <kbd>Mayús</kbd>+clic enclava';
      else if (d.manual === 'toggle') html = 'Clic para cambiar de posición';
    } else if (compEl) {
      const c = compById(compEl.dataset.comp);
      html = esc(DEF[c.type].name);
    }
    if (!html) { hideTip(); return; }
    tip.innerHTML = html;
    tip.hidden = false;
    const r = svg.parentElement.getBoundingClientRect();
    tip.style.left = e.clientX - r.left + 14 + 'px';
    tip.style.top = e.clientY - r.top + 14 + 'px';
  }
  function hideTip() { tip.hidden = true; }
  function portRole(c, p) {
    if (isCyl(c)) return p.id === 'A' ? 'cámara del émbolo (avance)' : 'cámara del vástago (retroceso)';
    if (c.type === 'source') return 'salida de aire comprimido';
    const id = p.id;
    if (id === '1' || id === '1a' || id === '1b') return c.type === 'or' || c.type === 'and' ? 'entrada de señal' : 'alimentación (entrada de aire)';
    if (id === '2' || id === '4') return 'utilización (salida de trabajo)';
    if (id === '3' || id === '5') return 'escape a la atmósfera';
    if (id === '12' || id === '14') return 'pilotaje (señal de mando)';
    return '';
  }

  // ---------------------------------------------------------------- teclado
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSel(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveFile(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); }
    else if (k === 'r') rotateSel();
    else if (k === 'escape') {
      if (App.wiring) App.wiring = null;
      else if (App.placing) App.placing = null;
      else selectObj(null);
      closeModals();
      defaultHint();
      requestRender();
    } else if (k === ' ' ) {
      e.preventDefault();
      if (App.mode === 'edit') startSim(); else togglePause();
    }
  });

  // ---------------------------------------------------------------- paleta
  function buildPalette() {
    const pal = $('#palette .pal-list');
    let html = '';
    for (const cat of NS.CATS) {
      html += `<details open><summary>${esc(cat.name)}</summary><div class="pal-grid">`;
      for (const type of cat.items) {
        const d = DEF[type];
        html += `<button class="pal-item" data-type="${type}" title="${esc(d.name)}">${previewSVG(type)}<span>${esc(d.short || d.name)}</span></button>`;
      }
      html += '</div></details>';
    }
    pal.innerHTML = html;
    pal.addEventListener('pointerdown', (e) => {
      const it = e.target.closest('.pal-item');
      if (!it || App.mode !== 'edit') return;
      e.preventDefault();
      App.placing = it.dataset.type;
      App.wiring = null;
      App.paletteDrag = true;
      document.querySelectorAll('.pal-item.on').forEach((x) => x.classList.remove('on'));
      it.classList.add('on');
      defaultHint();
      requestRender();
    });
    window.addEventListener('pointermove', (e) => {
      if (!App.paletteDrag) return;
      const r = svg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      App.mouse.inside = inside;
      if (inside) { const w = toWorld(e); App.mouse.wx = w.x; App.mouse.wy = w.y; }
      requestRender();
    });
    window.addEventListener('pointerup', (e) => {
      if (!App.paletteDrag) return;
      App.paletteDrag = false;
      document.querySelectorAll('.pal-item.on').forEach((x) => x.classList.remove('on'));
      const r = svg.getBoundingClientRect();
      if (App.placing && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const w = toWorld(e);
        addComp(App.placing, w.x, w.y);
        App.placing = null;
        defaultHint();
      }
    });
  }
  function previewSVG(type) {
    const d = DEF[type];
    const c = { id: 'p', type, x: 0, y: 0, rot: 0, props: Object.assign({}, d.defaults) };
    if (isCyl(c)) c.props.label = '';
    const b = d.bbox, pad = 6;
    return `<svg viewBox="${b.x - pad} ${b.y - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${d.draw(c, { sim: false, rot: 0, conn: () => false })}</svg>`;
  }

  // ---------------------------------------------------------------- inspector
  function selectObj(s) {
    const same = (s && App.sel && s.kind === App.sel.kind && s.id === App.sel.id) || (!s && !App.sel);
    App.sel = s;
    requestRender();
    if (!same) renderInspector();
  }
  function renderInspector() {
    const box = $('#inspector .insp-body');
    const sel = App.sel;
    if (!sel) {
      box.innerHTML = inspectorEmpty();
      return;
    }
    if (sel.kind === 'tube') {
      box.innerHTML = `<h3>Tubo</h3><p class="desc">Conducto de aire que une dos conexiones. Si una conexión tiene dos o más tubos aparece un punto de unión (●).</p>
        <div class="live" id="live"></div>
        ${App.mode === 'edit' ? '<div class="btnrow"><button class="btn danger" data-act="del">🗑 Eliminar tubo</button></div>' : ''}`;
      bindInspector(box);
      updateLive();
      return;
    }
    const c = compById(sel.id);
    if (!c) { box.innerHTML = inspectorEmpty(); return; }
    const d = DEF[c.type];
    let f = '';
    for (const p of d.props) {
      const disabled = App.mode === 'sim' && !p.live ? 'disabled' : '';
      const v = c.props[p.k] != null ? c.props[p.k] : '';
      f += `<label class="field"><span>${esc(p.l)}</span>`;
      if (p.t === 'text') f += `<input type="text" data-k="${p.k}" value="${esc(v)}" placeholder="${esc(p.ph || '')}" maxlength="18" ${disabled}>`;
      else if (p.t === 'letter') f += `<input type="text" data-k="${p.k}" value="${esc(v)}" maxlength="1" class="letter" ${disabled}>`;
      else if (p.t === 'num') f += `<input type="number" data-k="${p.k}" value="${esc(v)}" min="${p.min}" max="${p.max}" step="${p.step}" ${disabled}>`;
      else if (p.t === 'range') f += `<div class="range"><input type="range" data-k="${p.k}" value="${esc(v)}" min="${p.min}" max="${p.max}" step="${p.step}" ${disabled}><output>${esc(v)} %</output></div>`;
      else if (p.t === 'sensor') {
        const opts = new Set();
        App.circ.comps.filter(isCyl).forEach((cy) => { const l = (cy.props.label || '').toLowerCase(); if (l) { opts.add(l + '0'); opts.add(l + '1'); } });
        if (v) opts.add(v);
        f += `<select data-k="${p.k}" ${disabled}>${[...opts].sort().map((o) => `<option value="${o}" ${o === v ? 'selected' : ''}>${o} — cilindro ${o[0].toUpperCase()} ${o[1] === '0' ? 'recogido' : 'fuera'}</option>`).join('')}</select>`;
      }
      f += '</label>';
    }
    box.innerHTML = `<h3>${esc(d.name)}</h3>
      <div class="insp-prev">${previewSVG(c.type)}</div>
      <p class="desc">${esc(d.desc)}</p>
      ${f ? `<div class="fields">${f}</div>` : ''}
      <div class="live" id="live"></div>
      ${App.mode === 'edit' ? `<div class="btnrow">
        <button class="btn" data-act="rot" title="Girar 90° (R)">⟳ Girar</button>
        <button class="btn" data-act="dup" title="Duplicar (Ctrl+D)">⧉ Duplicar</button>
        <button class="btn danger" data-act="del" title="Eliminar (Supr)">🗑 Eliminar</button></div>` : ''}`;
    bindInspector(box, c);
    updateLive();
  }
  function inspectorEmpty() {
    const nC = App.circ.comps.length, nT = App.circ.tubes.length;
    return `<h3>Propiedades</h3>
      <p class="desc">Selecciona un componente para ver qué hace y cambiar sus propiedades.</p>
      <div class="stats"><div><b>${nC}</b><span>componentes</span></div><div><b>${nT}</b><span>tubos</span></div></div>
      <h4>Colores durante la simulación</h4>
      <div class="legend"><i style="background:${NS.pcol(6)}"></i>Tubo con presión (6 bar)</div>
      <div class="legend"><i style="background:${NS.pcol(2)}"></i>Presión baja</div>
      <div class="legend"><i style="background:${NS.pcol(0)}"></i>Sin presión (a escape)</div>
      <h4>Numeración de conexiones</h4>
      <ul class="nums"><li><b>1</b> alimentación</li><li><b>2, 4</b> utilización</li><li><b>3, 5</b> escape</li><li><b>12, 14</b> pilotaje: 14 conecta 1→4, 12 conecta 1→2</li></ul>`;
  }
  function bindInspector(box, c) {
    box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'del') deleteSel();
      if (a === 'rot') rotateSel();
      if (a === 'dup') duplicateSel();
    }));
    if (!c) return;
    box.querySelectorAll('[data-k]').forEach((inp) => {
      let pushed = false;
      const apply = (final) => {
        const k = inp.dataset.k;
        const p = DEF[c.type].props.find((q) => q.k === k);
        let v = inp.value;
        if (p.t === 'num' || p.t === 'range') {
          v = parseFloat(v);
          if (isNaN(v)) return;
          v = Math.max(p.min, Math.min(p.max, v));
        }
        if (p.t === 'letter') v = v.toUpperCase().replace(/[^A-Z]/g, '');
        if (p.t === 'range') inp.parentElement.querySelector('output').textContent = v + ' %';
        if (App.mode === 'edit' && !pushed) { pushUndo(); pushed = true; }
        c.props[k] = v;
        if (final) { pushed = false; changed(); } else requestRender();
      };
      inp.addEventListener('input', () => apply(false));
      inp.addEventListener('change', () => apply(true));
    });
  }
  let lastLive = 0;
  function updateLive() {
    const el = $('#live');
    if (!el) return;
    if (App.mode !== 'sim' || !App.sim || !App.sel) { el.innerHTML = ''; return; }
    const S = App.sim;
    if (App.sel.kind === 'tube') {
      const t = App.circ.tubes.find((x) => x.id === App.sel.id);
      if (!t) return;
      el.innerHTML = `<h4>En este momento</h4><div class="kv"><span>Presión</span><b>${S.pKey(t.a.c + ':' + t.a.p).toFixed(2)} bar</b></div>`;
      return;
    }
    const c = compById(App.sel.id);
    if (!c) return;
    const d = DEF[c.type];
    let h = '<h4>En este momento</h4>';
    if (d.stateText) h += `<div class="state">${esc(d.stateText(c))}</div>`;
    for (const p of d.ports(c)) h += `<div class="kv"><span>Conexión ${esc(p.name || p.id)}</span><b>${S.p(c, p.id).toFixed(2)} bar</b></div>`;
    el.innerHTML = h;
  }

  // ---------------------------------------------------------------- simulación
  let rafId = 0, lastTs = 0;
  function checkCircuit() {
    const warns = [];
    const conns = connCounts();
    let open = 0;
    for (const c of App.circ.comps) for (const p of DEF[c.type].ports(c)) if (!p.ex && !(conns[c.id + ':' + p.id] > 0)) open++;
    if (open) warns.push(`Hay ${open} conexión(es) sin tubo: quedan taponadas.`);
    if (!App.circ.comps.some((c) => c.type === 'source')) warns.push('No hay ninguna fuente de aire comprimido.');
    const labels = App.circ.comps.filter(isCyl).map((c) => (c.props.label || '').toUpperCase());
    const dups = labels.filter((l, i) => l && labels.indexOf(l) !== i);
    if (dups.length) warns.push(`Hay cilindros con la misma letra (${[...new Set(dups)].join(', ')}).`);
    for (const c of App.circ.comps) {
      if (c.type === 'v32nc_roller') {
        const s = (c.props.sensor || '').toUpperCase();
        if (!s || !labels.includes(s[0])) warns.push(`El final de carrera «${c.props.sensor || '?'}» no corresponde a ningún cilindro.`);
      }
    }
    return warns;
  }
  function startSim() {
    if (App.mode === 'sim') { if (App.paused) togglePause(); return; }
    if (!App.circ.comps.length) { toast('Primero monta un circuito o abre un ejemplo.'); return; }
    App.wiring = null;
    App.placing = null;
    App.drag = null;
    App.mode = 'sim';
    App.paused = false;
    App.sim = new NS.Sim(App.circ);
    document.body.classList.add('simulating');
    const w = checkCircuit();
    if (w.length) toast('⚠ ' + w.join('<br>⚠ '), 6000);
    updateSimButtons();
    renderInspector();
    defaultHint();
    openChart(true);
    lastTs = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }
  function stopSim() {
    if (App.mode !== 'sim') return;
    App.mode = 'edit';
    App.sim = null;
    App.pressed = null;
    for (const c of App.circ.comps) delete c.st;
    cancelAnimationFrame(rafId);
    document.body.classList.remove('simulating');
    updateSimButtons();
    renderInspector();
    defaultHint();
    render();
    drawChart();
  }
  function togglePause() {
    if (App.mode !== 'sim') return;
    App.paused = !App.paused;
    updateSimButtons();
  }
  function updateSimButtons() {
    const sim = App.mode === 'sim';
    $('#btnPlay').classList.toggle('on', sim && !App.paused);
    $('#btnPause').disabled = !sim;
    $('#btnPause').classList.toggle('on', sim && App.paused);
    $('#btnStop').disabled = !sim;
    $('#modeBadge').textContent = sim ? (App.paused ? '⏸ En pausa' : '● Simulando') : '✎ Edición';
    $('#modeBadge').className = 'badge ' + (sim ? (App.paused ? 'paused' : 'sim') : 'edit');
    document.querySelectorAll('.edit-only').forEach((b) => (b.disabled = sim));
  }
  function loop(ts) {
    if (App.mode !== 'sim') return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!App.paused) App.sim.run(dt * App.speed);
    render();
    drawChart();
    if (ts - lastLive > 150) { lastLive = ts; updateLive(); $('#simTime').textContent = 't = ' + App.sim.t.toFixed(1) + ' s'; }
    rafId = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- diagrama espacio-tiempo
  const chart = $('#chart');
  function openChart(open) {
    $('#chartPanel').classList.toggle('open', open);
    resizeChart();
  }
  function resizeChart() {
    const r = chart.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    chart.width = Math.max(1, Math.round(r.width * dpr));
    chart.height = Math.max(1, Math.round(r.height * dpr));
    drawChart();
  }
  function drawChart() {
    const ctx = chart.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = chart.width / dpr, H = chart.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!$('#chartPanel').classList.contains('open') || W < 10) return;
    const S = App.sim;
    const labels = App.circ.comps.filter(isCyl).map((c) => (c.props.label || '').toLowerCase()).filter(Boolean).sort();
    ctx.font = `12px ${FONT}`;
    if (!labels.length) {
      ctx.fillStyle = '#64748b';
      ctx.fillText('Añade cilindros al circuito y pulsa ▶ Simular para ver su diagrama espacio-tiempo.', 16, H / 2);
      return;
    }
    const left = 56, right = 14, top = 10, bottom = 22;
    const laneH = (H - top - bottom) / labels.length;
    const win = 20;
    const tNow = S ? S.t : 0;
    const t0 = Math.max(0, tNow - win);
    const tx = (t) => left + ((t - t0) / win) * (W - left - right);
    // rejilla de tiempo
    ctx.strokeStyle = '#e2e8f0'; ctx.fillStyle = '#94a3b8'; ctx.lineWidth = 1;
    for (let t = Math.ceil(t0); t <= t0 + win; t++) {
      const x = tx(t);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, H - bottom); ctx.stroke();
      if (t % 2 === 0) ctx.fillText(t + ' s', x - 8, H - 6);
    }
    labels.forEach((l, i) => {
      const y0 = top + i * laneH + 6, y1 = top + (i + 1) * laneH - 6;
      const yOf = (x) => y1 - x * (y1 - y0);
      ctx.fillStyle = '#1e293b';
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText(l.toUpperCase(), 8, (y0 + y1) / 2 + 4);
      ctx.font = `10px ${FONT}`;
      ctx.fillStyle = '#dc2626';
      ctx.fillText('1', 34, y0 + 4);
      ctx.fillText('0', 34, y1 + 3);
      ctx.strokeStyle = '#cbd5e1';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(left, y0); ctx.lineTo(W - right, y0); ctx.moveTo(left, y1); ctx.lineTo(W - right, y1); ctx.stroke();
      ctx.setLineDash([]);
      if (!S) return;
      ctx.strokeStyle = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777'][i % 5];
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      let first = true;
      for (const h of S.hist) {
        if (h.t < t0 - 0.1 || h.xs[l] == null) continue;
        const x = tx(h.t), y = yOf(h.xs[l]);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    });
  }
  window.addEventListener('resize', () => { resizeChart(); });

  // ---------------------------------------------------------------- archivos
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function serialize() {
    return JSON.stringify({ app: 'NeumaSim', version: 1, comps: App.circ.comps.map(({ st, ...c }) => c), tubes: App.circ.tubes }, null, 1);
  }
  function loadCircuit(obj, name) {
    if (!obj || !Array.isArray(obj.comps) || !Array.isArray(obj.tubes)) throw new Error('Formato no válido');
    for (const c of obj.comps) if (!DEF[c.type]) throw new Error('Componente desconocido: ' + c.type);
    stopSim();
    pushUndo();
    App.circ = { comps: obj.comps.map((c) => Object.assign({ rot: 0 }, c, { props: Object.assign({}, DEF[c.type].defaults, c.props) })), tubes: obj.tubes.map((t) => Object.assign({ pts: [] }, t)) };
    refreshNid();
    App.sel = null;
    App.hist = null;
    changed();
    setTimeout(fitView, 0);
    drawChart();
    if (name) $('#docName').textContent = name;
  }
  function saveFile() {
    let name = ($('#docName').textContent || 'circuito').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'circuito';
    download(name + '.neumasim.json', new Blob([serialize()], { type: 'application/json' }));
    toast('Circuito guardado como <b>' + esc(name) + '.neumasim.json</b>');
  }
  $('#fileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        loadCircuit(JSON.parse(rd.result), f.name.replace(/\.neumasim\.json$|\.json$/i, ''));
        toast('Circuito abierto');
      } catch (err) { toast('No se pudo abrir el archivo: ' + esc(err.message)); }
    };
    rd.readAsText(f);
    e.target.value = '';
  });
  function exportPNG() {
    const bb = circuitBBox();
    if (!bb) { toast('El circuito está vacío.'); return; }
    const pad = 30, scale = 2;
    const w = Math.ceil(bb.w + pad * 2), h = Math.ceil(bb.h + pad * 2);
    const sel = App.sel; App.sel = null;
    const body = circuitSVG({ export: true });
    App.sel = sel;
    const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="${bb.x - pad} ${bb.y - pad} ${w} ${h}"><rect x="${bb.x - pad}" y="${bb.y - pad}" width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = w * scale; cv.height = h * scale;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0);
      cv.toBlob((b) => download((($('#docName').textContent || 'circuito').trim() || 'circuito') + '.png', b), 'image/png');
    };
    img.onerror = () => download('circuito.svg', new Blob([src], { type: 'image/svg+xml' }));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }
  // enlace para compartir: circuito comprimido en el fragmento de la URL
  async function toHash(str) {
    const bytes = new TextEncoder().encode(str);
    let out = bytes, pre = 'j';
    if (window.CompressionStream) {
      const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      out = new Uint8Array(await new Response(cs).arrayBuffer());
      pre = 'z';
    }
    let bin = '';
    out.forEach((b) => (bin += String.fromCharCode(b)));
    return pre + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function fromHash(h) {
    const pre = h[0];
    const b64 = h.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    if (pre === 'z') {
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(ds).text();
    }
    return new TextDecoder().decode(bytes);
  }
  async function shareLink() {
    if (!App.circ.comps.length) { toast('El circuito está vacío.'); return; }
    const compact = JSON.stringify({ comps: App.circ.comps.map(({ st, ...c }) => c), tubes: App.circ.tubes });
    const h = await toHash(compact);
    const url = location.href.split('#')[0] + '#c=' + h;
    try {
      await navigator.clipboard.writeText(url);
      toast('🔗 Enlace copiado. Quien lo abra verá este circuito.');
    } catch (e) {
      prompt('Copia este enlace:', url);
    }
  }

  // ---------------------------------------------------------------- modales y avisos
  let toastT = 0;
  function toast(html, ms = 2800) {
    const t = $('#toast');
    t.innerHTML = html;
    t.hidden = false;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 250); }, ms);
  }
  NS.toast = toast;
  function openModal(id) { closeModals(); $(id).hidden = false; }
  function closeModals() { document.querySelectorAll('.modal').forEach((m) => (m.hidden = true)); }
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); }));

  function buildExamples() {
    const list = $('#exList');
    list.innerHTML = NS.EXAMPLES.map((ex) => {
      const circ = ex.build();
      return `<button class="ex-card" data-ex="${ex.id}"><span class="lvl">${esc(ex.level)}</span><b>${esc(ex.title)}</b><span>${esc(ex.desc)}</span><small>${circ.comps.length} componentes</small></button>`;
    }).join('');
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ex]');
      if (!b) return;
      const ex = NS.EXAMPLES.find((x) => x.id === b.dataset.ex);
      loadCircuit(ex.build(), ex.title.replace(/^\d+\.\s*/, ''));
      closeModals();
      showExampleNote(ex);
    });
  }
  function showExampleNote(ex) {
    const n = $('#exNote');
    n.innerHTML = `<b>${esc(ex.title)}</b><p>${esc(ex.desc)}</p><button class="btn primary sm" id="exGo">▶ Simular</button><button class="x" aria-label="Cerrar">✕</button>`;
    n.hidden = false;
    $('#exGo').onclick = () => { startSim(); };
    n.querySelector('.x').onclick = () => (n.hidden = true);
  }

  // ---------------------------------------------------------------- barra superior
  function bind(id, fn) { $(id).addEventListener('click', fn); }
  bind('#btnNew', () => {
    if (App.circ.comps.length && !confirm('¿Empezar un circuito nuevo? (Podrás recuperarlo con Deshacer)')) return;
    stopSim();
    pushUndo();
    App.circ = { comps: [], tubes: [] };
    App.sel = null;
    $('#docName').textContent = 'Circuito sin título';
    $('#exNote').hidden = true;
    changed();
    fitView();
    drawChart();
  });
  bind('#btnOpen', () => $('#fileInput').click());
  bind('#btnSave', saveFile);
  bind('#btnPng', exportPNG);
  bind('#btnShare', shareLink);
  bind('#btnExamples', () => openModal('#exModal'));
  bind('#btnExamples2', () => openModal('#exModal'));
  bind('#btnHelp', () => openModal('#helpModal'));
  bind('#btnPlay', startSim);
  bind('#btnPause', togglePause);
  bind('#btnStop', stopSim);
  bind('#btnUndo', doUndo);
  bind('#btnRedo', doRedo);
  bind('#zoomIn', () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); });
  bind('#zoomOut', () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); });
  bind('#zoomFit', fitView);
  bind('#chartToggle', () => openChart(!$('#chartPanel').classList.contains('open')));
  $('#speed').addEventListener('change', (e) => (App.speed = parseFloat(e.target.value)));
  $('#docName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });

  // ---------------------------------------------------------------- inicio
  async function init() {
    buildPalette();
    buildExamples();
    renderInspector();
    updateSimButtons();
    defaultHint();
    let loaded = false;
    const m = /#c=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (m) {
      try { loadCircuit(JSON.parse(await fromHash(m[1])), 'Circuito compartido'); loaded = true; App.undo = []; }
      catch (e) { toast('El enlace no contiene un circuito válido.'); }
    }
    if (!loaded) {
      try {
        const s = localStorage.getItem(STORE);
        if (s) { const o = JSON.parse(s); if (o.comps && o.comps.length) { loadCircuit(o); loaded = true; App.undo = []; } }
      } catch (e) { /* ignorar */ }
    }
    applyView();
    fitView();
    render();
    resizeChart();
  }
  NS.api = { startSim, stopSim, loadCircuit, fitView, render, compById, portsWorld, snapshot };
  init();
})();
