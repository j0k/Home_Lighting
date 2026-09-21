// Порт firmware/rgb_strip/rgb_strip.ino на JS: те же константы, та же логика, те же имена.
const FW = { ENC_STEP: 8, IR_STEP: 16, LOCAL_FADE_MS: 300, ENC_FADE_MS: 80, REPORT_INTERVAL_MS: 150,
  SAVE_DELAY_MS: 3000, RAINBOW_PERIOD_MS: 20000, BREATHE_PERIOD_MS: 4000, GAMMA: 2.2 };
const PRESETS = [[255,255,255],[255,0,0],[0,255,0],[0,0,255],[255,80,0],[255,200,0],[0,255,200],[150,0,255],[255,0,120],[255,140,40]];
const EFFECT_NAMES = ['none', 'rainbow', 'breathe'];
const IR_KEYS = new Map([
  [0x43, { a: 'toggle' }], [0x15, { a: 'up' }], [0x07, { a: 'down' }],
  [0x09, { a: 'effect', arg: 1 }], [0x19, { a: 'effect', arg: 2 }],
  [0x16, { a: 'color', arg: 0 }], [0x0C, { a: 'color', arg: 1 }], [0x18, { a: 'color', arg: 2 }],
  [0x5E, { a: 'color', arg: 3 }], [0x08, { a: 'color', arg: 4 }], [0x1C, { a: 'color', arg: 5 }],
  [0x5A, { a: 'color', arg: 6 }], [0x42, { a: 'color', arg: 7 }], [0x52, { a: 'color', arg: 8 }],
  [0x4A, { a: 'color', arg: 9 }],
]);
// Раскладка типового 21-кнопочного пульта из наборов Arduino
const REMOTE = [['CH−',0x45],['CH',0x46],['CH+',0x47],['⏮',0x44],['⏭',0x40],['⏯',0x43],['−',0x07],['+',0x15],['EQ',0x09],
  ['0',0x16],['100+',0x19],['200+',0x0D],['1',0x0C],['2',0x18],['3',0x5E],['4',0x08],['5',0x1C],['6',0x5A],['7',0x42],['8',0x52],['9',0x4A]];

// Что «записано в EEPROM» при открытии страницы: тёплый оранжевый, яркость 190
const eeprom = { st: { on: 1, bri: 190, color: [255, 140, 40], effect: 0 } };
const ard = { alive: false, st: null, cur: [0,0,0], from: [0,0,0], fadeStart: 0, fadeMs: 0,
  reportPending: false, savePending: false, lastReport: -1e9, lastChange: 0, encDelta: 0, pwm: [0,0,0] };

