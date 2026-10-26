/* NeumaSim — Motor de simulación
 * Modelo: cada grupo de conexiones unidas por tubos forma una «red» con un volumen y
 * una masa de aire (p·V). Las válvulas abiertas son conductancias entre redes; los
 * escapes libres ventilan a la atmósfera. Los cilindros cambian el volumen de sus
 * cámaras al moverse, así que la regulación de caudal influye en la velocidad.
 */
(function () {
  'use strict';
  const NS = window.NS;
  const DEF = NS.DEF;
  const PORTV = 0.006, TUBEV = 0.02, DT = 0.0005, PATM = 1;

  class Sim {
    constructor(circ) {
      this.circ = circ;
      this.t = 0;
      this.hist = [];
      this.lastRec = -1;
      const parent = {};
      const find = (k) => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
      const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
      this.connCount = {};
      const portInfo = {};
      for (const c of circ.comps) {
        const def = DEF[c.type];
        if (def.init) def.init(c); else c.st = {};
        for (const p of def.ports(c)) {
          const k = c.id + ':' + p.id;
          parent[k] = k;
          portInfo[k] = { c, p };
          this.connCount[k] = 0;
        }
      }
      for (const t of circ.tubes) {
        const ka = t.a.c + ':' + t.a.p, kb = t.b.c + ':' + t.b.p;
        if (!(ka in parent) || !(kb in parent)) continue;
        union(ka, kb);
        this.connCount[ka]++; this.connCount[kb]++;
      }
      const idx = {};
      this.nets = [];
      this.netOf = {};
      for (const k in parent) {
        const r = find(k);
        if (!(r in idx)) { idx[r] = this.nets.length; this.nets.push({ base: 0, V: 1, m: 1, p: PATM, fixed: null, ports: [] }); }
        const n = idx[r];
        this.netOf[k] = n;
        this.nets[n].ports.push(k);
        this.nets[n].base += PORTV;
      }
      for (const t of circ.tubes) {
        const n = this.netOf[t.a.c + ':' + t.a.p];
        if (n != null) this.nets[n].base += TUBEV;
      }
      // puertos con volumen variable (cámaras de cilindros), fuentes y escapes
      this.volPorts = [];
      this.fixedPorts = [];
      this.vents = [];
      for (const k in portInfo) {
        const { c, p } = portInfo[k];
        const def = DEF[c.type];
        if (def.vol) this.volPorts.push({ c, pid: p.id, n: this.netOf[k], def });
        if (def.fixed) this.fixedPorts.push({ c, n: this.netOf[k], def });
        if (p.ex && this.connCount[k] === 0) this.vents.push(this.netOf[k]);
      }
      this.cyl = {};
      for (const c of circ.comps) {
        if ((c.type === 'cyl_se' || c.type === 'cyl_de') && c.props.label) this.cyl[c.props.label.toLowerCase()] = c;
      }
      this.computeVolumes();
      for (const n of this.nets) { n.p = PATM; n.m = n.V * PATM; }
      this.applyFixed();
      this.record(true);
    }
    computeVolumes() {
      for (const n of this.nets) n.V = n.base;
      for (const v of this.volPorts) this.nets[v.n].V += v.def.vol(v.c, v.pid);
    }
    applyFixed() {
      for (const n of this.nets) n.fixed = null;
      for (const f of this.fixedPorts) {
        const pf = PATM + f.def.fixed(f.c);
        const n = this.nets[f.n];
        n.fixed = n.fixed == null ? pf : Math.max(n.fixed, pf);
      }
      for (const n of this.nets) {
        if (n.fixed != null) { n.p = n.fixed; n.m = n.p * n.V; } else n.p = n.m / n.V;
      }
    }
    // presión manométrica (bar) en un puerto de un componente
    p(c, pid) {
      const n = this.netOf[c.id + ':' + pid];
      return n == null ? 0 : this.nets[n].p - PATM;
    }
    pKey(k) {
      const n = this.netOf[k];
      return n == null ? 0 : this.nets[n].p - PATM;
    }
    connected(c, pid) { return (this.connCount[c.id + ':' + pid] || 0) > 0; }
    sensor(name) {
      if (!name) return false;
      const m = /^([a-zA-Z])\s*([01])$/.exec(String(name).trim());
      if (!m) return false;
      const c = this.cyl[m[1].toLowerCase()];
      if (!c) return false;
      return m[2] === '0' ? c.st.x <= 0.003 : c.st.x >= 0.997;
    }
    step(dt) {
      const nets = this.nets;
      this.computeVolumes();
      this.applyFixed();
      const dm = new Float64Array(nets.length);
      for (const c of this.circ.comps) {
        const def = DEF[c.type];
        if (!def.paths) continue;
        for (const [a, b, g, dir] of def.paths(c, this)) {
          if (g <= 0) continue;
          const na = this.netOf[c.id + ':' + a], nb = this.netOf[c.id + ':' + b];
          if (na == null || nb == null || na === nb) continue;
          const d = nets[na].p - nets[nb].p;
          if (dir && d < 0) continue;
          const q = g * d * dt;
          dm[na] -= q; dm[nb] += q;
        }
      }
      for (const n of this.vents) dm[n] -= 2 * NS.G * (nets[n].p - PATM) * dt;
      for (let i = 0; i < nets.length; i++) {
        const n = nets[i];
        if (n.fixed != null) continue;
        n.m = Math.max(n.V * 0.05, n.m + dm[i]);
        n.p = n.m / n.V;
      }
      for (const c of this.circ.comps) {
        const def = DEF[c.type];
        if (def.update) def.update(c, this, dt);
      }
      this.t += dt;
    }
    run(dt) {
      const n = Math.max(1, Math.ceil(dt / DT));
      const h = dt / n;
      for (let i = 0; i < n; i++) this.step(h);
      this.record();
    }
    record(force) {
      if (!force && this.t - this.lastRec < 0.03) return;
      this.lastRec = this.t;
      const xs = {};
      for (const k in this.cyl) xs[k] = this.cyl[k].st.x;
      this.hist.push({ t: this.t, xs });
      if (this.hist.length > 4000) this.hist.splice(0, this.hist.length - 4000);
    }
  }
  NS.Sim = Sim;
})();
