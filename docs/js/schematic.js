// Принципиальная схема (SVG): провода, MOSFET, светодиоды ленты и бегущие по проводам «пакеты».
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const Q = [{ x: 640, gy: 200, name: 'Q1' }, { x: 760, gy: 260, name: 'Q2' }, { x: 880, gy: 320, name: 'Q3' }];
const WIRES = {
  'w-clk': 'M170 190 H280', 'w-dt': 'M170 220 H280', 'w-sw': 'M170 250 H280', 'w-ir': 'M150 360 H280',
  'w-usb': 'M360 442 V510', 'w-mq1': 'M440 538 H478', 'w-mq2': 'M608 538 H646',
  'w-gnd': 'M440 400 H460 V460 H940 M920 460 V510', 'w-12v': 'M960 510 V496 H984 V56 H960',
  'w-5v': 'M280 300 H250', 'w-gndl': 'M280 400 H250',
};
Q.forEach((q, i) => {
  WIRES['w-gate' + i] = `M440 ${q.gy} H500 M540 ${q.gy} H${q.x - 30}`;
  WIRES['w-drain' + i] = `M${q.x} 78 V${q.gy - 14}`;
  WIRES['w-src' + i] = `M${q.x} ${q.gy + 14} V460`;
});

const paths = {}, pwmOverlay = [], drainOverlay = [], ledEls = [];
function buildSchematic() {
  const wireG = $('#wires');
  for (const id in WIRES) paths[id] = svgEl('path', { id, d: WIRES[id], class: 'wire' + (id === 'w-12v' ? ' rail12' : '') }, wireG);
  Q.forEach((q, i) => {
    pwmOverlay.push(svgEl('path', { d: WIRES['w-gate' + i], class: 'sig', stroke: CH_COLORS[i] }, wireG));
    drainOverlay.push(svgEl('path', { d: WIRES['w-drain' + i], class: 'sig', stroke: CH_COLORS[i], opacity: 0 }, wireG));
  });
  [[640, 460], [760, 460], [880, 460], [920, 460]].forEach(([x, y]) => svgEl('circle', { cx: x, cy: y, r: 3.5, class: 'jn' }, wireG));
  svgEl('text', { x: 244, y: 304, class: 'lbl', 'text-anchor': 'end' }, wireG).textContent = '5V';
  svgEl('text', { x: 244, y: 404, class: 'lbl', 'text-anchor': 'end' }, wireG).textContent = 'GND';
  svgEl('text', { x: 690, y: 476, class: 'lbl', 'data-i18n': 'sch.gnd' }, wireG);

  const mos = $('#mosfets');
  Q.forEach((q) => {
    const g = svgEl('g', { transform: `translate(${q.x} ${q.gy})` }, mos);
    svgEl('line', { x1: 0, y1: -14, x2: 0, y2: 14, class: 'sym', 'stroke-width': 3 }, g);
    svgEl('line', { x1: -9, y1: -11, x2: -9, y2: 11, class: 'sym' }, g);
    svgEl('line', { x1: -9, y1: 0, x2: -30, y2: 0, class: 'sym' }, g);
    svgEl('path', { d: 'M9 0 l-6 -4 v8 z', fill: 'var(--ink)' }, g);
    svgEl('line', { x1: 0, y1: 0, x2: 9, y2: 0, class: 'sym', 'stroke-width': 1.5 }, g);
    svgEl('text', { x: 14, y: -2, class: 'lbl' }, g).textContent = q.name;
    svgEl('text', { x: 14, y: 11, class: 'lbl' }, g).textContent = 'IRLZ44N';
    svgEl('rect', { x: 500, y: q.gy - 6, width: 40, height: 12, rx: 2, class: 'res' }, mos);
    svgEl('text', { x: 502, y: q.gy - 11, class: 'lbl' }, mos).textContent = '220 Ω';
  });
  for (let i = 0; i < 15; i++) ledEls.push(svgEl('circle', { cx: 584 + i * 25.5, cy: 56, r: 7, fill: '#333' }, $('#leds')));
}

// Кружок, пробегающий по проводу: так видно, куда идёт сигнал
function packet(id, { color, dur = 300, reverse = false }) {
  if (REDUCE || !paths[id]) return;
  const p = paths[id], len = p.getTotalLength();
  const c = svgEl('circle', { r: 5, fill: color }, $('#packets'));
  const t0 = now();
  (function step() {
    const k = Math.min(1, (now() - t0) / dur);
    const pt = p.getPointAtLength((reverse ? 1 - k : k) * len);
    c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y);
    if (k < 1) requestAnimationFrame(step); else c.remove();
  })();
}
const flashTimers = {};
function flashText(id, text) {
  const el = document.getElementById(id);
  el.textContent = text.length > 34 ? text.slice(0, 33) + '…' : text;
  clearTimeout(flashTimers[id]);
  flashTimers[id] = setTimeout(() => (el.textContent = ''), 1600);
}

// Каждый кадр: ШИМ штрихами на затворах, ток в стоках, цвет светодиодов
let dashOff = 0;
function renderSchematic(lin, disp, I, dt) {
  if (!REDUCE) dashOff -= dt * 0.03;
  const P = 16;
  pwmOverlay.forEach((p, i) => {
    const d = lin[i];
    p.setAttribute('stroke-dasharray', d <= 0 ? '0 16' : d >= 1 ? '16 0' : `${d * P} ${(1 - d) * P}`);
    p.setAttribute('stroke-dashoffset', dashOff);
  });
  drainOverlay.forEach((p, i) => p.setAttribute('opacity', Math.min(1, lin[i] * 1.6)));
  const ledFill = `rgb(${disp.map((v) => Math.round(40 + v * 0.84))})`;
  ledEls.forEach((e) => e.setAttribute('fill', ledFill));
  $('#leds').style.filter = I > 0.02 ? `drop-shadow(0 0 ${3 + I * 6}px rgb(${disp}))` : 'none';
}