function fwChanged(ms, save) {
  ard.from = ard.cur.slice();
  ard.fadeStart = now();
  ard.fadeMs = ms;
  ard.reportPending = true;
  if (save) { ard.savePending = true; ard.lastChange = ard.fadeStart; }
}
function fwReport() {
  const s = ard.st;
  ard.reportPending = false;
  ard.lastReport = now();
  serialOut(`STATE ${s.on} ${s.bri} ${s.color.join(' ')} ${s.effect}`);
}
function fwStepBrightness(delta, ms) {
  if (!ard.st.on) ard.st.on = 1;
  else ard.st.bri = clamp(ard.st.bri + delta, 1, 255);
  fwChanged(ms, true);
}
function hsvToRgb(h, v) {
  const f = h * 6, sector = Math.floor(f) % 6, tt = f - Math.floor(f), up = v * tt, down = v * (1 - tt);
  return [[v, up, 0], [down, v, 0], [0, v, up], [0, down, v], [up, 0, v], [v, 0, down]][sector];
}
function fwComputeTarget(tm) {
  const s = ard.st;
  let scale = s.on ? s.bri / 255 : 0;
  if (s.effect === 1) return hsvToRgb((tm % FW.RAINBOW_PERIOD_MS) / FW.RAINBOW_PERIOD_MS, 255 * scale);
  if (s.effect === 2) {
    const phase = (tm % FW.BREATHE_PERIOD_MS) / FW.BREATHE_PERIOD_MS;
    scale *= 0.05 + 0.95 * (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  }
  return s.color.map((c) => c * scale);
}
// Один проход loop() прошивки
function fwLoop(tm) {
  if (!ard.alive) { ard.pwm = [0, 0, 0]; return; }
  if (ard.encDelta) { const d = ard.encDelta; ard.encDelta = 0; fwStepBrightness(d * FW.ENC_STEP, FW.ENC_FADE_MS); }
  if (ard.reportPending && tm - ard.lastReport >= FW.REPORT_INTERVAL_MS) fwReport();
  if (ard.savePending && tm - ard.lastChange >= FW.SAVE_DELAY_MS) {
    eeprom.st = structuredClone(ard.st);
    ard.savePending = false;
    onEepromSave();
  }
  const target = fwComputeTarget(tm);
  // clamp снизу: время кадра может оказаться чуть раньше fadeStart
  const k = ard.fadeMs === 0 ? 1 : clamp((tm - ard.fadeStart) / ard.fadeMs, 0, 1);
  for (let i = 0; i < 3; i++) {
    ard.cur[i] = ard.from[i] + (target[i] - ard.from[i]) * k;
    ard.pwm[i] = Math.round(Math.pow(ard.cur[i] / 255, FW.GAMMA) * 255);
  }
}
function fwBoot() {
  ard.alive = true;
  ard.cur = [0, 0, 0];
  ard.st = structuredClone(eeprom.st);
  ard.savePending = false;
  ard.lastReport = -1e9;
  serialOut('READY');
  fwChanged(1000, false);
  runTrace('boot');
}
function fwReset(reason) {
  ard.alive = false;
  ard.cur = [0, 0, 0];
  log('Arduino', reason, 'fw');
  setTimeout(fwBoot, 500);
}
function fwButton() {
  ard.st.on = ard.st.on ? 0 : 1;
  fwChanged(FW.LOCAL_FADE_MS, true);
}
function fwIr(cmd, repeat) {
  if (!repeat) serialOut(`IR NEC 0x0 0x${cmd.toString(16).toUpperCase()}`);
  const k = IR_KEYS.get(cmd);
  if (!k || (repeat && k.a !== 'up' && k.a !== 'down')) return;
  const s = ard.st;
  switch (k.a) {
    case 'toggle': s.on = s.on ? 0 : 1; break;
    case 'up': fwStepBrightness(FW.IR_STEP, FW.LOCAL_FADE_MS); return;
    case 'down': fwStepBrightness(-FW.IR_STEP, FW.LOCAL_FADE_MS); return;
    case 'color': s.color = PRESETS[k.arg].slice(); s.effect = 0; s.on = 1; break;
    case 'effect': s.effect = s.effect === k.arg ? 0 : k.arg; s.on = 1; break;
  }
  fwChanged(FW.LOCAL_FADE_MS, true);
}
function fwSerialIn(line) {
  if (!ard.alive) return;
  const m = line.match(/^S (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)$/);
  if (!m) { serialOut('ERR ' + line); return; }
  const [on, bri, r, g, b, eff, ms] = m.slice(1).map(Number);
  ard.st = { on: on ? 1 : 0, bri: clamp(bri, 1, 255), color: [r, g, b].map((v) => clamp(v, 0, 255)), effect: eff === 1 || eff === 2 ? eff : 0 };
  fwChanged(ms, true);
}
// Serial.print…: строка уходит по USB к мосту (если он запущен)
function serialOut(line) {
  log(t(bridge.running ? 'lk.ardPc' : 'lk.ardClosed'), line, 'ard', !bridge.running);
  packet('w-usb', { color: 'var(--t-s)', dur: 260 });
  flashText('usbText', line);
  if (bridge.running) setTimeout(() => bridgeLine(line), 120);
}
