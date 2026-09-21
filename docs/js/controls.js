// Всё, что можно потрогать: энкодер (две ручки), краны, ИК-пульт, карточка HA, журнал.

// ---------- Журнал Serial/MQTT ----------
function log(kind, msg, cls, dim) {
  const el = document.createElement('div');
  el.className = 'e' + (dim ? ' dim' : '');
  el.innerHTML = `<span class="tm">${((now() - T0) / 1000).toFixed(2)}</span><span class="k ${cls || ''}">${esc(kind)}</span><span class="m">${esc(msg)}</span>`;
  const box = $('#log');
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.appendChild(el);
  while (box.children.length > 250) box.firstChild.remove();
  if (stick) box.scrollTop = box.scrollHeight;
}
function onEepromSave() {
  const s = eeprom.st;
  log('Arduino', `EEPROM.put(1, st) → on=${s.on} bri=${s.bri} color=${s.color.join(',')} effect=${s.effect}`, 'fw');
  const e = $('#eeprom');
  e.classList.add('flash');
  setTimeout(() => e.classList.remove('flash'), 700);
  runTrace('eeprom');
}

// ---------- Вращение мышью/пальцем: общий код для энкодера и кранов ----------
// onDelta(градусы по часовой), onClick() — короткое нажатие без поворота
function makeRotatable(el, { onDelta, onClick }) {
  let drag = null;
  const angleAt = (e) => {
    const r = el.getBoundingClientRect();
    return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2) * 180 / Math.PI;
  };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); drag = { a: angleAt(e), moved: 0, t: now() }; });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const a = angleAt(e);
    let d = a - drag.a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    drag.a = a; drag.moved += Math.abs(d);
    onDelta(d);
  });
  el.addEventListener('pointerup', () => { if (drag && drag.moved < 5 && now() - drag.t < 400) onClick(); drag = null; });
  el.addEventListener('pointercancel', () => (drag = null));
}

// ---------- Энкодер: ручка в панели и ручка на кухне крутятся синхронно ----------
const knobs = [$('#knob'), $('#knobScene')];
let knobAngle = 0, schKnobAngle = 0;
function detent(dir) {
  knobAngle += dir * 18;
  schKnobAngle += dir * 18;
  knobs.forEach((k) => (k.querySelector('.rot').style.transform = `rotate(${knobAngle}deg)`));
  $('#schKnob').setAttribute('transform', `rotate(${schKnobAngle} 86 222)`);
  // квадратура: при вращении по часовой первым меняется CLK, против — DT
  const [first, second] = dir > 0 ? ['w-clk', 'w-dt'] : ['w-dt', 'w-clk'];
  packet(first, { color: 'var(--accent)', dur: 200 });
  setTimeout(() => packet(second, { color: 'var(--accent)', dur: 200 }), 70);
  scene.flash.enc = now();
  if (!ard.alive) return;
  ard.encDelta += dir;
  runTrace('encoder');
}
function encPress() {
  knobs.forEach((k) => k.classList.add('pressed'));
  setTimeout(() => knobs.forEach((k) => k.classList.remove('pressed')), 150);
  packet('w-sw', { color: 'var(--accent)', dur: 220 });
  scene.flash.enc = now();
  if (!ard.alive) return;
  setTimeout(fwButton, 30);
  runTrace('button');
}
function bindKnob(knob) {
  let acc = 0;  // 18° = один щелчок (20 щелчков на оборот, как у KY-040)
  makeRotatable(knob, {
    onDelta: (d) => {
      acc += d;
      while (acc >= 18) { acc -= 18; detent(1); }
      while (acc <= -18) { acc += 18; detent(-1); }
    },
    onClick: encPress,
  });
  knob.addEventListener('wheel', (e) => { e.preventDefault(); detent(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  knob.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); detent(1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); detent(-1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); encPress(); }
  });
}

// ---------- Краны двойной мойки: поворот рычага на 90° = полный напор ----------
function setTap(i, open) {
  const tap = scene.taps[i];
  tap.open = clamp(open, 0, 1);
  const el = document.querySelector(`.tap[data-tap="${i}"]`);
  el.querySelector('.lever').style.transform = `rotate(${tap.open * 90}deg)`;
  el.setAttribute('aria-valuenow', Math.round(tap.open * 100));
}
function bindTap(el) {
  const i = Number(el.dataset.tap);
  const pos = tapPosition(i);
  el.style.left = pos.left + '%';
  el.style.top = pos.top + '%';
  makeRotatable(el, {
    onDelta: (d) => setTap(i, scene.taps[i].open + d / 90),
    onClick: () => setTap(i, scene.taps[i].open > 0 ? 0 : 1),
  });
  el.addEventListener('wheel', (e) => { e.preventDefault(); setTap(i, scene.taps[i].open + (e.deltaY < 0 ? 0.1 : -0.1)); }, { passive: false });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setTap(i, scene.taps[i].open + 0.1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setTap(i, scene.taps[i].open - 0.1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTap(i, scene.taps[i].open > 0 ? 0 : 1); }
  });
}

