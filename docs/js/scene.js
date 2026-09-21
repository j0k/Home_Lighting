// Сцена кухни на canvas: шкафы, лента, фартук, двойная мойка с кранами и водой,
// режим «Проводка» (где идут кабели) и осциллограф на затворах.

// Геометрия в долях ширины/высоты холста. DOM-ручки (энкодер, краны) ставятся по этим же числам.
const SC = {
  cabB: 0.34,              // низ верхних шкафов — тут приклеена лента
  topY: 0.68,              // задний край столешницы
  edgeY: 0.75,             // передняя кромка столешницы
  sinks: [0.5, 0.69],      // центры двух чаш
  sinkW: 0.16,
  knob: [0.88, 0.5],       // энкодер на фартуке (совпадает с CSS .knob.scene)
  irX: 0.6,                // ИК-приёмник на кромке шкафа
};
const scene = {
  wires: false,
  flash: { enc: 0, ir: 0 },
  taps: [{ open: 0, flow: 0 }, { open: 0, flow: 0 }],
};

function faucetGeom(i, W, H) {
  const sx = SC.sinks[i] * W;
  const bx = sx - 0.03 * W;                               // основание смесителя за чашей
  const fy = (SC.cabB + (SC.topY - SC.cabB) * 0.32) * H;  // верх «гусака»
  return { sx, bx, fy, ex: bx + 0.045 * W, ey: fy + 0.07 * H, hx: bx - 0.024 * W, hy: (SC.topY - 0.075) * H };
}
// Где на сцене стоят DOM-ручки кранов (в процентах)
function tapPosition(i) {
  const g = faucetGeom(i, 1, 1);
  return { left: g.hx * 100, top: g.hy * 100 };
}

function fitCanvas(c) {
  const r = c.getBoundingClientRect(), d = devicePixelRatio || 1;
  const w = Math.round(r.width * d), h = Math.round(r.height * d);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return [w, h, d];
}

