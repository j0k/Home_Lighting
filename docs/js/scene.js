// Сцена кухни на canvas: шкафы по бокам, над мойкой открытая стена с большим круглым зеркалом
// и RGB-ореолом вокруг него, две чаши-«вазы» с настенными смесителями, вода, духовка с индейкой,
// режим «Проводка» (где идут кабели) и осциллограф на затворах.

// Геометрия в долях ширины/высоты холста. DOM-ручки (энкодер, краны) ставятся по этим же числам.
const SC = {
  cabB: 0.34,              // низ верхних шкафов — тут приклеена лента
  topY: 0.68,              // задний край столешницы
  edgeY: 0.75,             // передняя кромка столешницы
  cabs: [[0, 0.4], [0.78, 1]],   // верхние шкафы слева и справа; между ними открытая стена
  sinks: [0.5, 0.69],      // центры двух чаш
  bowlW: 0.13,             // ширина чаши-«вазы»
  mirror: { x: 0.595, y: 0.27, r: 0.17 },  // общее зеркало: x — доля ширины, y и r — доли высоты
  knob: [0.88, 0.5],       // энкодер на фартуке (совпадает с CSS .knob.scene)
  irX: 0.36,               // ИК-приёмник на кромке левого шкафа
};
const scene = {
  wires: false,
  flash: { enc: 0, ir: 0 },
  taps: [{ open: 0, flow: 0 }, { open: 0, flow: 0 }],
};