// ---------- ИК-пульт ----------
function irPress(code, repeat) {
  const led = $('#irLed');
  led.classList.add('on');
  setTimeout(() => led.classList.remove('on'), 70);
  const beam = $('#irBeam');
  beam.classList.remove('go'); void beam.getBBox(); beam.classList.add('go');
  const n = repeat ? 1 : 4;
  for (let i = 0; i < n; i++) setTimeout(() => packet('w-ir', { color: '#ff5a6e', dur: 200 }), i * 45);
  scene.flash.ir = now();
  if (!ard.alive) return;
  setTimeout(() => fwIr(code, repeat), 70);
  if (repeat) return;
  const k = IR_KEYS.get(code);
  if (k) runTrace('ir', k); else runTrace('irUnknown');
}
function buildRemote() {
  const keysEl = $('#keys');
  for (const [label, code] of REMOTE) {
    const b = document.createElement('button');
    const k = IR_KEYS.get(code);
    b.type = 'button';
    b.className = 'key' + (k ? '' : ' unmapped');
    b.textContent = label;
    b.dataset.code = code;
    b.dataset.label = label;
    if (k && k.a === 'color') {
      const dot = document.createElement('span');
      dot.className = 'pc';
      dot.style.background = `rgb(${PRESETS[k.arg]})`;
      b.appendChild(dot);
    }
    // удержание: как настоящий NEC-пульт, повтор каждые 110 мс после паузы 400 мс
    let hold = 0, rep = 0;
    const stop = () => { clearTimeout(hold); clearInterval(rep); b.classList.remove('down'); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      irPress(code, false);
      hold = setTimeout(() => (rep = setInterval(() => irPress(code, true), 110)), 400);
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irPress(code, e.repeat); } });
    keysEl.appendChild(b);
  }
}
function renderRemote() {
  document.querySelectorAll('.key').forEach((b) => {
    const code = Number(b.dataset.code), k = IR_KEYS.get(code);
    const what = !k ? t('ir.none') : k.a === 'color' ? PRESET_NAMES[LANG][k.arg] : k.a === 'effect' ? EFFECT_NAMES[k.arg] : t('ir.' + k.a);
    b.title = `0x${code.toString(16).toUpperCase().padStart(2, '0')}: ${what}`;
    b.setAttribute('aria-label', `${b.dataset.label}: ${what}`);
  });
}

// ---------- Карточка Home Assistant ----------
const HA_SWATCHES = [[255, 140, 40], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [150, 0, 255], [0, 255, 200]];
let briDragging = false;
function buildHa() {
  const swBox = $('#haSwatches');
  HA_SWATCHES.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = `rgb(${c})`;
    b.dataset.c = c.join(',');
    b.dataset.hex = toHex(c);
    b.onclick = () => haSend({ state: 'ON', color: { r: c[0], g: c[1], b: c[2] } });
    swBox.insertBefore(b, $('#haColor'));
  });
  $('#haColor').addEventListener('change', (e) => {
    const v = e.target.value;
    haSend({ state: 'ON', color: { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) } });
  });
  $('#haToggle').onclick = () => haSend({ state: ha.state && ha.state.state === 'ON' ? 'OFF' : 'ON' });
  $('#haBri').addEventListener('pointerdown', () => (briDragging = true));
  $('#haBri').addEventListener('change', (e) => { briDragging = false; haSend({ state: 'ON', brightness: Number(e.target.value) }); });
  $('#haEffect').addEventListener('change', (e) => haSend({ state: 'ON', effect: e.target.value }));
}
function renderHa() {
  $('#haOffline').hidden = ha.available;
  const s = ha.state;
  if (!s) return;
  const on = s.state === 'ON';
  $('#haToggle').setAttribute('aria-checked', String(on));
  $('#haSub').textContent = on
    ? `${t('ha.on')} · ${Math.round(s.brightness / 2.55)}% · ${s.effect !== 'none' ? s.effect : toHex([s.color.r, s.color.g, s.color.b])}`
    : t('ha.off');
  if (!briDragging) $('#haBri').value = s.brightness;
  $('#haEffect').value = s.effect;
  const cur = [s.color.r, s.color.g, s.color.b].join(',');
  document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('sel', b.dataset.c === cur && s.effect === 'none'));
}