function drawRoom(disp, lin, tm, dt) {
  const c = $('#room'), [W, H] = fitCanvas(c), x = c.getContext('2d');
  const mx = Math.max(...disp, 1), hue = disp.map((v) => Math.round(v / mx * 255)), a = mx / 255;
  const L = (al) => `rgba(${hue},${al * a})`;
  const cabB = SC.cabB * H, topY = SC.topY * H, edgeY = SC.edgeY * H;

  // Фартук: свет ленты падает сверху вниз и слабеет к столешнице
  x.fillStyle = '#0b0c0e'; x.fillRect(0, 0, W, H);
  const bg = x.createLinearGradient(0, cabB, 0, topY);
  bg.addColorStop(0, L(0.95)); bg.addColorStop(0.3, L(0.62)); bg.addColorStop(1, L(0.3));
  x.fillStyle = bg; x.fillRect(0, cabB, W, topY - cabB);
  // плитка «кабанчик»: швы рисуем поверх света
  const rows = 6, th = (topY - cabB) / rows, tw = th * 2.4;
  x.strokeStyle = 'rgba(0,0,0,.32)'; x.lineWidth = Math.max(1, H * 0.003);
  x.beginPath();
  for (let r = 0; r < rows; r++) {
    const y = cabB + r * th;
    x.moveTo(0, y); x.lineTo(W, y);
    for (let xx = r % 2 ? -tw / 2 : 0; xx < W; xx += tw) { x.moveTo(xx, y); x.lineTo(xx, y + th); }
  }
  x.stroke();

  // Столешница (видна чуть сверху): световое пятно у стены
  const tg = x.createLinearGradient(0, topY, 0, edgeY);
  tg.addColorStop(0, L(0.55)); tg.addColorStop(1, L(0.18));
  x.fillStyle = '#18181a'; x.fillRect(0, topY, W, edgeY - topY);
  x.fillStyle = tg; x.fillRect(0, topY, W, edgeY - topY);

  // Двойная мойка: две чаши
  const sw = SC.sinkW * W;
  SC.sinks.forEach((s) => {
    x.fillStyle = '#060607';
    x.beginPath(); x.roundRect(s * W - sw / 2, topY + H * 0.012, sw, edgeY - topY - H * 0.024, H * 0.012); x.fill();
    x.strokeStyle = L(0.45); x.lineWidth = Math.max(1, H * 0.003); x.stroke();
  });

  // Разделочная доска у стены и банка
  const bx = W * 0.1, bw = W * 0.1, bh = H * 0.22;
  x.fillStyle = '#1a1411';
  x.beginPath(); x.roundRect(bx, topY + H * 0.02 - bh, bw, bh, H * 0.02); x.fill();
  x.fillStyle = L(0.28); x.fill();
  x.fillStyle = '#0b0c0e'; x.beginPath(); x.arc(bx + bw / 2, topY + H * 0.02 - bh + H * 0.03, H * 0.012, 0, Math.PI * 2); x.fill();
  const jx = W * 0.26, jw = W * 0.045, jh = H * 0.1;
  x.fillStyle = '#0d0e10'; x.fillRect(jx, topY + H * 0.025 - jh, jw, jh);
  x.fillStyle = L(0.6); x.fillRect(jx, topY + H * 0.025 - jh, jw, Math.max(2, H * 0.008));

  // Смесители и вода
  scene.taps.forEach((tap, i) => {
    tap.flow += (tap.open - tap.flow) * Math.min(1, dt / 140);  // напор меняется плавно
    drawFaucet(x, W, H, i, L);
    if (tap.flow > 0.01) drawWater(x, W, H, i, tap.flow, hue, a, tm);
  });

  // Передняя кромка столешницы
  x.fillStyle = '#121214'; x.fillRect(0, edgeY, W, H * 0.03);
  x.fillStyle = L(0.35); x.fillRect(0, edgeY, W, Math.max(1, H * 0.003));

  // Нижние шкафы: чуть подсвечены отражением от столешницы
  const lowY = edgeY + H * 0.03;
  x.fillStyle = '#0f1013'; x.fillRect(0, lowY, W, H - lowY);
  const lg = x.createLinearGradient(0, lowY, 0, H);
  lg.addColorStop(0, L(0.1)); lg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = lg; x.fillRect(0, lowY, W, H - lowY);
  x.fillStyle = '#08090a';
  for (let i = 1; i < 5; i++) x.fillRect(W * i / 5 - 1, lowY, 2, H - lowY);
  x.fillStyle = '#2a2c30';
  for (let i = 0; i < 5; i++) x.fillRect(W * (i + 0.5) / 5 - W * 0.025, lowY + H * 0.03, W * 0.05, Math.max(2, H * 0.008));

  // Верхние шкафы
  x.fillStyle = '#131417'; x.fillRect(0, 0, W, cabB);
  x.fillStyle = L(0.05); x.fillRect(0, 0, W, cabB);
  x.fillStyle = '#08090a';
  for (let i = 1; i < 6; i++) x.fillRect(W * i / 6 - 1, 0, 2, cabB);
  x.fillStyle = '#2a2c30';
  for (let i = 0; i < 6; i++) x.fillRect(W * (i + (i % 2 ? 0.1 : 0.88)) / 6 - 1, cabB - H * 0.12, Math.max(2, W * 0.005), H * 0.07);
  x.fillStyle = '#1c1d21'; x.fillRect(0, cabB - H * 0.014, W, H * 0.014);

  if (scene.wires) drawWiring(x, W, H, lin, tm);

  // Сама лента под нижним краем шкафов
  x.save();
  x.shadowColor = `rgba(${hue},${a})`; x.shadowBlur = H * 0.05 * a;
  x.fillStyle = a > 0.01 ? `rgba(${hue.map((v) => Math.round(v * 0.6 + 102))},${Math.min(1, a * 1.4)})` : '#1a1b1e';
  x.fillRect(0, cabB, W, Math.max(2, H * 0.007));
  x.restore();
}

