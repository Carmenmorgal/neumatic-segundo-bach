/* NeumaSim — Biblioteca de componentes (símbolos ISO 1219 simplificados + comportamiento) */
(function () {
  'use strict';
  const NS = (window.NS = window.NS || {});

  const COL = (NS.COL = {
    line: '#1e293b',
    text: '#1e293b',
    muted: '#64748b',
    sel: '#f59e0b',
    accent: '#2563eb',
    green: '#16a34a',
    red: '#dc2626',
    boxFill: '#ffffff',
    boxFillOff: '#f8fafc',
  });
  NS.G = 3; // conductancia de una vía de válvula abierta
  NS.THR = 1.5; // presión mínima de pilotaje (bar)
  const FONT = 'Inter, Segoe UI, Roboto, Arial, sans-serif';

  // Color según presión (bar manométricos)
  NS.pcol = function (p) {
    if (p == null) return COL.line;
    const t = Math.max(0, Math.min(1, p / 6));
    const lo = [150, 190, 228], hi = [13, 60, 145];
    const c = lo.map((v, i) => Math.round(v + (hi[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  NS.pfill = function (p) {
    const t = Math.max(0, Math.min(1, (p || 0) / 6));
    const lo = [255, 255, 255], hi = [120, 175, 232];
    const c = lo.map((v, i) => Math.round(v + (hi[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const pcol = NS.pcol;

  NS.DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };

  // ---------- utilidades SVG ----------
  const r2 = (n) => Math.round(n * 100) / 100;
  function L(x1, y1, x2, y2, col = COL.line, w = 1.6, extra = '') {
    return `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
  }
  function Rc(x, y, w, h, fill = 'none', col = COL.line, sw = 1.6, extra = '') {
    return `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}" stroke="${col}" stroke-width="${sw}" ${extra}/>`;
  }
  function Ci(x, y, r, fill = 'none', col = COL.line, sw = 1.6) {
    return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="${fill}" stroke="${col}" stroke-width="${sw}"/>`;
  }
  function P(d, fill = 'none', col = COL.line, sw = 1.6, extra = '') {
    return `<path d="${d}" fill="${fill}" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  }
  function T(x, y, s, ctx, o = {}) {
    const rot = (ctx && ctx.rot) || 0;
    const size = o.size || 10, anchor = o.anchor || 'middle', col = o.col || COL.text, weight = o.weight || 500;
    const tr = rot ? ` transform="rotate(${-rot} ${r2(x)} ${r2(y)})"` : '';
    return `<text x="${r2(x)}" y="${r2(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${col}" text-anchor="${anchor}" dominant-baseline="middle"${tr}>${esc(s)}</text>`;
  }
  function arrow(x1, y1, x2, y2, col = COL.line, w = 1.6) {
    const a = Math.atan2(y2 - y1, x2 - x1), hl = 7, hw = 3.2;
    const bx = x2 - hl * Math.cos(a), by = y2 - hl * Math.sin(a);
    const px = -Math.sin(a) * hw, py = Math.cos(a) * hw;
    return L(x1, y1, bx, by, col, w) + `<polygon points="${r2(x2)},${r2(y2)} ${r2(bx + px)},${r2(by + py)} ${r2(bx - px)},${r2(by - py)}" fill="${col}"/>`;
  }
  function exhaustTri(x, y, dir, ctx) {
    // triángulo de escape libre a la atmósfera
    if (dir === 'd') return P(`M${x - 6} ${y + 2} L${x + 6} ${y + 2} L${x} ${y + 10} Z`, '#fff');
    return '';
  }
  NS.svg = { L, Rc, Ci, P, T, arrow, esc, FONT };

  const DEF = (NS.DEF = {});

  // =====================================================================
  //  VÁLVULAS DISTRIBUIDORAS (genéricas)
  // =====================================================================
  const VW = 60; // ancho de cada casilla
  function valveDef(type, spec) {
    const w = VW;
    const nb = spec.boxes.length;
    const def = {
      type,
      name: spec.name,
      short: spec.short,
      cat: 'valv',
      desc: spec.desc,
      spec,
      manual: spec.manual || null,
      defaults: Object.assign({ label: '' }, spec.defaults || {}),
      props: [{ k: 'label', t: 'text', l: 'Nombre (opcional)', ph: 'p. ej. S1, Marcha…' }].concat(spec.props || []),
      bbox: { x: -w - 42, y: -24, w: 3 * w + 84, h: 98 },
      ports(c) {
        const ps = [];
        spec.top.forEach(([id, x]) => ps.push({ id, x, y: -20, dir: 'u' }));
        spec.bottom.forEach(([id, x, ex]) => ps.push({ id, x, y: 60, dir: 'd', ex: !!ex }));
        if (spec.pilotL) ps.push({ id: spec.pilotL, x: -w - 30, y: 20, dir: 'l', pilot: true });
        if (spec.pilotR) ps.push({ id: spec.pilotR, x: 2 * w + 30, y: 20, dir: 'r', pilot: true });
        return ps;
      },
      init(c) {
        c.st = { active: spec.rest, manual: false, lever: false, tacc: 0 };
      },
      paths(c) {
        const box = spec.boxes[c.st.active];
        return box.p.map(([a, b]) => [a, b, NS.G, 0]);
      },
      update(c, sim, dt) {
        const st = c.st;
        if (spec.kind === 'mono') {
          let a = false;
          if (spec.L === 'button' || spec.L === 'roller') a = !!st.manual;
          if (spec.L === 'roller') a = a || sim.sensor(c.props.sensor);
          if (spec.L === 'pilot') a = sim.p(c, spec.pilotL) > NS.THR;
          if (spec.L === 'timer') {
            if (sim.p(c, spec.pilotL) > NS.THR) st.tacc += dt;
            else st.tacc = 0;
            a = st.tacc >= (+c.props.t || 0);
          }
          st.active = a ? 0 : 1;
        } else if (spec.kind === 'toggle') {
          st.active = st.lever ? 0 : 1;
        } else if (spec.kind === 'bi') {
          const a = sim.p(c, spec.pilotL) > NS.THR;
          const b = sim.p(c, spec.pilotR) > NS.THR;
          if (a && !b) st.active = 0;
          else if (b && !a) st.active = 1;
        }
      },
      stateText(c) {
        return c.st.active === 0 ? 'Accionada (casilla izquierda)' : 'Reposo (casilla derecha)';
      },
      draw(c, ctx) {
        const st = ctx.st || {};
        const active = st.active != null ? st.active : spec.rest;
        const off = -active * w;
        const Pp = ctx.P || (() => null);
        const portX = {};
        const isTop = {};
        spec.top.forEach(([id, x]) => { portX[id] = x; isTop[id] = true; });
        spec.bottom.forEach(([id, x]) => { portX[id] = x; isTop[id] = false; });
        let s = '';
        for (let k = 0; k < nb; k++) {
          const bx = off + k * w;
          const isAct = k === active;
          s += Rc(bx, 0, w, 40, isAct ? COL.boxFill : COL.boxFillOff, COL.line, 1.6);
          const box = spec.boxes[k];
          box.p.forEach(([a, b]) => {
            let col = COL.line;
            if (ctx.sim && isAct) {
              const pa = Pp(a), pb = Pp(b);
              col = pcol(Math.max(pa || 0, pb || 0));
            }
            const x1 = bx + portX[a], y1 = isTop[a] ? 2 : 38;
            const x2 = bx + portX[b], y2 = isTop[b] ? 2 : 38;
            s += arrow(x1, y1, x2, y2, col, isAct && ctx.sim ? 2 : 1.4);
          });
          (box.b || []).forEach((id) => {
            const x = bx + portX[id];
            if (isTop[id]) s += L(x, 0, x, 10) + L(x - 5, 10, x + 5, 10);
            else s += L(x, 40, x, 30) + L(x - 5, 30, x + 5, 30);
          });
        }
        // conexiones fijas (siempre junto a la casilla activa)
        spec.top.forEach(([id, x]) => {
          s += L(x, -20, x, 0, ctx.sim ? pcol(Pp(id)) : COL.line, ctx.sim ? 2.2 : 1.6);
          s += T(x + 7, -12, id, ctx, { size: 8, col: COL.muted });
        });
        spec.bottom.forEach(([id, x, ex]) => {
          s += L(x, 40, x, 60, ctx.sim ? pcol(Pp(id)) : COL.line, ctx.sim ? 2.2 : 1.6);
          s += T(x + 7, 50, id, ctx, { size: 8, col: COL.muted });
          if (ex && ctx.conn && !ctx.conn(id)) s += exhaustTri(x, 60, 'd', ctx);
        });
        // accionamientos
        const xL = off, xR = off + nb * w;
        s += actuator(spec.L, xL, -1, c, ctx, spec.pilotL ? { x: -w - 30, id: spec.pilotL } : null);
        s += actuator(spec.R, xR, 1, c, ctx, spec.pilotR ? { x: 2 * w + 30, id: spec.pilotR } : null);
        // nombre
        const lbl = (c.props && c.props.label) || '';
        if (lbl) s += T(w / 2, -34 + (spec.top.length ? 0 : 0), lbl, ctx, { size: 11, weight: 700, col: COL.accent });
        return s;
      },
    };
    DEF[type] = def;
  }

  function actuator(kind, xE, d, c, ctx, pilot) {
    const st = ctx.st || {};
    let s = '';
    const pressed = ctx.sim && (st.manual || st.lever);
    const col = pressed ? COL.accent : COL.line;
    switch (kind) {
      case 'button': {
        const xs = xE + d * 10;
        s += L(xE, 20, xs, 20, col);
        s += P(`M${xs} 11 A 9 9 0 0 ${d < 0 ? 0 : 1} ${xs} 29 Z`, pressed ? '#dbeafe' : '#fff', col);
        break;
      }
      case 'lever': {
        s += L(xE, 20, xE + d * 8, 20, col);
        s += L(xE + d * 8, 30, xE + d * 22, 4, col, 2);
        s += Ci(xE + d * 22, 4, 2.5, col, col, 1);
        break;
      }
      case 'roller': {
        s += L(xE, 20, xE + d * 12, 20, col);
        s += Ci(xE + d * 19, 20, 7, pressed ? '#dbeafe' : '#fff', col);
        s += Ci(xE + d * 19, 20, 1.5, col, col, 1);
        const sen = (c.props && c.props.sensor) || '';
        if (sen) s += T(xE + d * 19, -3, sen, ctx, { size: 11, weight: 700, col: COL.red });
        break;
      }
      case 'pilot':
      case 'timer': {
        const xo = xE + d * 14;
        const pp = pilot && ctx.P ? ctx.P(pilot.id) : null;
        const pc = ctx.sim ? pcol(pp) : COL.line;
        s += Rc(Math.min(xE, xo), 12, 14, 16, '#fff');
        s += P(`M${xE + d * 11} 15 L${xE + d * 11} 25 L${xE + d * 3} 20 Z`, 'none', COL.line, 1.3);
        if (pilot) {
          s += L(pilot.x, 20, xo, 20, pc, ctx.sim ? 2 : 1.4, 'stroke-dasharray="5 3"');
          s += T(pilot.x + (d < 0 ? 8 : -8), 11, pilot.id, ctx, { size: 8, col: COL.muted });
        }
        if (kind === 'timer') {
          const t = +(c.props && c.props.t) || 0;
          s += T(xE + d * 7 - 6, -6, `⏱ ${t} s`, ctx, { size: 11, weight: 700, col: '#7c3aed' });
          if (ctx.sim && t > 0) {
            const f = Math.min(1, (st.tacc || 0) / t);
            s += Rc(xE - 30, 44, 40, 5, '#ede9fe', '#7c3aed', 1);
            s += `<rect x="${xE - 30}" y="44" width="${r2(40 * f)}" height="5" fill="#7c3aed"/>`;
          }
        }
        break;
      }
      case 'spring': {
        let pts = [];
        const n = 6;
        for (let i = 0; i <= n; i++) {
          const x = xE + d * (i * 26) / n;
          const y = i === 0 || i === n ? 20 : i % 2 ? 11 : 29;
          pts.push(`${r2(x)},${y}`);
        }
        s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${COL.line}" stroke-width="1.4" stroke-linejoin="round"/>`;
        break;
      }
      case 'detent': {
        s += L(xE, 20, xE + d * 8, 20);
        s += P(`M${xE + d * 8} 12 L${xE + d * 15} 20 L${xE + d * 8} 28`);
        break;
      }
    }
    return s;
  }

  const B32 = { top: [['2', 20]], bottom: [['1', 20], ['3', 40, true]] };
  const NC = [{ p: [['1', '2']], b: ['3'] }, { p: [['2', '3']], b: ['1'] }];
  const NA = [{ p: [['2', '3']], b: ['1'] }, { p: [['1', '2']], b: ['3'] }];
  const B52 = { top: [['4', 20], ['2', 40]], bottom: [['5', 10, true], ['1', 30], ['3', 50, true]] };
  const V52 = [{ p: [['1', '4'], ['2', '3']] }, { p: [['1', '2'], ['4', '5']] }];

  valveDef('v32nc_btn', Object.assign({}, B32, {
    name: 'Válvula 3/2 NC, pulsador', short: '3/2 NC pulsador',
    desc: 'Válvula de 3 vías y 2 posiciones normalmente cerrada. En reposo el muelle la mantiene cerrada (la salida 2 está conectada al escape 3). Al pulsar, el aire pasa de 1 a 2. Se usa para dar señales de marcha o para mandar un cilindro de simple efecto.',
    boxes: NC, L: 'button', R: 'spring', kind: 'mono', rest: 1, manual: 'momentary',
  }));
  valveDef('v32na_btn', Object.assign({}, B32, {
    name: 'Válvula 3/2 NA, pulsador', short: '3/2 NA pulsador',
    desc: 'Válvula 3/2 normalmente abierta: en reposo deja pasar el aire de 1 a 2. Al pulsarla corta la alimentación y pone la salida 2 a escape (3). Útil como pulsador de paro.',
    boxes: NA, L: 'button', R: 'spring', kind: 'mono', rest: 1, manual: 'momentary',
  }));
  valveDef('v32nc_lever', Object.assign({}, B32, {
    name: 'Válvula 3/2 NC, palanca con enclavamiento', short: '3/2 palanca',
    desc: 'Válvula 3/2 NC accionada por palanca con enclavamiento: se queda en la posición en la que la dejes (como un interruptor). Haz clic para cambiarla.',
    boxes: NC, L: 'lever', R: 'detent', kind: 'toggle', rest: 1, manual: 'toggle',
  }));
  valveDef('v32nc_roller', Object.assign({}, B32, {
    name: 'Válvula 3/2 NC, rodillo (final de carrera)', short: '3/2 rodillo',
    desc: 'Final de carrera neumático. Se acciona cuando el vástago del cilindro llega a la posición indicada: a0 = cilindro A recogido, a1 = cilindro A fuera. Indica la posición en la propiedad «Detector». También puedes accionarla haciendo clic.',
    boxes: NC, L: 'roller', R: 'spring', kind: 'mono', rest: 1, manual: 'momentary',
    defaults: { sensor: 'a1' },
    props: [{ k: 'sensor', t: 'sensor', l: 'Detector (posición que la acciona)' }],
  }));
  valveDef('v32nc_pilot', Object.assign({}, B32, {
    name: 'Válvula 3/2 NC, pilotada neumáticamente', short: '3/2 pilotada',
    desc: 'Válvula 3/2 NC que se acciona con una señal de aire en la entrada de pilotaje 12. Cuando la señal desaparece, el muelle la devuelve al reposo (monoestable).',
    pilotL: '12', boxes: NC, L: 'pilot', R: 'spring', kind: 'mono', rest: 1,
  }));
  valveDef('timer', Object.assign({}, B32, {
    name: 'Temporizador neumático 3/2 NC', short: 'Temporizador',
    desc: 'Temporizador a la conexión: cuando llega aire a la entrada 12 se va llenando un pequeño depósito a través de un estrangulador. Pasado el tiempo t, la válvula conmuta y deja pasar el aire de 1 a 2. Si la señal 12 desaparece, se reinicia.',
    pilotL: '12', boxes: NC, L: 'timer', R: 'spring', kind: 'mono', rest: 1,
    defaults: { t: 3 },
    props: [{ k: 't', t: 'num', l: 'Tiempo de retardo (s)', min: 0, max: 60, step: 0.5, live: true }],
  }));
  valveDef('v52_btn', Object.assign({}, B52, {
    name: 'Válvula 5/2, pulsador y muelle', short: '5/2 pulsador',
    desc: 'Válvula de 5 vías y 2 posiciones monoestable. En reposo: 1→2 y 4→5. Pulsada: 1→4 y 2→3. Manda directamente un cilindro de doble efecto (sale mientras se mantiene pulsada).',
    boxes: V52, L: 'button', R: 'spring', kind: 'mono', rest: 1, manual: 'momentary',
  }));
  valveDef('v52_lever', Object.assign({}, B52, {
    name: 'Válvula 5/2, palanca con enclavamiento', short: '5/2 palanca',
    desc: 'Válvula 5/2 biestable accionada por palanca: se queda en la última posición. Haz clic para cambiar de posición. Útil para el mando directo de un cilindro de doble efecto.',
    boxes: V52, L: 'lever', R: 'detent', kind: 'toggle', rest: 1, manual: 'toggle',
  }));
  valveDef('v52_pilot_mono', Object.assign({}, B52, {
    name: 'Válvula 5/2 pilotada, retorno por muelle', short: '5/2 pilotada monoest.',
    desc: 'Válvula 5/2 monoestable: con aire en el pilotaje 14 conmuta (1→4); al quitar la señal, el muelle la devuelve a reposo (1→2).',
    pilotL: '14', boxes: V52, L: 'pilot', R: 'spring', kind: 'mono', rest: 1,
  }));
  valveDef('v52_pilot_bi', Object.assign({}, B52, {
    name: 'Válvula 5/2 biestable (doble pilotaje)', short: '5/2 biestable',
    desc: 'Válvula 5/2 biestable o «memoria»: una señal en 14 la lleva a 1→4 (el cilindro sale) y una señal en 12 la lleva a 1→2 (el cilindro entra). Si no llega ninguna señal, mantiene su posición. Es la válvula típica del mando indirecto y de los circuitos automáticos.',
    pilotL: '14', pilotR: '12', boxes: V52, L: 'pilot', R: 'pilot', kind: 'bi', rest: 1,
  }));

  // =====================================================================
  //  ALIMENTACIÓN
  // =====================================================================
  DEF.source = {
    name: 'Fuente de aire comprimido', short: 'Fuente de aire', cat: 'ali',
    desc: 'Toma de aire comprimido procedente del compresor. Mantiene la presión indicada (normalmente 6 bar). Puedes conectar varios tubos al mismo punto para alimentar varias válvulas.',
    defaults: { p: 6, label: '' },
    props: [{ k: 'p', t: 'num', l: 'Presión (bar)', min: 1, max: 10, step: 0.5, live: true }],
    bbox: { x: -22, y: -34, w: 76, h: 56 },
    ports: () => [{ id: '1', x: 0, y: -30, dir: 'u' }],
    fixed: (c) => +c.props.p || 0,
    draw(c, ctx) {
      const col = ctx.sim ? pcol(+c.props.p) : COL.line;
      let s = L(0, -30, 0, -15, col, ctx.sim ? 2.2 : 1.6);
      s += Ci(0, 0, 15, '#fff');
      s += P('M0 -9 L8 5 L-8 5 Z', COL.line, COL.line, 1);
      s += T(22, 0, `${c.props.p} bar`, ctx, { anchor: 'start', size: 10, col: COL.muted });
      return s;
    },
  };

  DEF.frl = {
    name: 'Unidad de mantenimiento', short: 'Unidad manten.', cat: 'ali',
    desc: 'Filtro + regulador de presión + manómetro (+ lubricador). Limpia y prepara el aire antes de llegar al circuito. En la simulación deja pasar el aire de 1 a 2.',
    defaults: { label: '' }, props: [],
    bbox: { x: -44, y: -30, w: 88, h: 52 },
    ports: () => [{ id: '1', x: -40, y: 0, dir: 'l' }, { id: '2', x: 40, y: 0, dir: 'r' }],
    paths: () => [['1', '2', NS.G * 2, 0]],
    draw(c, ctx) {
      const Pp = ctx.P || (() => null);
      let s = L(-40, 0, -20, 0, ctx.sim ? pcol(Pp('1')) : COL.line) + L(20, 0, 40, 0, ctx.sim ? pcol(Pp('2')) : COL.line);
      s += Rc(-20, -14, 40, 28, '#fff', COL.line, 1.2, 'stroke-dasharray="4 2"');
      s += P('M-14 0 L-8 -8 L-2 0 L-8 8 Z', '#fff');
      s += L(-8, -6, -8, 6, COL.line, 1, 'stroke-dasharray="2 1.5"');
      s += Ci(9, -3, 6, '#fff', COL.line, 1.2) + L(9, -3, 12, -6, COL.line, 1.2);
      s += L(-2, 0, 20, 0, COL.line, 1);
      s += T(0, -22, 'FR', ctx, { size: 9, col: COL.muted });
      return s;
    },
  };

  // =====================================================================
  //  ACTUADORES
  // =====================================================================
  function drawCyl(c, ctx, de) {
    const st = ctx.st || {};
    const x = st.x || 0;
    const Pp = ctx.P || (() => null);
    const xp = 20 + x * 110; // pistón
    let s = '';
    // cámaras (presión)
    if (ctx.sim) {
      s += `<rect x="1" y="1" width="${r2(xp - 1)}" height="38" fill="${NS.pfill(Pp('A'))}"/>`;
      if (de) s += `<rect x="${r2(xp + 8)}" y="1" width="${r2(159 - xp - 8)}" height="38" fill="${NS.pfill(Pp('B'))}"/>`;
    }
    s += Rc(0, 0, 160, 40, 'none', COL.line, 1.8);
    // vástago
    const rodEnd = xp + 158;
    s += Rc(xp + 8, 16, rodEnd - xp - 8, 8, '#e2e8f0', COL.line, 1.4);
    s += Rc(rodEnd, 12, 4, 16, COL.line, COL.line, 1);
    s += Rc(xp, 3, 8, 34, '#94a3b8', COL.line, 1.4);
    if (!de) {
      // muelle de retorno
      const x0 = xp + 10, x1 = 156, n = 8;
      let pts = [];
      for (let i = 0; i <= n; i++) pts.push(`${r2(x0 + ((x1 - x0) * i) / n)},${i % 2 ? 5 : 35}`);
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${COL.line}" stroke-width="1.1"/>`;
      // respiradero
      s += L(150, 0, 150, -8, COL.line, 1.2) + L(146, -8, 154, -8, COL.line, 1.2);
    }
    // conexiones
    s += L(10, 40, 10, 60, ctx.sim ? pcol(Pp('A')) : COL.line, ctx.sim ? 2.2 : 1.6);
    if (de) s += L(150, 40, 150, 60, ctx.sim ? pcol(Pp('B')) : COL.line, ctx.sim ? 2.2 : 1.6);
    // marcas de finales de carrera
    const lt = ((c.props && c.props.label) || 'A').toLowerCase();
    s += L(178, 30, 178, 44, COL.red, 1.4) + T(178, 52, lt + '0', ctx, { size: 10, weight: 700, col: COL.red });
    s += L(288, 30, 288, 44, COL.red, 1.4) + T(288, 52, lt + '1', ctx, { size: 10, weight: 700, col: COL.red });
    s += T(80, -13, (c.props && c.props.label) || '', ctx, { size: 14, weight: 800, col: COL.accent });
    return s;
  }
  function cylUpdate(c, sim, dt, de) {
    const st = c.st;
    const pa = sim.p(c, 'A');
    const pb = de ? sim.p(c, 'B') : 0;
    const F = pa * 1.0 - pb * 0.78 - (de ? 0 : 2.0 + 1.2 * st.x) - (+c.props.load || 0) * 0.05;
    const fr = 0.25, K = 1.6;
    let v = 0;
    if (Math.abs(F) > fr) v = (F - Math.sign(F) * fr) / K;
    st.x += v * dt;
    if (st.x < 0) { st.x = 0; if (v < 0) v = 0; }
    if (st.x > 1) { st.x = 1; if (v > 0) v = 0; }
    st.v = v;
  }
  const cylProps = [
    { k: 'label', t: 'letter', l: 'Letra del cilindro' },
    { k: 'load', t: 'num', l: 'Carga (%)', min: 0, max: 100, step: 5, live: true },
  ];
  DEF.cyl_se = {
    name: 'Cilindro de simple efecto', short: 'Cil. simple efecto', cat: 'act',
    desc: 'Cilindro de simple efecto con retorno por muelle. El aire que entra por A empuja el émbolo y el vástago sale. Al quitar el aire (A a escape) el muelle lo hace volver. Solo realiza trabajo en un sentido.',
    defaults: { label: 'A', load: 0 }, props: cylProps,
    bbox: { x: -4, y: -26, w: 300, h: 88 },
    ports: () => [{ id: 'A', x: 10, y: 60, dir: 'd' }],
    init(c) { c.st = { x: 0, v: 0 }; },
    vol: (c, pid) => 0.1 + c.st.x * 1.0,
    update(c, sim, dt) { cylUpdate(c, sim, dt, false); },
    stateText: (c) => stateCyl(c),
    draw: (c, ctx) => drawCyl(c, ctx, false),
  };
  DEF.cyl_de = {
    name: 'Cilindro de doble efecto', short: 'Cil. doble efecto', cat: 'act',
    desc: 'Cilindro de doble efecto: con aire en A el vástago sale (carrera de avance) y con aire en B entra (carrera de retroceso). Mientras una cámara recibe aire, la otra debe estar a escape. La fuerza de retroceso es menor porque el vástago reduce la superficie útil.',
    defaults: { label: 'A', load: 0 }, props: cylProps,
    bbox: { x: -4, y: -26, w: 300, h: 88 },
    ports: () => [{ id: 'A', x: 10, y: 60, dir: 'd' }, { id: 'B', x: 150, y: 60, dir: 'd' }],
    init(c) { c.st = { x: 0, v: 0 }; },
    vol: (c, pid) => (pid === 'A' ? 0.1 + c.st.x * 1.0 : 0.1 + (1 - c.st.x) * 0.78),
    update(c, sim, dt) { cylUpdate(c, sim, dt, true); },
    stateText: (c) => stateCyl(c),
    draw: (c, ctx) => drawCyl(c, ctx, true),
  };
  function stateCyl(c) {
    const x = c.st.x, v = c.st.v;
    const pos = x <= 0.005 ? 'recogido' : x >= 0.995 ? 'fuera (extendido)' : `${Math.round(x * 100)} % de la carrera`;
    const mov = v > 0.01 ? ' · saliendo ➜' : v < -0.01 ? ' · entrando ⟵' : '';
    return 'Vástago ' + pos + mov;
  }

  // =====================================================================
  //  VÁLVULAS DE BLOQUEO Y DE CAUDAL
  // =====================================================================
  DEF.or = {
    name: 'Válvula selectora (función O)', short: 'Selectora (O)', cat: 'blq',
    desc: 'Válvula selectora o de doble efecto: hay salida de aire en 2 si llega aire por una entrada 1 O por la otra (o por las dos). Una bola interior tapa la entrada que no tiene presión. Realiza la función lógica O (OR).',
    defaults: { label: '' }, props: [],
    bbox: { x: -34, y: -34, w: 68, h: 50 },
    ports: () => [{ id: '1a', x: -30, y: 0, dir: 'l', name: '1' }, { id: '1b', x: 30, y: 0, dir: 'r', name: '1' }, { id: '2', x: 0, y: -30, dir: 'u' }],
    paths(c, sim) { return sim.p(c, '1a') >= sim.p(c, '1b') ? [['1a', '2', NS.G, 0]] : [['1b', '2', NS.G, 0]]; },
    draw(c, ctx) {
      const Pp = ctx.P || (() => null);
      const pa = Pp('1a') || 0, pb = Pp('1b') || 0;
      const bx = !ctx.sim ? 0 : pa > pb + 0.05 ? 9 : pb > pa + 0.05 ? -9 : 0;
      const cc = (id) => (ctx.sim ? pcol(Pp(id)) : COL.line);
      let s = L(-30, 0, -20, 0, cc('1a')) + L(20, 0, 30, 0, cc('1b')) + L(0, -30, 0, -10, cc('2'));
      s += Rc(-20, -10, 40, 20, '#fff');
      s += P('M-16 -7 L-12 0 L-16 7') + P('M16 -7 L12 0 L16 7');
      s += Ci(bx, 0, 6, ctx.sim ? '#1e293b' : '#fff');
      s += T(-26, 9, '1', ctx, { size: 8, col: COL.muted }) + T(26, 9, '1', ctx, { size: 8, col: COL.muted }) + T(7, -22, '2', ctx, { size: 8, col: COL.muted });
      s += T(0, 20, 'O', ctx, { size: 9, weight: 700, col: '#0f766e' });
      return s;
    },
  };
  DEF.and = {
    name: 'Válvula de simultaneidad (función Y)', short: 'Simultaneidad (Y)', cat: 'blq',
    desc: 'Válvula de simultaneidad: solo hay salida de aire en 2 cuando llega aire por las DOS entradas a la vez. Realiza la función lógica Y (AND). Se usa, por ejemplo, en el mando bimanual de seguridad.',
    defaults: { label: '' }, props: [],
    bbox: { x: -34, y: -34, w: 68, h: 50 },
    ports: () => [{ id: '1a', x: -30, y: 0, dir: 'l', name: '1' }, { id: '1b', x: 30, y: 0, dir: 'r', name: '1' }, { id: '2', x: 0, y: -30, dir: 'u' }],
    paths(c, sim) { return sim.p(c, '1a') <= sim.p(c, '1b') ? [['1a', '2', NS.G, 0]] : [['1b', '2', NS.G, 0]]; },
    draw(c, ctx) {
      const Pp = ctx.P || (() => null);
      const cc = (id) => (ctx.sim ? pcol(Pp(id)) : COL.line);
      let s = L(-30, 0, -20, 0, cc('1a')) + L(20, 0, 30, 0, cc('1b')) + L(0, -30, 0, -10, cc('2'));
      s += Rc(-20, -10, 40, 20, '#fff');
      s += Rc(-9, -6, 18, 12, '#fff', COL.line, 1.2);
      s += L(-20, 0, -9, 0, COL.line, 1.2) + L(9, 0, 20, 0, COL.line, 1.2);
      s += P('M-16 -6 L-12 0 L-16 6', 'none', COL.line, 1.2) + P('M16 -6 L12 0 L16 6', 'none', COL.line, 1.2);
      s += T(-26, 9, '1', ctx, { size: 8, col: COL.muted }) + T(26, 9, '1', ctx, { size: 8, col: COL.muted }) + T(7, -22, '2', ctx, { size: 8, col: COL.muted });
      s += T(0, 20, 'Y', ctx, { size: 9, weight: 700, col: '#0f766e' });
      return s;
    },
  };
  DEF.check = {
    name: 'Válvula antirretorno', short: 'Antirretorno', cat: 'blq',
    desc: 'Deja pasar el aire en un solo sentido (de 1 a 2, según la flecha) y lo bloquea en el sentido contrario.',
    defaults: { label: '' }, props: [],
    bbox: { x: -34, y: -24, w: 68, h: 40 },
    ports: () => [{ id: '1', x: -30, y: 0, dir: 'l' }, { id: '2', x: 30, y: 0, dir: 'r' }],
    paths: () => [['1', '2', NS.G, 1]],
    draw(c, ctx) {
      const Pp = ctx.P || (() => null);
      const cc = (id) => (ctx.sim ? pcol(Pp(id)) : COL.line);
      let s = L(-30, 0, -10, 0, cc('1')) + L(8, 0, 30, 0, cc('2'));
      s += P('M0 -9 L-10 0 L0 9') + Ci(2, 0, 6, '#fff');
      s += arrow(-10, -16, 10, -16, COL.muted, 1);
      return s;
    },
  };
  function throttleG(c) {
    const a = Math.max(0, Math.min(100, +c.props.open || 0)) / 100;
    return NS.G * Math.pow(a, 1.6);
  }
  const openProp = { k: 'open', t: 'range', l: 'Apertura del estrangulador (%)', min: 0, max: 100, step: 5, live: true };
  DEF.throttle = {
    name: 'Estrangulador regulable', short: 'Estrangulador', cat: 'blq',
    desc: 'Válvula reguladora de caudal bidireccional: estrecha el paso del aire en ambos sentidos. Cuanto menor sea la apertura, más despacio se llenan o vacían los cilindros.',
    defaults: { open: 40, label: '' }, props: [openProp],
    bbox: { x: -34, y: -26, w: 68, h: 44 },
    ports: () => [{ id: '1', x: -30, y: 0, dir: 'l' }, { id: '2', x: 30, y: 0, dir: 'r' }],
    paths: (c) => [['1', '2', throttleG(c), 0]],
    draw(c, ctx) {
      const Pp = ctx.P || (() => null);
      const cc = (id) => (ctx.sim ? pcol(Pp(id)) : COL.line);
      let s = L(-30, 0, -8, 0, cc('1')) + L(8, 0, 30, 0, cc('2'));
      s += P('M-10 -8 Q0 -1 10 -8') + P('M-10 8 Q0 1 10 8');
      s += arrow(-10, 12, 11, -13, COL.line, 1.2);
      s += T(0, 17, `${c.props.open}%`, ctx, { size: 8, col: COL.muted });
      return s;
    },
  };
  DEF.flowreg = {
    name: 'Regulador de caudal unidireccional', short: 'Regulador unidirec.', cat: 'blq',
    desc: 'Estrangulador + antirretorno en paralelo. El aire pasa libremente de 1 a 2 (por el antirretorno) y de 2 a 1 pasa estrangulado. Se coloca normalmente en el escape del cilindro para regular su velocidad (regulación «a la salida»).',
    defaults: { open: 30, label: '' }, props: [openProp],
    bbox: { x: -34, y: -34, w: 68, h: 56 },
    ports: () => [{ id: '1', x: -30, y: 0, dir: 'l' }, { id: '2', x: 30, y: 0, dir: 'r' }],
    paths: (c) => [['1', '2', NS.G, 1], ['1', '2', throttleG(c), 0]],
    draw(c, ctx) {
      const Pp = ctx.P || (() => null);
      const cc = (id) => (ctx.sim ? pcol(Pp(id)) : COL.line);
      let s = L(-30, 0, -18, 0, cc('1')) + L(18, 0, 30, 0, cc('2'));
      s += Rc(-22, -28, 44, 42, 'none', COL.muted, 1, 'stroke-dasharray="3 2"');
      s += L(-18, 0, -8, 0) + L(8, 0, 18, 0);
      s += P('M-8 -6 Q0 -1 8 -6') + P('M-8 6 Q0 1 8 6');
      s += arrow(-8, 9, 9, -10, COL.line, 1.1);
      s += L(-18, 0, -18, -18) + L(18, 0, 18, -18) + L(-18, -18, -6, -18) + L(6, -18, 18, -18);
      s += P('M3 -24 L-5 -18 L3 -12', 'none', COL.line, 1.3) + Ci(4, -18, 4, '#fff', COL.line, 1.3);
      s += T(0, 20, `${c.props.open}%`, ctx, { size: 8, col: COL.muted });
      s += T(-26, 9, '1', ctx, { size: 8, col: COL.muted }) + T(26, 9, '2', ctx, { size: 8, col: COL.muted });
      return s;
    },
  };

  // =====================================================================
  //  MEDIDA
  // =====================================================================
  DEF.gauge = {
    name: 'Manómetro', short: 'Manómetro', cat: 'med',
    desc: 'Mide la presión del aire en el punto donde se conecta (en bar, presión relativa a la atmosférica).',
    defaults: { label: '' }, props: [],
    bbox: { x: -20, y: -20, w: 80, h: 54 },
    ports: () => [{ id: '1', x: 0, y: 30, dir: 'd' }],
    draw(c, ctx) {
      const p = ctx.sim && ctx.P ? ctx.P('1') || 0 : 0;
      let s = L(0, 30, 0, 15, ctx.sim ? pcol(p) : COL.line, ctx.sim ? 2.2 : 1.6);
      s += Ci(0, 0, 15, '#fff');
      const a = (-135 + Math.max(0, Math.min(10, p)) * 27) * (Math.PI / 180);
      s += arrow(0, 0, 11 * Math.sin(a), -11 * Math.cos(a), ctx.sim ? COL.red : COL.line, 1.4);
      if (ctx.sim) s += T(20, 0, p.toFixed(1) + ' bar', ctx, { anchor: 'start', size: 11, weight: 700, col: '#0d3c8c' });
      return s;
    },
  };

  NS.CATS = [
    { id: 'ali', name: 'Alimentación', items: ['source', 'frl'] },
    { id: 'act', name: 'Actuadores', items: ['cyl_se', 'cyl_de'] },
    { id: 'valv', name: 'Válvulas distribuidoras', items: ['v32nc_btn', 'v32na_btn', 'v32nc_lever', 'v32nc_roller', 'v32nc_pilot', 'timer', 'v52_btn', 'v52_lever', 'v52_pilot_mono', 'v52_pilot_bi'] },
    { id: 'blq', name: 'Válvulas de bloqueo y caudal', items: ['or', 'and', 'check', 'throttle', 'flowreg'] },
    { id: 'med', name: 'Medida', items: ['gauge'] },
  ];
})();
