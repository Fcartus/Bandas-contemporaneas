/* banda-audio.js · el sonido de la banda (Web Audio, todo sintetizado; corre en la pantalla).
 *
 *   BandaAudio.init()                  crea el audio (debe venir de un clic o una tecla)
 *   BandaAudio.tocar(instr, zona)      suena una zona (0–3) del instrumento
 *   BandaAudio.expresion(instr, b, g)  movimiento del teléfono: b = inclinar adelante/atrás, g = a los lados (−1…1)
 *   BandaAudio.setBase(on)             base rítmica: batería suave + acordes de fondo que guían la armonía
 *   BandaAudio.estado()                { activo, base, bpm, acorde, compas, pulso }
 *
 * Sin base, las 4 zonas de guitarra, bajo y teclado tocan los 4 acordes (el músico arma la progresión).
 * Con base, las zonas tocan notas del acorde que está sonando: todo encaja (jam guiado).
 */
(function (g) {
  'use strict';
  const PROG = [ // progresión de prueba (luego vendrá de la partitura de la canción)
    { n: 'Am', r: 45, q: [0, 3, 7] },
    { n: 'F', r: 41, q: [0, 4, 7] },
    { n: 'C', r: 48, q: [0, 4, 7] },
    { n: 'G', r: 43, q: [0, 4, 7] },
  ];
  const BPM = 100, PASOS = 16; // 16 semicorcheas por compás
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const NIVEL = { guitarra: 0.42, bajo: 0.75, bateria: 0.85, teclado: 0.32 };

  const A = { ctx: null, base: false, t0: 0, paso: 0, prox: 0, bateriaHumana: false, voces: {}, bus: {}, expr: {} };

  function ruido(c, seg) { const b = c.createBuffer(1, c.sampleRate * seg, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function impulso(c, seg) { const n = c.sampleRate * seg, b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); } return b; }
  function curvaDist(k) { const n = 1024, cu = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; cu[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); } return cu; }

  function init() {
    if (A.ctx) { A.ctx.resume(); return; }
    const c = (A.ctx = new (g.AudioContext || g.webkitAudioContext)());
    A.comp = c.createDynamicsCompressor(); A.comp.threshold.value = -16; A.comp.ratio.value = 4;
    A.master = c.createGain(); A.master.gain.value = 0.85; A.master.connect(A.comp); A.comp.connect(c.destination);
    A.an = c.createAnalyser(); A.an.fftSize = 512; A.comp.connect(A.an);
    A.rev = c.createConvolver(); A.rev.buffer = impulso(c, 2.2); A.revOut = c.createGain(); A.revOut.gain.value = 0.5; A.rev.connect(A.revOut); A.revOut.connect(A.master);
    A.ruido = ruido(c, 2);
    for (const k of Object.keys(NIVEL)) { // por instrumento: entrada → [distorsión] → filtro → volumen → salida + envío a reverb
      const b = (A.bus[k] = { in: c.createGain(), filt: c.createBiquadFilter(), vol: c.createGain(), send: c.createGain() });
      b.filt.type = 'lowpass'; b.filt.frequency.value = k === 'bajo' ? 900 : 5000; b.filt.Q.value = k === 'bajo' ? 4 : 1;
      b.vol.gain.value = NIVEL[k]; b.send.gain.value = k === 'bateria' ? 0.12 : 0.25;
      if (k === 'guitarra') { b.dist = c.createWaveShaper(); b.dist.curve = curvaDist(18); b.dist.oversample = '2x'; b.in.connect(b.dist); b.dist.connect(b.filt); }
      else b.in.connect(b.filt);
      b.filt.connect(b.vol); b.vol.connect(A.master); b.vol.connect(b.send); b.send.connect(A.rev);
      A.voces[k] = []; A.expr[k] = { b: 0, g: 0 };
    }
    A.fondo = c.createGain(); A.fondo.gain.value = 0.09; A.fondo.connect(A.master); A.fondo.connect(A.rev); // acordes de la base
    setInterval(programar, 25);
  }

  // ---------- voces ----------
  function env(gn, t, ataque, pico, caida) { gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(pico, t + ataque); gn.gain.exponentialRampToValueAtTime(0.0001, t + ataque + caida); }
  function osc(k, tipo, f, t, dur, destino, det = 0) {
    const c = A.ctx, o = c.createOscillator(); o.type = tipo; o.frequency.value = f; o.detune.value = det + bend(k);
    o.connect(destino); o.start(t); o.stop(t + dur + 0.05);
    A.voces[k].push({ o, det, fin: t + dur }); return o;
  }
  const bend = k => (k === 'guitarra' || k === 'teclado' ? A.expr[k].g * 200 : 0); // inclinar a los lados dobla la nota (±2 semitonos)

  function guitarra(notas, t, corto) {
    const c = A.ctx, dur = corto ? 0.14 : 1.4;
    notas.forEach((m, i) => {
      const gn = c.createGain(); gn.connect(A.bus.guitarra.in); const ti = t + i * 0.014; // rasgueo
      env(gn, ti, 0.004, 0.32, dur);
      osc('guitarra', 'sawtooth', mtof(m), ti, dur, gn, -6); osc('guitarra', 'sawtooth', mtof(m), ti, dur, gn, 6);
    });
  }
  function bajo(m, t) {
    const c = A.ctx, gn = c.createGain(); gn.connect(A.bus.bajo.in); env(gn, t, 0.006, 0.8, 0.9);
    osc('bajo', 'square', mtof(m), t, 0.9, gn); const s = c.createGain(); s.gain.value = 0.8; s.connect(gn); osc('bajo', 'sine', mtof(m - 12), t, 0.9, s);
  }
  function teclado(notas, t, largo) {
    const c = A.ctx, dur = largo ? 1.6 : 0.6;
    for (const m of notas) {
      const gn = c.createGain(); gn.connect(A.bus.teclado.in);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.25, t + 0.012); gn.gain.setTargetAtTime(0.12, t + 0.05, 0.15); gn.gain.setTargetAtTime(0.0001, t + dur * 0.6, 0.18);
      osc('teclado', 'square', mtof(m), t, dur, gn, -8); osc('teclado', 'sawtooth', mtof(m), t, dur, gn, 8);
    }
  }
  function tambor(z, t, vol = 1) {
    const c = A.ctx, out = A.bus.bateria.in;
    if (z === 0) { // bombo
      const o = c.createOscillator(), gn = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      env(gn, t, 0.002, 1.1 * vol, 0.42); o.connect(gn); gn.connect(out); o.start(t); o.stop(t + 0.5);
      return;
    }
    const n = c.createBufferSource(); n.buffer = A.ruido; const f = c.createBiquadFilter(), gn = c.createGain();
    n.connect(f); f.connect(gn); gn.connect(out);
    if (z === 1) { // caja
      f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; env(gn, t, 0.002, 0.75 * vol, 0.2);
      const o = c.createOscillator(), go = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      env(go, t, 0.002, 0.5 * vol, 0.1); o.connect(go); go.connect(out); o.start(t); o.stop(t + 0.2);
    } else if (z === 2) { f.type = 'highpass'; f.frequency.value = 7500; env(gn, t, 0.001, 0.35 * vol, 0.05); } // hi-hat
    else { f.type = 'highpass'; f.frequency.value = 4200; env(gn, t, 0.003, 0.45 * vol, 1.7); } // platillo
    n.start(t, Math.random()); n.stop(t + 2);
  }
  function fondo(ac, t, dur) { // acorde suave de la base
    const c = A.ctx;
    for (const m of ac.q.map(x => ac.r + 24 + x)) {
      const o = c.createOscillator(), gn = c.createGain(); o.type = 'triangle'; o.frequency.value = mtof(m);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(1, t + 0.25); gn.gain.setTargetAtTime(0.0001, t + dur - 0.3, 0.12);
      o.connect(gn); gn.connect(A.fondo); o.start(t); o.stop(t + dur + 0.4);
    }
  }

  // ---------- qué suena en cada zona ----------
  const dur16 = () => 60 / BPM / 4;
  function acordeEn(t) { if (!A.base) return null; const compas = Math.floor((t - A.t0) / (dur16() * PASOS)); return { i: ((compas % 4) + 4) % 4, compas }; }
  function tocar(k, z) {
    if (!A.ctx) return;
    if (C.part && C.sonando) { C.abierto[k] = true; return; } // con canción: tocar abre tu pista (no suena el sintetizador)
    const t = A.ctx.currentTime + 0.005, a = acordeEn(t), ac = a ? PROG[a.i] : PROG[z & 3];
    if (k === 'bateria') return tambor(z, t);
    if (k === 'guitarra') {
      const pow = r => [r, r + 7, r + 12];
      if (!a) return guitarra([...pow(ac.r), ac.r + 12 + ac.q[1]], t);
      if (z === 0) guitarra(pow(ac.r), t);
      else if (z === 1) guitarra(pow(ac.r + 12), t);
      else if (z === 2) guitarra([ac.r + 24 + ac.q[1 + (Math.random() < 0.5)]], t); // nota suelta arriba
      else guitarra(pow(ac.r), t, true);                                            // apagado (palm mute)
    } else if (k === 'bajo') {
      bajo(a ? ac.r - 12 + [0, 7, 12, ac.q[1]][z] : ac.r - 12, t);
    } else if (k === 'teclado') {
      if (!a) teclado(ac.q.map(x => ac.r + 24 + x), t, true);
      else teclado([ac.r + 24 + [0, ac.q[1], ac.q[2], 12][z]], t);
    }
  }

  // ---------- movimiento del teléfono ----------
  function expresion(k, b, gm) {
    if (!A.ctx || !A.bus[k]) return;
    const e = A.expr[k]; e.b = Math.max(-1, Math.min(1, b)); e.g = Math.max(-1, Math.min(1, gm));
    const t = A.ctx.currentTime, bus = A.bus[k], u = (e.b + 1) / 2; // u: 0 (inclinado atrás) … 1 (mástil arriba)
    if (k === 'guitarra') bus.filt.frequency.setTargetAtTime(700 * Math.pow(12, u), t, 0.05);     // levantar = más brillo
    else if (k === 'bajo') bus.filt.frequency.setTargetAtTime(220 * Math.pow(10, u), t, 0.04);    // wah
    else if (k === 'teclado') bus.filt.frequency.setTargetAtTime(500 * Math.pow(16, u), t, 0.05);
    else if (k === 'bateria') bus.send.gain.setTargetAtTime(0.05 + u * 0.6, t, 0.1);               // más o menos sala
    if (C.filt[k]) // pista de la canción: en reposo queda abierta; inclinar hacia atrás la oscurece, hacia ti le suma brillo
      C.filt[k].frequency.setTargetAtTime(e.b >= 0 ? 20000 : 300 * Math.pow(20000 / 300, 1 + e.b), t, 0.05);
    if (C.det[k]) for (const s of C.srcs) if (s.k === k) s.src.detune.setTargetAtTime(bend(k), t, 0.03);
    const ahora = A.ctx.currentTime;
    A.voces[k] = A.voces[k].filter(v => v.fin > ahora);
    for (const v of A.voces[k]) v.o.detune.setTargetAtTime(v.det + bend(k), t, 0.03);
  }

  // ---------- base rítmica ----------
  function setBase(on) {
    if (!A.ctx) return; if (on === A.base) return;
    A.base = on;
    if (on) { A.t0 = A.ctx.currentTime + 0.1; A.paso = 0; A.prox = A.t0; }
  }
  function programar() {
    if (!A.base) return;
    const c = A.ctx, d = dur16();
    while (A.prox < c.currentTime + 0.12) {
      const p = A.paso % PASOS, t = A.prox;
      if (p === 0) fondo(PROG[Math.floor(A.paso / PASOS) % 4], t, d * PASOS);
      if (!A.bateriaHumana) { // si nadie toca la batería, la base marca el pulso
        if (p % 2 === 0) tambor(2, t, p % 4 === 0 ? 0.6 : 0.4);
        if (p === 0 || p === 8 || p === 10) tambor(0, t, 0.55);
        if (p === 4 || p === 12) tambor(1, t, 0.45);
      } else if (p % 4 === 0) tambor(2, t, 0.25); // con baterista: solo un clic suave
      A.paso++; A.prox += d;
    }
  }
  function estado() {
    const t = A.ctx ? A.ctx.currentTime : 0, a = A.ctx && acordeEn(t);
    const pulso = a ? ((t - A.t0) / (dur16() * 4)) % 4 : 0;
    return { activo: !!(A.ctx && A.ctx.state === 'running'), base: A.base, bpm: BPM, acorde: a ? PROG[a.i].n : null, idx: a ? a.i : -1, pulso, prog: PROG.map(p => p.n) };
  }
  function nivel() { // volumen de la salida 0–1 (para que la imagen reaccione)
    if (!A.an) return 0; const d = new Uint8Array(A.an.fftSize); A.an.getByteTimeDomainData(d);
    let s = 0; for (const v of d) s += (v - 128) * (v - 128); return Math.min(1, Math.sqrt(s / d.length) / 40);
  }

  // ---------- canción separada por instrumento (pistas de herramientas/preparar.py) ----------
  // Cada pista pasa por su volumen y su filtro. Si un instrumento tiene músico, su pista suena solo mientras toca
  // (cada toque la abre por ~2 pulsos): si deja de tocar, la banda pierde ese instrumento y se nota.
  const C = { part: null, base: '', buf: {}, gan: {}, filt: {}, det: {}, srcs: [], sonando: false, t0: 0, pos: 0, abierto: {}, escuchar: 'todo', banda: true };
  // nota falsa: dos notas a medio tono de distancia (o un golpe metálico en la batería), corta y fea a propósito
  function notaFalsa(k) {
    if (!A.ctx) return;
    const c = A.ctx, t = c.currentTime + 0.005, gn = c.createGain(); gn.connect(A.master);
    if (k === 'bateria') {
      const n = c.createBufferSource(), f = c.createBiquadFilter(); n.buffer = A.ruido; f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 8;
      n.connect(f); f.connect(gn); env(gn, t, 0.002, 0.7, 0.12); n.start(t, Math.random()); n.stop(t + 0.2);
      return;
    }
    const base = { guitarra: 52, bajo: 33, teclado: 64 }[k] || 52, m = base + Math.floor(Math.random() * 7);
    env(gn, t, 0.004, k === 'bajo' ? 0.5 : 0.22, 0.28);
    for (const d of [0, 1]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + d) * (1 + (Math.random() - 0.5) * 0.02); o.connect(gn); o.start(t); o.stop(t + 0.35); }
  }
  async function cargarCancion(base, progreso) {
    init(); pausa(); C.pos = 0;
    const part = await (await fetch(base + 'partitura.json', { cache: 'no-store' })).json();
    const c = A.ctx, ks = Object.keys(part.pistas); let n = 0;
    for (const k of ks) {
      const ab = await (await fetch(base + part.pistas[k])).arrayBuffer();
      C.buf[k] = await c.decodeAudioData(ab);
      if (!C.gan[k]) { C.gan[k] = c.createGain(); C.filt[k] = c.createBiquadFilter(); C.filt[k].type = 'lowpass'; C.filt[k].frequency.value = 20000; C.gan[k].connect(C.filt[k]); C.filt[k].connect(A.master); }
      C.det[k] = k === 'guitarra' || k === 'teclado';
      if (progreso) progreso(++n / ks.length, k);
    }
    C.part = part; C.base = base; C.abierto = {};
    return part;
  }
  function tiempoCancion() { return !C.part ? 0 : C.sonando ? A.ctx.currentTime - C.t0 : C.pos; }
  // lo que se escucha de verdad va un poco atrasado respecto del reloj de audio (salida de la tarjeta de sonido)
  function tiempoAudible() { return tiempoCancion() - (C.sonando && A.ctx ? (A.ctx.outputLatency || 0) + (A.ctx.baseLatency || 0) : 0); }
  function reproducir(desde, retraso = 0.08) { // retraso: segundos antes de que empiece (cuenta regresiva)
    if (!C.part) return; init(); detenerFuentes(); C.abierto = {};
    const c = A.ctx, cuando = c.currentTime + retraso, pos = Math.max(0, Math.min(desde ?? C.pos, C.part.duracion - 0.1));
    for (const k of Object.keys(C.buf)) {
      const src = c.createBufferSource(); src.buffer = C.buf[k]; src.connect(C.gan[k]); src.start(cuando, pos);
      C.srcs.push({ k, src });
    }
    C.srcs[0].src.onended = () => { if (C.sonando && tiempoCancion() >= C.part.duracion - 0.2) { C.sonando = false; C.pos = 0; detenerFuentes(); } };
    C.t0 = cuando - pos; C.sonando = true; setBase(false);
  }
  function detenerFuentes() { for (const s of C.srcs) { try { s.src.onended = null; s.src.stop(); } catch {} s.src.disconnect(); } C.srcs = []; }
  function pausa() { if (!C.sonando) return; C.pos = tiempoCancion(); C.sonando = false; detenerFuentes(); }
  // se llama en cada cuadro: ocupados = { guitarra: true, … } (instrumentos que tienen músico conectado)
  function mezclar(ocupados) {
    if (!C.part || !A.ctx) return;
    const t = A.ctx.currentTime;
    for (const k of Object.keys(C.gan)) {
      let v = 1;
      if (C.escuchar !== 'todo') v = k === C.escuchar ? 1 : 0;
      else if (C.banda && ocupados[k]) v = C.abierto[k] === false ? 0.04 : 1; // al fallar, la pista se apaga hasta el siguiente acierto
      const p = C.gan[k].gain; if (Math.abs(p.value - v) > 0.01) p.setTargetAtTime(v, t, v > p.value ? 0.012 : 0.15);
    }
  }
  function energia(k) { // cuánto suena ahora ese instrumento en la canción (0–1), según el análisis
    if (!C.part || !C.part.energia[k]) return 0;
    const e = C.part.energia[k], i = Math.floor(tiempoCancion() * C.part.energia.fps);
    return C.sonando && i >= 0 && i < e.length ? e[i] : 0;
  }
  const cancion = {
    cargar: cargarCancion, reproducir, pausa, mezclar, energia,
    get partitura() { return C.part; }, get sonando() { return C.sonando; }, get tiempo() { return tiempoCancion(); }, get tiempoAudible() { return tiempoAudible(); },
    get escuchar() { return C.escuchar; }, set escuchar(v) { C.escuchar = v; },
    get banda() { return C.banda; }, set banda(v) { C.banda = !!v; },
    abierta: k => C.abierto[k] !== false,
    acierto: k => { C.abierto[k] = true; },
    error: (k, sonar) => { C.abierto[k] = false; if (sonar) notaFalsa(k); }, // sonar: tocó donde no había nota
  };

  g.BandaAudio = { init, tocar, expresion, setBase, estado, nivel, cancion, set bateriaHumana(v) { A.bateriaHumana = !!v; } };
})(window);