function drawFaucet(x, W, H, i, L) {
  const g = faucetGeom(i, W, H), topY = SC.topY * H, fw = H * 0.016;
  x.save();
  x.lineCap = 'round';
  // рычаг-держатель ручки: от корпуса к DOM-ручке
  x.strokeStyle = '#0a0a0b'; x.lineWidth = fw * 0.7;
  x.beginPath(); x.moveTo(g.bx, g.hy); x.lineTo(g.hx, g.hy); x.stroke();
  // «гусак»
  x.beginPath();
  x.moveTo(g.bx, topY + H * 0.01); x.lineTo(g.bx, g.fy + H * 0.04);
  x.quadraticCurveTo(g.bx, g.fy, g.bx + W * 0.022, g.fy);
  x.quadraticCurveTo(g.ex, g.fy, g.ex, g.fy + H * 0.04);
  x.lineTo(g.ex, g.ey);
  x.strokeStyle = '#0a0a0b'; x.lineWidth = fw; x.stroke();
  x.strokeStyle = L(0.7); x.lineWidth = fw * 0.25; x.stroke();  // блик от ленты сверху
  x.restore();
}

function drawWater(x, W, H, i, f, hue, a, tm) {
  const g = faucetGeom(i, W, H);
  const y0 = g.ey, y1 = SC.topY * H + H * 0.035, len = y1 - y0;
  const w = W * (0.002 + 0.006 * f);
  // Вода почти бесцветная, но отражает свет ленты
  const col = [0, 1, 2].map((k) => Math.round(170 + 60 * (1 - a) + (hue[k] - 170) * a * 0.55));
  x.save();
  // струя с лёгким колыханием
  x.beginPath();
  const seg = 14;
  for (let s = 0; s <= seg; s++) {
    const y = y0 + len * s / seg;
    const wob = Math.sin(y * 0.08 + tm * 0.018) * w * 0.18 * (s / seg);
    const ww = w * (1 - 0.25 * s / seg);
    if (s === 0) x.moveTo(g.ex - ww / 2 + wob, y); else x.lineTo(g.ex - ww / 2 + wob, y);
  }
  for (let s = seg; s >= 0; s--) {
    const y = y0 + len * s / seg;
    const wob = Math.sin(y * 0.08 + tm * 0.018) * w * 0.18 * (s / seg);
    const ww = w * (1 - 0.25 * s / seg);
    x.lineTo(g.ex + ww / 2 + wob, y);
  }
  x.closePath();
  const sg = x.createLinearGradient(g.ex - w, 0, g.ex + w, 0);
  sg.addColorStop(0, `rgba(${col},${0.25 + 0.3 * f})`);
  sg.addColorStop(0.45, `rgba(${col.map((v) => Math.min(255, v + 50))},${0.55 + 0.35 * f})`);
  sg.addColorStop(1, `rgba(${col},${0.25 + 0.3 * f})`);
  x.fillStyle = sg; x.fill();
  // бегущие вниз блики
  x.fillStyle = `rgba(255,255,255,${0.35 * f})`;
  for (let k = 0; k < 5; k++) {
    const p = ((tm * 0.0016 * (0.6 + f) + k / 5) % 1);
    x.fillRect(g.ex - w * 0.15, y0 + p * len, w * 0.3, len * 0.05);
  }
  // круги и брызги в чаше
  for (let k = 0; k < 3; k++) {
    const p = ((tm * 0.0012 + k / 3) % 1);
    x.strokeStyle = `rgba(${col},${(1 - p) * 0.5 * f})`;
    x.lineWidth = Math.max(1, H * 0.003);
    x.beginPath(); x.ellipse(g.ex, y1, W * 0.012 + p * W * 0.03 * (0.5 + f), H * 0.006 + p * H * 0.01, 0, 0, Math.PI * 2); x.stroke();
  }
  x.restore();
}

