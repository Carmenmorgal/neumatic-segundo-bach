/* NeumaSim — Circuitos de ejemplo */
(function () {
  'use strict';
  const NS = window.NS;

  function B() {
    const comps = [], tubes = [];
    let n = 1;
    return {
      add(type, x, y, props = {}, rot = 0) {
        const c = { id: 'c' + n++, type, x, y, rot, props: Object.assign({}, NS.DEF[type].defaults, props) };
        comps.push(c);
        return c.id;
      },
      t(a, pa, b, pb, pts = []) { tubes.push({ id: 't' + n++, a: { c: a, p: pa }, b: { c: b, p: pb }, pts }); },
      get() { return { comps, tubes }; },
    };
  }

  const EX = [];

  EX.push({
    id: 'directo_se', level: 'Básico',
    title: '1. Mando directo de un cilindro de simple efecto',
    desc: 'Un pulsador 3/2 NC manda directamente un cilindro de simple efecto. Mantén pulsado S1: el vástago sale. Al soltarlo, el muelle lo hace volver.',
    build() {
      const b = B();
      const cyl = b.add('cyl_se', 100, 60, { label: 'A' });
      const v = b.add('v32nc_btn', 90, 220, { label: 'S1' });
      const s = b.add('source', 110, 360);
      b.t(cyl, 'A', v, '2');
      b.t(v, '1', s, '1');
      return b.get();
    },
  });

  EX.push({
    id: 'directo_de', level: 'Básico',
    title: '2. Mando directo de un cilindro de doble efecto',
    desc: 'Una válvula 5/2 con palanca y enclavamiento manda un cilindro de doble efecto. Haz clic en la válvula para cambiar su posición: el cilindro sale o entra.',
    build() {
      const b = B();
      const cyl = b.add('cyl_de', 100, 60, { label: 'A' });
      const v = b.add('v52_lever', 160, 240);
      const s = b.add('source', 190, 380);
      b.t(cyl, 'A', v, '4');
      b.t(cyl, 'B', v, '2');
      b.t(v, '1', s, '1');
      return b.get();
    },
  });

  EX.push({
    id: 'indirecto', level: 'Básico',
    title: '3. Mando indirecto con válvula biestable',
    desc: 'La válvula 5/2 biestable hace de «memoria». Un pulso en S1 pilota 14 y el cilindro sale (aunque sueltes el pulsador). Un pulso en S2 pilota 12 y el cilindro vuelve.',
    build() {
      const b = B();
      const cyl = b.add('cyl_de', 140, 60, { label: 'A' });
      const v = b.add('v52_pilot_bi', 200, 240);
      const sv = b.add('source', 230, 380);
      const s1 = b.add('v32nc_btn', 30, 400, { label: 'S1 (A+)' });
      const s2 = b.add('v32nc_btn', 390, 400, { label: 'S2 (A−)' });
      const s = b.add('source', 230, 560);
      b.t(cyl, 'A', v, '4');
      b.t(cyl, 'B', v, '2');
      b.t(v, '1', sv, '1');
      b.t(s1, '2', v, '14');
      b.t(s2, '2', v, '12');
      b.t(s, '1', s1, '1');
      b.t(s, '1', s2, '1');
      return b.get();
    },
  });

  EX.push({
    id: 'funcion_o', level: 'Lógica',
    title: '4. Función O (válvula selectora)',
    desc: 'El cilindro sale si se pulsa S1 O S2. La válvula selectora evita que el aire se escape por el pulsador que no está accionado.',
    build() {
      const b = B();
      const cyl = b.add('cyl_se', 130, 40, { label: 'A' });
      const o = b.add('or', 140, 200);
      const s1 = b.add('v32nc_btn', 0, 320, { label: 'S1' });
      const s2 = b.add('v32nc_btn', 260, 320, { label: 'S2' });
      const s = b.add('source', 150, 480);
      b.t(cyl, 'A', o, '2', [{ x: 140, y: 140 }]);
      b.t(s1, '2', o, '1a');
      b.t(s2, '2', o, '1b');
      b.t(s, '1', s1, '1');
      b.t(s, '1', s2, '1');
      return b.get();
    },
  });

  EX.push({
    id: 'funcion_y', level: 'Lógica',
    title: '5. Función Y: mando bimanual de seguridad',
    desc: 'El cilindro solo sale si se pulsan S1 Y S2 a la vez (así el operario tiene las dos manos ocupadas y fuera de peligro). Prueba a pulsar uno solo.',
    build() {
      const b = B();
      const cyl = b.add('cyl_se', 130, 40, { label: 'A' });
      const y = b.add('and', 140, 200);
      const s1 = b.add('v32nc_btn', 0, 320, { label: 'S1' });
      const s2 = b.add('v32nc_btn', 260, 320, { label: 'S2' });
      const s = b.add('source', 150, 480);
      b.t(cyl, 'A', y, '2', [{ x: 140, y: 140 }]);
      b.t(s1, '2', y, '1a');
      b.t(s2, '2', y, '1b');
      b.t(s, '1', s1, '1');
      b.t(s, '1', s2, '1');
      return b.get();
    },
  });

  EX.push({
    id: 'velocidad', level: 'Regulación',
    title: '6. Regulación de la velocidad',
    desc: 'Dos reguladores de caudal unidireccionales frenan el aire que SALE del cilindro. Con el de B al 25 % el avance es lento; el retroceso es rápido. Selecciona un regulador y cambia su apertura mientras simulas.',
    build() {
      const b = B();
      const cyl = b.add('cyl_de', 100, 60, { label: 'A' });
      const fa = b.add('flowreg', 110, 190, { open: 100 }, 270);
      const fb = b.add('flowreg', 250, 190, { open: 25 }, 270);
      const v = b.add('v52_lever', 160, 320);
      const s = b.add('source', 190, 460);
      b.t(cyl, 'A', fa, '2');
      b.t(cyl, 'B', fb, '2');
      b.t(fa, '1', v, '4');
      b.t(fb, '1', v, '2');
      b.t(v, '1', s, '1');
      return b.get();
    },
  });

  EX.push({
    id: 'ciclo', level: 'Automatismos',
    title: '7. Ciclo automático A+ A− con finales de carrera',
    desc: 'Al pulsar Marcha, si el cilindro está recogido (a0), sale (A+). Al llegar al final (a1) vuelve solo (A−). Mantén pulsado Marcha y el ciclo se repite continuamente.',
    build() {
      const b = B();
      const cyl = b.add('cyl_de', 200, 60, { label: 'A' });
      const v = b.add('v52_pilot_bi', 260, 240);
      const sv = b.add('source', 290, 380);
      const y = b.add('and', 60, 330);
      const m = b.add('v32nc_btn', -80, 460, { label: 'Marcha' });
      const a0 = b.add('v32nc_roller', 110, 460, { sensor: 'a0' });
      const a1 = b.add('v32nc_roller', 460, 460, { sensor: 'a1' });
      const s = b.add('source', 290, 620);
      b.t(cyl, 'A', v, '4');
      b.t(cyl, 'B', v, '2');
      b.t(v, '1', sv, '1');
      b.t(y, '2', v, '14');
      b.t(m, '2', y, '1a');
      b.t(a0, '2', y, '1b');
      b.t(a1, '2', v, '12');
      b.t(s, '1', m, '1');
      b.t(s, '1', a0, '1');
      b.t(s, '1', a1, '1');
      return b.get();
    },
  });

  EX.push({
    id: 'temporizador', level: 'Automatismos',
    title: '8. Retroceso temporizado',
    desc: 'Pulsa S1: el cilindro sale. Cuando llega al final (a1) empieza a contar el temporizador y, pasados 3 segundos, el cilindro vuelve. Cambia el tiempo en las propiedades del temporizador.',
    build() {
      const b = B();
      const cyl = b.add('cyl_de', 200, 60, { label: 'A' });
      const v = b.add('v52_pilot_bi', 260, 240);
      const sv = b.add('source', 290, 380);
      const s1 = b.add('v32nc_btn', 60, 440, { label: 'S1' });
      const tm = b.add('timer', 560, 440, { t: 3 });
      const a1 = b.add('v32nc_roller', 360, 560, { sensor: 'a1' });
      const st = b.add('source', 580, 580);
      const s = b.add('source', 230, 700);
      b.t(cyl, 'A', v, '4');
      b.t(cyl, 'B', v, '2');
      b.t(v, '1', sv, '1');
      b.t(s1, '2', v, '14');
      b.t(tm, '2', v, '12');
      b.t(a1, '2', tm, '12');
      b.t(tm, '1', st, '1');
      b.t(s, '1', s1, '1');
      b.t(s, '1', a1, '1');
      return b.get();
    },
  });

  EX.push({
    id: 'secuencia', level: 'Automatismos',
    title: '9. Secuencia de dos cilindros A+ B+ A− B−',
    desc: 'Dos cilindros trabajan en secuencia: A sale, después B sale, luego A entra y por último B entra. Cada movimiento lo provoca el final de carrera del movimiento anterior. Observa el diagrama espacio-fase en la parte inferior.',
    build() {
      const b = B();
      const ca = b.add('cyl_de', 60, 60, { label: 'A' });
      const cb = b.add('cyl_de', 580, 60, { label: 'B' });
      const va = b.add('v52_pilot_bi', 120, 260);
      const vb = b.add('v52_pilot_bi', 640, 260);
      const sa = b.add('source', 150, 400);
      const sb = b.add('source', 670, 400);
      const y = b.add('and', -40, 360);
      const m = b.add('v32nc_btn', -220, 480, { label: 'Marcha' });
      const b0 = b.add('v32nc_roller', 20, 480, { sensor: 'b0' });
      const b1 = b.add('v32nc_roller', 260, 480, { sensor: 'b1' });
      const a1 = b.add('v32nc_roller', 460, 480, { sensor: 'a1' });
      const a0 = b.add('v32nc_roller', 860, 480, { sensor: 'a0' });
      const s = b.add('source', 380, 640);
      b.t(ca, 'A', va, '4');
      b.t(ca, 'B', va, '2');
      b.t(cb, 'A', vb, '4');
      b.t(cb, 'B', vb, '2');
      b.t(va, '1', sa, '1');
      b.t(vb, '1', sb, '1');
      b.t(y, '2', va, '14');
      b.t(m, '2', y, '1a');
      b.t(b0, '2', y, '1b');
      b.t(b1, '2', va, '12');
      b.t(a1, '2', vb, '14');
      b.t(a0, '2', vb, '12');
      for (const r of [m, b0, b1, a1, a0]) b.t(s, '1', r, '1');
      return b.get();
    },
  });

  NS.EXAMPLES = EX;
})();
