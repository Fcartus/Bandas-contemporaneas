/* banda-comun.js · lo que comparten la pantalla (escenario.html) y el teléfono (banda.html).
 *
 * Temas MQTT (JSON), además de los de tacto.js:
 *   tacto/<sala>/escenario/roles     retained  {t, roles:{guitarra:{id,name,online}|null, …}, publico:[id…]}   lo publica el escenario (árbitro)
 *   tacto/<sala>/<dev>/status        retained  {online, name, app:'banda'}   con último testamento (online:false si se cae)
 *   tacto/<sala>/<dev>/lanzar                  {tipo:'rosa'|'tomate', x, y, f}   público → escenario (x,y = punto de caída en la tarima)
 *   tacto/<sala>/<dev>/resultado               {tipo, a:instrumento|null}         escenario → quien lanzó
 *   tacto/<sala>/<dev>/impacto                 {tipo, de:nombre}                  escenario → músico que recibió
 *   tacto/<sala>/<dev>/golpe                   {z}                                músico → escenario (prueba, antes de la partitura)
 *
 * Coordenadas de la tarima: x de 0 (izquierda) a 1 (derecha); y de 0 (fondo) a 1 (borde delantero). El público está en y > 1.
 */
(function (g) {
  'use strict';
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  const INSTRUMENTOS = ['guitarra', 'bajo', 'bateria', 'teclado']; // orden en que se reparten
  const INFO = {
    guitarra: { nombre: 'Guitarra', color: '#ff5e7a', x: 0.3, y: 0.7 },
    bajo: { nombre: 'Bajo', color: '#4cc9f0', x: 0.7, y: 0.7 },
    bateria: { nombre: 'Batería', color: '#e6ff3d', x: 0.5, y: 0.32 },
    teclado: { nombre: 'Teclado', color: '#b388ff', x: 0.83, y: 0.4 },
  };
  const COOLDOWN = 5000;     // ms entre lanzamientos de una misma persona
  const GRACIA = 15000;      // ms que se guarda el instrumento a un músico desconectado
  const RADIO_IMPACTO = 0.13; // distancia (en unidades de la tarima) para que un lanzamiento le dé a un músico
  const ORIGEN = { rosa: { x: 0.12, y: 1.25 }, tomate: { x: 0.88, y: 1.25 } }; // rosas desde la izquierda, tomates desde la derecha

  const temas = sala => ({
    roles: `tacto/${sala}/escenario/roles`,
    show: `tacto/${sala}/escenario/show`, // retained {cancion, sonando, inicio (reloj del escenario, ms), pos}
    dev: (id, k) => `tacto/${sala}/${id}/${k}`,
    todo: `tacto/${sala}/#`,
  });

  // Punto de caída a partir del gesto en el teléfono.
  // vx, vy: velocidad del deslizamiento (px/ms; vy negativa = hacia arriba). f: fuerza 0–1 (más fuerza, más al fondo).
  function aterrizaje(tipo, vx, vy, f) {
    const o = ORIGEN[tipo];
    const y = clamp(1 - (0.12 + 0.82 * f), 0.08, 1);         // f=0 cae en el borde; f=1 llega al fondo
    const pendiente = vx / Math.max(0.05, -vy);              // cuánto se abre hacia los lados por cada unidad de avance
    const x = clamp(o.x + pendiente * (o.y - y) * 0.9, 0, 1);
    return { x, y };
  }

  // A qué músico le da un punto de caída (o null si cae en el piso).
  function objetivo(x, y) {
    let best = null, bd = RADIO_IMPACTO;
    for (const k of INSTRUMENTOS) { const p = INFO[k], d = Math.hypot((x - p.x) * 1.2, y - p.y); if (d < bd) { bd = d; best = k; } }
    return best;
  }

  // Perspectiva simple: el fondo de la tarima es más angosto que el borde delantero.
  // r = { cx, top, w, h } en píxeles: centro horizontal, borde del fondo, ancho delantero y alto de la tarima.
  function proyectar(x, y, r) {
    const s = 0.62 + 0.38 * y;
    return { x: r.cx + (x - 0.5) * r.w * s, y: r.top + y * r.h, s };
  }

  // Dibujos pequeños (rosa y tomate) para pantalla y teléfono.
  function dibujarTomate(c, x, y, r, rot = 0, alpha = 1) {
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.rotate(rot);
    const gr = c.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    gr.addColorStop(0, '#ff8a70'); gr.addColorStop(0.6, '#e8321e'); gr.addColorStop(1, '#a3170c');
    c.fillStyle = gr; c.beginPath(); c.ellipse(0, 0, r, r * 0.9, 0, 0, 7); c.fill();
    c.fillStyle = '#3fa34d';
    for (let i = 0; i < 5; i++) { c.save(); c.rotate((i / 5) * Math.PI * 2); c.beginPath(); c.ellipse(0, -r * 0.82, r * 0.12, r * 0.32, 0, 0, 7); c.fill(); c.restore(); }
    c.restore();
  }
  function dibujarRosa(c, x, y, r, rot = 0, alpha = 1) {
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.rotate(rot);
    c.strokeStyle = '#3fa34d'; c.lineWidth = Math.max(1.5, r * 0.18); c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, r * 0.4); c.quadraticCurveTo(r * 0.3, r * 1.4, -r * 0.1, r * 2.2); c.stroke();
    c.fillStyle = '#3fa34d'; c.beginPath(); c.ellipse(r * 0.35, r * 1.2, r * 0.32, r * 0.14, -0.6, 0, 7); c.fill();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, rr = r * (i % 2 ? 0.75 : 0.95);
      c.fillStyle = i % 2 ? '#ff4d7d' : '#d81b55';
      c.beginPath(); c.ellipse(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, rr * 0.6, rr * 0.45, a, 0, 7); c.fill();
    }
    c.fillStyle = '#9e0d3c'; c.beginPath(); c.arc(0, 0, r * 0.28, 0, 7); c.fill();
    c.restore();
  }

  // ---------- partitura y coordinación (lo calculan igual la pantalla y el teléfono a partir de partitura.json) ----------
  const ARTICULO = { guitarra: 'la', bajo: 'el', bateria: 'la', teclado: 'el' };
  const VENTANA = { perfecto: 0.07, bien: 0.14 }; // segundos de margen para acertar una nota
  const AVISO = 3, VENTANA_GESTO = 1.6;           // el aviso aparece 3 s antes; el gesto se mide durante 1,6 s
  const GESTOS = { // b, g: inclinación normalizada (−1…1) desde la posición en que el músico activó el movimiento
    arriba: { texto: '¡ARRIBA LOS INSTRUMENTOS!', ayuda: 'inclina el teléfono hacia ti', ok: (b) => b > 0.45 },
    izquierda: { texto: '¡TODOS A LA IZQUIERDA!', ayuda: 'inclina el teléfono a la izquierda', ok: (b, gm) => gm < -0.45 },
    derecha: { texto: '¡TODOS A LA DERECHA!', ayuda: 'inclina el teléfono a la derecha', ok: (b, gm) => gm > 0.45 },
  };
  const promedio = (a, w) => { const o = new Float32Array(a.length); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= w) s -= a[i - w]; o[i] = s / Math.min(i + 1, w); } return o; };

  // Notas de un instrumento, sin golpes demasiado juntos en la misma zona (que se puedan tocar con un dedo)
  function notasPara(p, k) {
    const out = [], ult = [-9, -9, -9, -9];
    for (const [t, z] of (p.notas && p.notas[k]) || []) { if (t - ult[z] >= 0.16) { out.push({ t, z }); ult[z] = t; } }
    return out;
  }

  // Avisos de la canción: gestos en los cambios de sección (subidas de energía) y entradas de cada instrumento
  function coordinacion(p) {
    if (!p || !p.energia) return [];
    const fps = p.energia.fps, ks = INSTRUMENTOS.filter(k => p.energia[k]), n = Math.min(...ks.map(k => p.energia[k].length));
    const total = new Float32Array(n); for (const k of ks) for (let i = 0; i < n; i++) total[i] += p.energia[k][i];
    const sm = promedio(total, fps * 2), sube = new Float32Array(n);
    for (let i = fps * 2; i < n; i++) sube[i] = sm[i] - sm[i - fps * 2];
    const tope = Math.max(...sube), cand = [];
    for (let i = fps * 10; i < n - fps * 10; i++) {
      if (sube[i] < tope * 0.35) continue;
      let max = true; for (let j = Math.max(0, i - fps * 5); j < Math.min(n, i + fps * 5); j++) if (sube[j] > sube[i]) { max = false; break; }
      if (max) cand.push([i, sube[i]]);
    }
    const elegidos = [];
    for (const [i] of cand.sort((a, b) => b[1] - a[1])) if (elegidos.length < 8 && elegidos.every(j => Math.abs(j - i) > fps * 25)) elegidos.push(i);
    const tipos = ['arriba', 'izquierda', 'derecha'], ev = [];
    elegidos.sort((a, b) => a - b).forEach((i, n2) => { const g2 = tipos[n2 % 3]; ev.push({ t: i / fps, tipo: 'gesto', gesto: g2, texto: GESTOS[g2].texto }); });
    for (const k of ks) { // entradas: el instrumento vuelve después de 6 s o más en silencio
      const e = promedio(p.energia[k], fps / 2); let calla = 0;
      for (let i = 0; i < e.length; i++) {
        if (e[i] < 0.1) calla++;
        else if (e[i] >= 0.2) { if (calla >= fps * 6 && i / fps > 4) ev.push({ t: i / fps - 0.4, tipo: 'entra', k, texto: `¡Entra ${ARTICULO[k]} ${INFO[k].nombre.toLowerCase()}!` }); calla = 0; }
      }
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  g.Banda = { INSTRUMENTOS, INFO, COOLDOWN, GRACIA, RADIO_IMPACTO, ORIGEN, temas, aterrizaje, objetivo, proyectar, dibujarTomate, dibujarRosa, clamp,
    ARTICULO, VENTANA, AVISO, VENTANA_GESTO, GESTOS, notasPara, coordinacion };
})(window);
