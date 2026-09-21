// Построчная трассировка: какие строки rgb_strip.ino и bridge.py выполняются при каждом действии.
// Строки ищутся по кусочкам текста (a — начало, b — конец диапазона), а не по номерам,
// поэтому правки в исходниках не ломают подсветку. tools/check.mjs проверяет, что всё находится.
const LINES = { ino: SRC.ino.split('\n'), py: SRC.py.split('\n') };

function findRange(st) {
  const L = LINES[st.f];
  let from = 0;
  if (st.after) from = L.findIndex((l) => l.includes(st.after));
  const a = L.findIndex((l, i) => i >= from && l.includes(st.a));
  if (a < 0) return null;
  let b = a;
  if (st.b) { b = L.findIndex((l, i) => i >= a && l.trim().startsWith(st.b)); if (b < 0) b = a; }
  return [a, b];
}

// n — ключ перевода пояснения (i18n.js), v — подстановки в него
const S = {
  report: [
    { f: 'ino', a: 'if (reportPending && now', n: 'tr.report1' },
    { f: 'ino', a: 'void report() {', b: 'lastReport = millis();', n: 'tr.report2' },
    { f: 'py', a: 'def handle_line(self, line):', b: 'self.publish_state()', n: 'tr.report3' },
    { f: 'py', a: 'def publish_state(self):', b: 'self.mqtt.publish(self.topic("state")', n: 'tr.report4' },
  ],
  changed: (ms) => ({ f: 'ino', a: 'void changed(unsigned long ms, bool save) {', b: 'lastChange = fadeStart;',
    n: ms === 'transition' ? 'tr.changedTr' : 'tr.changed', v: { ms } }),
  render: { f: 'ino', a: 'void render(unsigned long now) {', b: 'analogWrite(PIN_LED[i]', n: 'tr.render' },
};
const IR_CASES = {
  toggle: ['case A_TOGGLE:', 'break;', 'tr.irToggle'],
  up: ['case A_BRI_UP:', 'return;', 'tr.irUp'],
  down: ['case A_BRI_DOWN:', 'return;', 'tr.irDown'],
  color: ['case A_COLOR:', 'break;', 'tr.irColor'],
  effect: ['case A_EFFECT:', 'break;', 'tr.irEffect'],
};
const TRACES = {
  encoder: () => [
    { f: 'ino', a: 'void encoderIsr() {', b: 'acc = 0;', n: 'tr.enc1' },
    { f: 'ino', a: 'void readEncoder() {', b: 'if (d != 0) stepBrightness', n: 'tr.enc2' },
    { f: 'ino', a: 'void stepBrightness(', b: 'changed(ms, true);', n: 'tr.enc3' },
    S.changed(80), S.render, ...S.report],
  button: () => [
    { f: 'ino', a: 'void readButton(', b: 'changed(LOCAL_FADE_MS, true);', n: 'tr.btn' },
    S.changed(300), S.render, ...S.report],
  ir: (k) => {
    const c = IR_CASES[k.a];
    const steps = [
      { f: 'ino', a: 'void readIr() {', b: 'bool repeat', n: 'tr.ir1' },
      { f: 'ino', a: 'Serial.print(F("IR "));', b: 'Serial.println(d.command, HEX);', n: 'tr.ir2' },
      { f: 'ino', a: 'if (d.address == IR_ADDRESS) {', b: 'handleAction(k);', n: 'tr.ir3' },
      { f: 'ino', a: c[0], b: c[1], after: 'void handleAction', n: c[2] },
    ];
    if (k.a === 'up' || k.a === 'down') steps.push({ f: 'ino', a: 'void stepBrightness(', b: 'changed(ms, true);', n: 'tr.irShared' });
    else steps.push({ f: 'ino', a: 'changed(LOCAL_FADE_MS, true);', after: 'void handleAction', n: 'tr.irEnd' });
    return [...steps, S.changed(300), ...S.report];
  },
  irUnknown: () => [
    { f: 'ino', a: 'void readIr() {', b: 'bool repeat', n: 'tr.unk1' },
    { f: 'ino', a: 'Serial.print(F("IR "));', b: 'Serial.println(d.command, HEX);', n: 'tr.unk2' },
    { f: 'ino', a: 'if (d.address == IR_ADDRESS) {', b: 'handleAction(k);', n: 'tr.unk3' },
    { f: 'py', a: 'elif parts[0] == "IR":', b: 'log.info("ИК-код', n: 'tr.unk4' }],
  ha: () => [
    { f: 'py', a: 'def on_message(', b: 'self.handle_command(json.loads(payload))', n: 'tr.ha1' },
    { f: 'py', a: 'def handle_command(', b: 'self.send(f"S {', n: 'tr.ha2' },
    { f: 'py', a: 'def send(self, line):', b: 'self.ser.write(', n: 'tr.ha3' },
    { f: 'ino', a: 'void readSerial() {', b: 'if (lineLen > 0) handleCommand(line);', n: 'tr.ha4' },
    { f: 'ino', a: "} else if (cmd[0] == 'S' &&", b: 'changed(ms, true);', after: 'void handleCommand', n: 'tr.ha5' },
    S.changed('transition'), S.render, ...S.report.slice(0, 3),
    { f: 'py', a: 'def publish_state(self):', b: 'self.mqtt.publish(self.topic("state")', n: 'tr.ha6' }],
  boot: () => [
    { f: 'ino', a: 'if (EEPROM.read(0) == EEPROM_MAGIC)', b: 'changed(1000, false);', n: 'tr.boot1' },
    { f: 'py', a: 'elif parts[0] == "READY":', b: 'log.info("Arduino запустилась")', n: 'tr.boot2' },
    ...S.report],
  eeprom: () => [
    { f: 'ino', a: 'if (savePending && now - lastChange', b: 'savePending = false;', n: 'tr.eeprom' }],
};