function faucetGeom(i, W, H) {
  const sx = SC.sinks[i] * W;
  const bodyX = sx - 0.052 * W;  // настенный смеситель слева за чашей, как на фото
  return {
    sx, bodyX, bowlW: SC.bowlW * W,
    rimY: (SC.topY - 0.075) * H,                  // верхний край чаши
    bodyTop: 0.49 * H, bodyBot: 0.525 * H,        // корпус смесителя на стене
    ex: sx - 0.004 * W, ey: 0.548 * H,            // конец излива над центром чаши
    hx: bodyX, hy: 0.476 * H,                     // рычаг сверху корпуса (DOM-ручка)
  };
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

  const gap0 = SC.cabs[0][1] * W, gap1 = SC.cabs[1][0] * W;
  const m = { x: SC.mirror.x * W, y: SC.mirror.y * H, r: SC.mirror.r * H };
  x.fillStyle = '#0b0c0e'; x.fillRect(0, 0, W, H);
  // Свет на стене — два слоя, смешанные плавной маской по ширине (без швов у краёв проёма):
  // лента под шкафами светит сверху вниз и затухает внутрь проёма,
  // ореол зеркала освещает проём и мягко растекается под шкафы.
  const g0 = SC.cabs[0][1], g1 = SC.cabs[1][0];
  const smooth = (e0, e1, v) => { const k = clamp((v - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); };
  const inGap = (fx) => Math.min(fx - g0, g1 - fx);  // >0 внутри проёма, <0 под шкафами
  const strip = x.createLinearGradient(0, cabB, 0, topY);
  strip.addColorStop(0, L(0.95)); strip.addColorStop(0.3, L(0.62)); strip.addColorStop(1, L(0.3));
  const hg = x.createRadialGradient(m.x, m.y, m.r * 0.9, m.x, m.y, m.r * 2.8);
  hg.addColorStop(0, L(0.9)); hg.addColorStop(0.5, L(0.45)); hg.addColorStop(1, L(0.2));
  const SLICES = Math.ceil(W / 4), sw = W / SLICES;  // срез ~4 px: маска без видимых ступенек
  for (let i = 0; i < SLICES; i++) {
    // целые пиксели без перекрытия, иначе на стыках срезов проступают полоски
    const d = inGap((i + 0.5) / SLICES), sx0 = Math.round(i * sw), sw0 = Math.round((i + 1) * sw) - sx0;
    x.globalAlpha = 1 - 0.8 * smooth(-0.02, 0.1, d);          // лента: 1 под шкафами → 0.2 в глубине проёма
    x.fillStyle = strip; x.fillRect(sx0, cabB, sw0, topY - cabB);
    x.globalAlpha = smooth(-0.1, 0.04, d);                    // ореол: 0 далеко под шкафами → 1 в проёме
    x.fillStyle = hg; x.fillRect(sx0, 0, sw0, topY);
  }
  x.globalAlpha = 1;
  // плитка «кабанчик» до потолка; под шкафами её потом закроют сами шкафы
  const rows = 6, th = (topY - cabB) / rows, tw = th * 2.4;
  x.strokeStyle = 'rgba(0,0,0,.32)'; x.lineWidth = Math.max(1, H * 0.003);
  x.beginPath();
  for (let r = 0; topY - r * th > -th; r++) {
    const y = topY - (r + 1) * th;
    x.moveTo(0, y + th); x.lineTo(W, y + th);
    for (let xx = r % 2 ? -tw / 2 : 0; xx < W; xx += tw) { x.moveTo(xx, y); x.lineTo(xx, y + th); }
  }
  x.stroke();

  drawMirror(x, m, H, L, a);

  // Столешница (видна чуть сверху): световое пятно у стены
  const tg = x.createLinearGradient(0, topY, 0, edgeY);
  tg.addColorStop(0, L(0.55)); tg.addColorStop(1, L(0.18));
  x.fillStyle = '#18181a'; x.fillRect(0, topY, W, edgeY - topY);
  x.fillStyle = tg; x.fillRect(0, topY, W, edgeY - topY);

  // Настенные смесители над чашами
  SC.sinks.forEach((_, i) => drawFaucet(x, W, H, i, L));

  // Разделочная доска у стены и банка
  const bx = W * 0.1, bw = W * 0.1, bh = H * 0.22;
  x.fillStyle = '#1a1411';
  x.beginPath(); x.roundRect(bx, topY + H * 0.02 - bh, bw, bh, H * 0.02); x.fill();
  x.fillStyle = L(0.28); x.fill();
  x.fillStyle = '#0b0c0e'; x.beginPath(); x.arc(bx + bw / 2, topY + H * 0.02 - bh + H * 0.03, H * 0.012, 0, Math.PI * 2); x.fill();
  const jx = W * 0.26, jw = W * 0.045, jh = H * 0.1;
  x.fillStyle = '#0d0e10'; x.fillRect(jx, topY + H * 0.025 - jh, jw, jh);
  x.fillStyle = L(0.6); x.fillRect(jx, topY + H * 0.025 - jh, jw, Math.max(2, H * 0.008));

  // Чаши-«вазы» на столешнице и вода из кранов
  scene.taps.forEach((tap, i) => {
    tap.flow += (tap.open - tap.flow) * Math.min(1, dt / 140);  // напор меняется плавно
    drawBowl(x, W, H, i, hue, a, tm, tap.flow);
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

  drawOven(x, W, H, tm);

  // Верхние шкафы только по бокам: над мойкой свободно
  SC.cabs.forEach(([c0, c1]) => {
    const x0 = c0 * W, cw = (c1 - c0) * W, doors = Math.max(1, Math.round((c1 - c0) / 0.2));
    x.fillStyle = '#131417'; x.fillRect(x0, 0, cw, cabB);
    x.fillStyle = L(0.05); x.fillRect(x0, 0, cw, cabB);
    x.fillStyle = '#08090a';
    for (let i = 1; i < doors; i++) x.fillRect(x0 + cw * i / doors - 1, 0, 2, cabB);
    x.fillStyle = '#2a2c30';
    for (let i = 0; i < doors; i++) {
      const hx = x0 + cw * (i + (i % 2 ? 0.1 : 0.88)) / doors;  // ручки у стыка створок
      x.fillRect(hx - 1, cabB - H * 0.12, Math.max(2, W * 0.005), H * 0.07);
    }
    x.fillStyle = '#1c1d21'; x.fillRect(x0, cabB - H * 0.014, cw, H * 0.014);
  });
  // торцы шкафов со стороны мойки ловят свет ореола
  x.fillStyle = L(0.35);
  x.fillRect(gap0 - 2, 0, 2, cabB); x.fillRect(gap1, 0, 2, cabB);

  if (scene.wires) drawWiring(x, W, H, lin, tm);

  // Сама лента под нижним краем шкафов
  x.save();
  x.shadowColor = `rgba(${hue},${a})`; x.shadowBlur = H * 0.05 * a;
  x.fillStyle = a > 0.01 ? `rgba(${hue.map((v) => Math.round(v * 0.6 + 102))},${Math.min(1, a * 1.4)})` : '#1a1b1e';
  SC.cabs.forEach(([c0, c1]) => x.fillRect(c0 * W, cabB, (c1 - c0) * W, Math.max(2, H * 0.007)));
  x.restore();
}

// Большое круглое зеркало: RGB-ореол сзади (та же лента по контуру), тёмное стекло, тонкая рама
function drawMirror(x, m, H, L, a) {
  const { x: mx, y: my, r } = m;
  x.save();
  if (a > 0.01) {
    const halo = x.createRadialGradient(mx, my, r * 0.96, mx, my, r * 1.35);
    halo.addColorStop(0, L(1)); halo.addColorStop(0.35, L(0.55)); halo.addColorStop(1, L(0));
    x.fillStyle = halo; x.beginPath(); x.arc(mx, my, r * 1.35, 0, Math.PI * 2); x.fill();
  }
  x.beginPath(); x.arc(mx, my, r, 0, Math.PI * 2); x.save(); x.clip();
  const g = x.createLinearGradient(mx, my - r, mx, my + r);
  g.addColorStop(0, '#171a1e'); g.addColorStop(1, '#0b0d10');
  x.fillStyle = g; x.fillRect(mx - r, my - r, 2 * r, 2 * r);
  // в зеркале — освещённая кухня за спиной: мягкий отсвет, линия столешницы и край проёма
  const rg = x.createRadialGradient(mx - r * 0.3, my + r * 0.25, r * 0.1, mx, my, r * 1.1);
  rg.addColorStop(0, L(0.38)); rg.addColorStop(1, L(0.06));
  x.fillStyle = rg; x.fillRect(mx - r, my - r, 2 * r, 2 * r);
  x.fillStyle = L(0.25); x.fillRect(mx - r, my + r * 0.52, 2 * r, r * 0.05);
  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(mx + r * 0.35, my - r, r * 0.08, 2 * r);
  // диагональный блик на стекле
  x.fillStyle = 'rgba(255,255,255,.07)';
  x.beginPath();
  x.moveTo(mx - r, my - r * 0.05); x.lineTo(mx - r * 0.05, my - r);
  x.lineTo(mx + r * 0.3, my - r); x.lineTo(mx - r, my + r * 0.3);
  x.fill();
  x.restore();
  // тонкая чёрная рама
  x.lineWidth = Math.max(2, H * 0.01); x.strokeStyle = '#0a0a0b';
  x.beginPath(); x.arc(mx, my, r, 0, Math.PI * 2); x.stroke();
  x.restore();
}

function drawFaucet(x, W, H, i, L) {
  const g = faucetGeom(i, W, H), w = W * 0.011, cy = (g.bodyTop + g.bodyBot) / 2;
  x.save();
  x.fillStyle = '#0a0a0b';
  x.beginPath(); x.arc(g.bodyX, cy, w * 0.95, 0, Math.PI * 2); x.fill();          // розетка на стене
  x.beginPath(); x.roundRect(g.bodyX - w / 2, g.bodyTop, w, g.bodyBot - g.bodyTop, w * 0.3); x.fill();  // корпус
  // излив: из стены вперёд и дугой вниз над чашей
  x.lineCap = 'round'; x.strokeStyle = '#0a0a0b'; x.lineWidth = w * 0.7;
  x.beginPath(); x.moveTo(g.bodyX, g.bodyBot - w * 0.4); x.quadraticCurveTo(g.ex, g.bodyBot - w * 0.4, g.ex, g.ey); x.stroke();
  // блики от ленты сверху
  x.strokeStyle = L(0.6); x.lineWidth = w * 0.18;
  x.beginPath(); x.moveTo(g.bodyX, g.bodyBot - w * 0.65); x.quadraticCurveTo(g.ex, g.bodyBot - w * 0.65, g.ex - w * 0.25, g.ey - w); x.stroke();
  x.fillStyle = L(0.5); x.fillRect(g.bodyX - w / 2, g.bodyTop, w, Math.max(1, H * 0.003));
  x.restore();
}

// Белая керамическая чаша на столешнице: свет ленты падает сверху, бока в тени
function drawBowl(x, W, H, i, hue, a, tm, flow) {
  const g = faucetGeom(i, W, H), topY = SC.topY * H;
  const bw = g.bowlW, cx = g.sx, rimY = g.rimY, rimH = H * 0.03, baseY = topY + H * 0.022;
  const ceramic = (al) => `rgb(${hue.map((v) => Math.round(24 + v * 0.9 * a * al))})`;
  x.save();
  x.fillStyle = 'rgba(0,0,0,.35)';  // тень на столешнице
  x.beginPath(); x.ellipse(cx, baseY, bw * 0.42, H * 0.012, 0, 0, Math.PI * 2); x.fill();
  // корпус
  x.beginPath();
  x.moveTo(cx - bw / 2, rimY);
  x.bezierCurveTo(cx - bw / 2, rimY + (baseY - rimY) * 0.9, cx - bw * 0.3, baseY, cx, baseY);
  x.bezierCurveTo(cx + bw * 0.3, baseY, cx + bw / 2, rimY + (baseY - rimY) * 0.9, cx + bw / 2, rimY);
  x.closePath();
  const bg = x.createLinearGradient(0, rimY, 0, baseY);
  bg.addColorStop(0, ceramic(0.95)); bg.addColorStop(1, ceramic(0.45));
  x.fillStyle = bg; x.fill();
  const sg = x.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  sg.addColorStop(0, 'rgba(0,0,0,.35)'); sg.addColorStop(0.3, 'rgba(0,0,0,0)');
  sg.addColorStop(0.75, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.4)');
  x.fillStyle = sg; x.fill();
  // проём: ближняя стенка изнутри в тени, дальняя освещена
  x.beginPath(); x.ellipse(cx, rimY, bw / 2 * 0.94, rimH / 2, 0, 0, Math.PI * 2);
  const ig = x.createLinearGradient(0, rimY - rimH / 2, 0, rimY + rimH / 2);
  ig.addColorStop(0, ceramic(0.3)); ig.addColorStop(1, ceramic(0.75));
  x.fillStyle = ig; x.fill();
  if (flow > 0.01) drawWater(x, W, H, g, flow, hue, a, tm, rimH);
  // передняя кромка
  x.lineWidth = Math.max(1, H * 0.004); x.strokeStyle = ceramic(1);
  x.beginPath(); x.ellipse(cx, rimY, bw / 2, rimH / 2, 0, 0, Math.PI); x.stroke();
  x.restore();
}

function drawWater(x, W, H, g, f, hue, a, tm, rimH) {
  const y0 = g.ey, y1 = g.rimY + rimH * 0.15, len = y1 - y0;
  const w = W * (0.002 + 0.005 * f);
  // вода почти бесцветная, но отражает свет ленты
  const col = [0, 1, 2].map((k) => Math.round(170 + 60 * (1 - a) + (hue[k] - 170) * a * 0.55));
  x.save();
  // струя с лёгким колыханием
  x.beginPath();
  const seg = 10;
  const edge = (s, side) => {
    const y = y0 + len * s / seg;
    const wob = Math.sin(y * 0.08 + tm * 0.018) * w * 0.18 * (s / seg);
    return [g.ex + side * w * (1 - 0.25 * s / seg) / 2 + wob, y];
  };
  for (let s = 0; s <= seg; s++) { const [px, py] = edge(s, -1); if (s === 0) x.moveTo(px, py); else x.lineTo(px, py); }
  for (let s = seg; s >= 0; s--) { const [px, py] = edge(s, 1); x.lineTo(px, py); }
  x.closePath();
  const sg = x.createLinearGradient(g.ex - w, 0, g.ex + w, 0);
  sg.addColorStop(0, `rgba(${col},${0.25 + 0.3 * f})`);
  sg.addColorStop(0.45, `rgba(${col.map((v) => Math.min(255, v + 50))},${0.55 + 0.35 * f})`);
  sg.addColorStop(1, `rgba(${col},${0.25 + 0.3 * f})`);
  x.fillStyle = sg; x.fill();
  // бегущие вниз блики
  x.fillStyle = `rgba(255,255,255,${0.35 * f})`;
  for (let k = 0; k < 4; k++) {
    const p = (tm * 0.0018 * (0.6 + f) + k / 4) % 1;
    x.fillRect(g.ex - w * 0.15, y0 + p * len, w * 0.3, len * 0.08);
  }
  // круги на воде внутри чаши
  x.beginPath(); x.ellipse(g.sx, g.rimY, g.bowlW / 2 * 0.92, rimH / 2 * 0.9, 0, 0, Math.PI * 2); x.clip();
  for (let k = 0; k < 3; k++) {
    const p = (tm * 0.0012 + k / 3) % 1;
    x.strokeStyle = `rgba(${col},${(1 - p) * 0.55 * f})`;
    x.lineWidth = Math.max(1, H * 0.003);
    x.beginPath(); x.ellipse(g.ex, y1, W * 0.008 + p * W * 0.03 * (0.5 + f), rimH * (0.12 + p * 0.3), 0, 0, Math.PI * 2); x.stroke();
  }
  x.restore();
}

// Духовка во второй секции нижних шкафов: через тонированное стекло видно индейку
function drawOven(x, W, H, tm) {
  const lowY = (SC.edgeY + 0.03) * H;
  const ox = 0.2 * W + 2, ow = 0.2 * W - 4, oy = lowY + H * 0.004, oh = H - oy - H * 0.004;
  const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono');
  x.save();
  // корпус из тёмной нержавейки
  const body = x.createLinearGradient(0, oy, 0, oy + oh);
  body.addColorStop(0, '#27292d'); body.addColorStop(1, '#151619');
  x.fillStyle = body; x.beginPath(); x.roundRect(ox, oy, ow, oh, H * 0.006); x.fill();
  // панель: дисплей температуры и две ручки
  x.fillStyle = '#050607'; x.beginPath(); x.roundRect(ox + ow * 0.36, oy + oh * 0.035, ow * 0.28, oh * 0.12, H * 0.004); x.fill();
  x.fillStyle = '#ff9a3c'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `600 ${Math.max(8, oh * 0.085)}px ${mono}`;
  x.fillText('180°', ox + ow * 0.5, oy + oh * 0.097);
  [0.15, 0.85].forEach((k) => {
    x.fillStyle = '#3a3d42'; x.beginPath(); x.arc(ox + ow * k, oy + oh * 0.095, oh * 0.05, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#8b9096'; x.fillRect(ox + ow * k - 1, oy + oh * 0.05, 2, oh * 0.04);
  });
  // ручка дверцы
  x.fillStyle = '#6f747b'; x.beginPath(); x.roundRect(ox + ow * 0.12, oy + oh * 0.18, ow * 0.76, oh * 0.03, oh * 0.015); x.fill();

  // стекло дверцы
  const gx = ox + ow * 0.08, gy = oy + oh * 0.26, gw = ow * 0.84, gh = oh * 0.64;
  x.beginPath(); x.roundRect(gx, gy, gw, gh, H * 0.01); x.save(); x.clip();
  // камера: тёплый свет лампы
  const cav = x.createLinearGradient(0, gy, 0, gy + gh);
  cav.addColorStop(0, '#6b3310'); cav.addColorStop(1, '#241006');
  x.fillStyle = cav; x.fillRect(gx, gy, gw, gh);
  const lamp = x.createRadialGradient(gx + gw * 0.5, gy, gw * 0.05, gx + gw * 0.5, gy + gh * 0.3, gw * 0.7);
  lamp.addColorStop(0, 'rgba(255,190,110,.55)'); lamp.addColorStop(1, 'rgba(255,150,60,0)');
  x.fillStyle = lamp; x.fillRect(gx, gy, gw, gh);
  // верхний ТЭН мерцает
  const glow = 0.65 + 0.25 * Math.sin(tm * 0.004);
  x.strokeStyle = `rgba(255,${Math.round(90 + 40 * glow)},40,${glow})`; x.lineWidth = Math.max(1.5, gh * 0.025);
  x.beginPath();
  for (let k = 0; k <= 8; k++) { const px = gx + gw * (0.1 + 0.1 * k), py = gy + gh * (k % 2 ? 0.1 : 0.05); if (k) x.lineTo(px, py); else x.moveTo(px, py); }
  x.stroke();
  // решётка и противень
  x.strokeStyle = 'rgba(160,160,160,.5)'; x.lineWidth = Math.max(1, gh * 0.015);
  x.beginPath(); x.moveTo(gx, gy + gh * 0.8); x.lineTo(gx + gw, gy + gh * 0.8); x.stroke();
  x.fillStyle = '#1a1512'; x.beginPath(); x.roundRect(gx + gw * 0.14, gy + gh * 0.72, gw * 0.72, gh * 0.09, gh * 0.03); x.fill();

  // индейка: румяная тушка, две ножки с косточками, блеск жира
  const cx = gx + gw * 0.5, cy = gy + gh * 0.55, rx = gw * 0.2, ry = gh * 0.2;
  const tb = x.createRadialGradient(cx - rx * 0.25, cy - ry * 0.4, rx * 0.1, cx, cy, rx * 1.1);
  tb.addColorStop(0, '#f0a857'); tb.addColorStop(0.45, '#b8621f'); tb.addColorStop(1, '#4e2308');
  x.fillStyle = tb; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,240,210,.35)';
  x.beginPath(); x.ellipse(cx - rx * 0.3, cy - ry * 0.45, rx * 0.28, ry * 0.12, -0.3, 0, Math.PI * 2); x.fill();
  // ножки спереди по бокам, косточки торчат вверх-наружу
  const leg = (dir) => {
    x.save();
    x.translate(cx + dir * rx * 0.72, cy + ry * 0.25);
    x.rotate(dir * 0.7);
    const lg = x.createRadialGradient(-dir * rx * 0.08, -ry * 0.1, 1, 0, 0, rx * 0.55);
    lg.addColorStop(0, '#e4964a'); lg.addColorStop(1, '#6a3310');
    x.fillStyle = lg; x.beginPath(); x.ellipse(0, 0, rx * 0.3, ry * 0.62, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f3e6cc';
    x.fillRect(-rx * 0.045, -ry * 1.05, rx * 0.09, ry * 0.5);
    x.beginPath(); x.arc(-rx * 0.06, -ry * 1.08, rx * 0.065, 0, Math.PI * 2); x.arc(rx * 0.06, -ry * 1.08, rx * 0.065, 0, Math.PI * 2); x.fill();
    x.restore();
  };
  leg(-1); leg(1);
  // горячий воздух над птицей
  x.strokeStyle = 'rgba(255,220,180,.12)'; x.lineWidth = Math.max(1, gh * 0.012);
  for (let k = 0; k < 3; k++) {
    const bx = cx + (k - 1) * rx * 0.6;
    x.beginPath();
    for (let s = 0; s <= 10; s++) {
      const py = cy - ry * 1.1 - s * gh * 0.035;
      const px = bx + Math.sin(s * 0.9 + tm * 0.004 + k) * gw * 0.015;
      if (s) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.stroke();
  }
  // тонированное стекло: видно, но приглушённо, плюс диагональный блик
  x.fillStyle = 'rgba(8,6,5,.3)'; x.fillRect(gx, gy, gw, gh);
  x.fillStyle = 'rgba(255,255,255,.06)';
  x.beginPath(); x.moveTo(gx, gy + gh * 0.55); x.lineTo(gx + gw * 0.45, gy); x.lineTo(gx + gw * 0.62, gy); x.lineTo(gx, gy + gh * 0.8); x.fill();
  x.restore();
  x.strokeStyle = '#0b0c0e'; x.lineWidth = Math.max(2, H * 0.006);
  x.beginPath(); x.roundRect(gx, gy, gw, gh, H * 0.01); x.stroke();
  x.restore();
}

// «Проводка»: полупрозрачные шкафы, коробка с электроникой, БП и кабели
function drawWiring(x, W, H, lin, tm) {
  const cabB = SC.cabB * H;
  const box = { x: 0.2 * W, y: 0.15 * H, w: 0.15 * W, h: 0.11 * H };   // в левом шкафу
  const psu = { x: 0.04 * W, y: 0.13 * H, w: 0.12 * W, h: 0.09 * H };
  const lw = Math.max(1.5, H * 0.005);
  const hot = (key) => now() - scene.flash[key] < 350;
  x.save();
  x.fillStyle = 'rgba(4,5,7,.6)';   // шкафы «на просвет»
  SC.cabs.forEach(([c0, c1]) => x.fillRect(c0 * W, 0, (c1 - c0) * W, cabB));
  x.lineCap = 'round'; x.lineJoin = 'round';

  const line = (pts, color, width, dash) => {
    x.strokeStyle = color; x.lineWidth = width; x.setLineDash(dash || []);
    x.beginPath(); pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
    x.setLineDash([]);
  };
  // 230 В в розетку над шкафами и 12 В от БП к коробке
  line([[psu.x + psu.w / 2, psu.y], [psu.x + psu.w / 2, 0]], '#9aa0a8', lw);
  line([[psu.x + psu.w, psu.y + psu.h * 0.55], [box.x, psu.y + psu.h * 0.55]], '#E08A4F', lw * 1.3);
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
  // энкодер: кабель спрятан в стене над зеркалом (пунктир), подсвечивается, когда крутят
  const kx = SC.knob[0] * W, ky = SC.knob[1] * H, topRun = 0.08 * H;
  line([[kx, ky], [kx, topRun], [box.x + box.w * 0.9, topRun], [box.x + box.w * 0.9, box.y]], hot('enc') ? '#ff9a55' : 'rgba(200,205,210,.7)', lw, [lw * 2, lw * 2]);
  // ИК-приёмник на кромке шкафа
  const ix = SC.irX * W;
  line([[ix, cabB - H * 0.01], [ix, box.y + box.h * 0.7], [box.x + box.w, box.y + box.h * 0.7]], hot('ir') ? '#ff5a6e' : 'rgba(200,205,210,.7)', lw);
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
  pill(x, t('wire.mains'), psu.x + psu.w / 2 + W * 0.012, H * 0.098, fs, 'left');  // под подписью ленты
  pill(x, t('wire.strip'), box.x - W * 0.012, box.y + box.h + H * 0.04, fs, 'right');
  pill(x, t('wire.enc'), W * 0.975, ky - H * 0.12, fs, 'right');  // над ручкой энкодера
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