// «Проводка»: полупрозрачные шкафы, коробка с электроникой, БП и кабели
function drawWiring(x, W, H, lin, tm) {
  const cabB = SC.cabB * H;
  const box = { x: 0.62 * W, y: 0.13 * H, w: 0.15 * W, h: 0.12 * H };
  const psu = { x: 0.8 * W, y: 0.14 * H, w: 0.11 * W, h: 0.09 * H };
  const lw = Math.max(1.5, H * 0.005);
  const hot = (key) => now() - scene.flash[key] < 350;
  x.save();
  x.fillStyle = 'rgba(4,5,7,.6)'; x.fillRect(0, 0, W, cabB);   // шкафы «на просвет»
  x.lineCap = 'round'; x.lineJoin = 'round';

  const line = (pts, color, width, dash) => {
    x.strokeStyle = color; x.lineWidth = width; x.setLineDash(dash || []);
    x.beginPath(); pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
    x.setLineDash([]);
  };
  // 230 В в розетку над шкафами и 12 В от БП к коробке
  line([[psu.x + psu.w / 2, psu.y], [psu.x + psu.w / 2, 0]], '#9aa0a8', lw);
  line([[psu.x, psu.y + psu.h * 0.55], [box.x + box.w, psu.y + psu.h * 0.55]], '#E08A4F', lw * 1.3);
  // 4 провода к ленте: +12V и три канала, по каналам бежит ШИМ
  const colors = ['#E08A4F', '#E0413A', '#22A061', '#3B6FE0'];
  const off = -tm * 0.05;
  colors.forEach((col, k) => {
    const px = box.x + box.w * (0.3 + k * 0.13);
    const pts = [[px, box.y + box.h], [px, cabB]];
    if (k === 0) { line(pts, col, lw); return; }
    const d = lin[k - 1], P = H * 0.03;
    line(pts, 'rgba(120,125,130,.35)', lw);
    if (d > 0) {
      x.lineDashOffset = off;
      line(pts, col, lw, d >= 1 ? [] : [d * P, (1 - d) * P]);
      x.lineDashOffset = 0;
    }
  });
  // энкодер: кабель спрятан в стене (пунктир), подсвечивается, когда крутят
  const kx = SC.knob[0] * W, ky = SC.knob[1] * H, turnY = 0.315 * H;  // между коробками и лентой
  line([[kx, ky], [kx, turnY], [box.x + box.w * 0.9, turnY], [box.x + box.w * 0.9, box.y + box.h]], hot('enc') ? '#ff9a55' : 'rgba(200,205,210,.7)', lw, [lw * 2, lw * 2]);
  // ИК-приёмник на кромке шкафа
  const ix = SC.irX * W;
  line([[ix, cabB - H * 0.01], [ix, box.y + box.h * 0.7], [box.x, box.y + box.h * 0.7]], hot('ir') ? '#ff5a6e' : 'rgba(200,205,210,.7)', lw);
  x.fillStyle = '#15171a'; x.beginPath(); x.roundRect(ix - W * 0.012, cabB - H * 0.022, W * 0.024, H * 0.024, H * 0.006); x.fill();
  x.fillStyle = hot('ir') ? '#ff5a6e' : '#5a2a30'; x.beginPath(); x.arc(ix, cabB - H * 0.008, H * 0.007, 0, Math.PI * 2); x.fill();

  // коробки
  const boxDraw = (b, label, accent) => {
    x.fillStyle = 'rgba(20,23,27,.95)'; x.strokeStyle = accent; x.lineWidth = lw * 0.8;
    x.beginPath(); x.roundRect(b.x, b.y, b.w, b.h, H * 0.012); x.fill(); x.stroke();
    fitText(x, label, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.9, H * 0.034, '#e8ecef', 'center');
  };
  boxDraw(box, t('wire.box'), '#E08A4F');
  boxDraw(psu, t('wire.psu'), '#9aa0a8');

  // подписи
  const fs = Math.max(10, H * 0.028);
  pill(x, t('wire.mains'), psu.x + psu.w / 2 - W * 0.012, H * 0.105, fs, 'right');  // ниже плашки с цветом
  pill(x, t('wire.strip'), box.x + box.w + W * 0.012, box.y + box.h + H * 0.025, fs, 'left');
  pill(x, t('wire.enc'), W * 0.975, ky + H * 0.135, fs, 'right');  // под ручкой энкодера
  pill(x, t('wire.ir'), ix - W * 0.014, cabB + H * 0.045, fs, 'right');
  x.restore();
}
function fitText(x, text, cx, cy, maxW, size, color, align) {
  let s = size;
  x.font = `600 ${s}px ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}`;
  while (x.measureText(text).width > maxW && s > 7) { s -= 0.5; x.font = `600 ${s}px ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}`; }
  x.fillStyle = color; x.textAlign = align; x.textBaseline = 'middle';
  x.fillText(text, cx, cy);
}
function pill(x, text, px, py, fs, align) {
  x.font = `${fs}px ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}`;
  const w = x.measureText(text).width, pad = fs * 0.45;
  const left = align === 'right' ? px - w - pad * 2 : px;
  x.fillStyle = 'rgba(8,10,12,.78)';
  x.beginPath(); x.roundRect(left, py - fs * 0.75, w + pad * 2, fs * 1.5, fs * 0.4); x.fill();
  x.fillStyle = '#dfe5e3'; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText(text, left + pad, py);
}