const trace = { name: null, steps: [], i: 0, timer: 0, busy: false, cur: null };
function runTrace(name, arg) {
  if (trace.busy && trace.name === name) return;
  if (name === 'eeprom' && trace.busy) return;
  clearTimeout(trace.timer);
  Object.assign(trace, { name, steps: TRACES[name](arg), i: 0, busy: true });
  traceStep();
}
function traceStep() {
  const st = trace.steps[trace.i];
  if (!st) { trace.busy = false; return; }
  trace.cur = st;
  $('#stepN').textContent = `${trace.i + 1}/${trace.steps.length} · ${st.f === 'ino' ? 'Arduino' : 'bridge.py'}`;
  $('#stepT').textContent = t(st.n, st.v);
  const r = findRange(st);
  if (r) showCode(st.f, r[0], r[1]);
  trace.i++;
  trace.timer = setTimeout(traceStep, Number($('#speed').value));
}

// ---------- Просмотр кода с подсветкой синтаксиса ----------
const KW = {
  ino: new Set('const void if else for while return switch case default break continue struct enum static volatile bool float int int8_t uint8_t uint16_t unsigned long char true false sizeof'.split(' ')),
  py: new Set('def class import from return if elif else for while try except with as in not and or is None True False self lambda pass raise'.split(' ')),
};
function hlLine(line, lang, state) {
  let out = '';
  if (lang === 'py' && state.doc) {
    const j = line.indexOf('"""');
    if (j < 0) return `<span class="t-c">${esc(line)}</span>`;
    state.doc = false;
    out += `<span class="t-c">${esc(line.slice(0, j + 3))}</span>`;
    line = line.slice(j + 3);
  }
  // Группы: комментарий, препроцессор (у Python пустая), строка, число, идентификатор
  const re = lang === 'ino'
    ? /(\/\/.*$)|(#\w+.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d[\dxA-Fa-f.]*\b)|([A-Za-z_]\w*)/g
    : /(#.*$)|((?!))|("""[\s\S]*?"""|"""[\s\S]*$|f?"(?:[^"\\]|\\.)*"|f?'(?:[^'\\]|\\.)*')|(\b\d[\d.]*\b)|([A-Za-z_]\w*)/g;
  let last = 0, m;
  while ((m = re.exec(line))) {
    out += esc(line.slice(last, m.index));
    const [tok, com, pre, str, num, id] = m;
    let cls = '';
    if (com) cls = 't-c';
    else if (pre) cls = 't-p';
    else if (str) { cls = 't-s'; if (lang === 'py' && /^"""/.test(str) && !/"""$/.test(str.slice(3))) state.doc = true; }
    else if (num) cls = 't-n';
    else if (id) cls = KW[lang].has(id) ? 't-k' : (line[m.index + tok.length] === '(' ? 't-f' : '');
    out += cls ? `<span class="${cls}">${esc(tok)}</span>` : esc(tok);
    last = m.index + tok.length;
  }
  return out + esc(line.slice(last));
}
const codeViews = {};
function buildCode(f) {
  const box = document.createElement('div');
  const state = { doc: false };
  box.innerHTML = LINES[f].map((l, i) => `<div class="ln-row"><span class="ln">${i + 1}</span><span>${hlLine(l, f, state) || ' '}</span></div>`).join('');
  box.hidden = true;
  $('#code').appendChild(box);
  codeViews[f] = { box, rows: box.children, hl: [] };
}
function selectFile(f) {
  for (const k in codeViews) codeViews[k].box.hidden = k !== f;
  document.querySelectorAll('.tab').forEach((tb) => tb.setAttribute('aria-selected', String(tb.dataset.f === f)));
}
function showCode(f, a, b) {
  selectFile(f);
  const v = codeViews[f];
  v.hl.forEach((r) => r.classList.remove('hl'));
  v.hl = [];
  for (let i = a; i <= b; i++) { v.rows[i].classList.add('hl'); v.hl.push(v.rows[i]); }
  const box = $('#code');
  box.scrollTo({ top: v.rows[a].offsetTop - box.clientHeight * 0.28, behavior: REDUCE ? 'auto' : 'smooth' });
}