// Осциллограф: реальный коэффициент заполнения, частота замедлена для глаза
let scopeT = 0;
function drawScope(dt) {
  const c = $('#scope'), [W, H, d] = fitCanvas(c), x = c.getContext('2d');
  const cs = getComputedStyle(document.documentElement);
  x.clearRect(0, 0, W, H);
  scopeT += dt;
  const rowsDef = [['D5', 'R', 976, 24], ['D6', 'G', 976, 24], ['D9', 'B', 490, 48]];
  const rowH = H / 3, left = 150 * d;
  rowsDef.forEach(([pin, ch, hz, per], i) => {
    const y0 = i * rowH, hi = y0 + rowH * 0.22, lo = y0 + rowH * 0.8, duty = ard.pwm[i] / 255;
    x.fillStyle = cs.getPropertyValue('--muted');
    x.font = `${11 * d}px ${cs.getPropertyValue('--mono')}`;
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillText(`${pin} · ${ch} · ${hz} ${t('u.hz')}`, 10 * d, y0 + rowH * 0.45);
    x.fillStyle = cs.getPropertyValue('--ink');
    x.fillText(`analogWrite ${String(ard.pwm[i]).padStart(3)} · ${Math.round(duty * 100)}%`, 10 * d, y0 + rowH * 0.8);
    x.strokeStyle = cs.getPropertyValue('--' + 'rgb'[i]);
    x.lineWidth = 2 * d;
    x.beginPath();
    const P = per * d, off = (scopeT * 0.04 * d) % P;
    if (duty <= 0) { x.moveTo(left, lo); x.lineTo(W - 8 * d, lo); }
    else if (duty >= 1) { x.moveTo(left, hi); x.lineTo(W - 8 * d, hi); }
    else {
      let first = true;
      for (let px = left - P - off; px < W; px += P) {
        const on = px + duty * P;
        for (const [xx, yy] of [[px, hi], [on, hi], [on, lo], [px + P, lo], [px + P, hi]]) {
          const cx = clamp(xx, left, W - 8 * d);
          if (first) { x.moveTo(cx, yy); first = false; } else x.lineTo(cx, yy);
        }
      }
    }
    x.stroke();
  });
}
