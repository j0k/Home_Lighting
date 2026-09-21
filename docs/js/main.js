// Главный цикл, панель «Память Arduino», смена языка и запуск.

let lastT = now(), memT = 0;
function frame() {
  requestAnimationFrame(frame);  // сначала планируем следующий кадр: ошибка в одном кадре не остановит анимацию
  const tm = now();              // не время из rAF: оно бывает раньше fadeStart
  const dt = tm - lastT; lastT = tm;
  fwLoop(tm);
  // ШИМ даёт линейный свет; для экрана переводим обратно в sRGB
  const lin = ard.pwm.map((v) => v / 255);
  const disp = lin.map((v) => Math.round(255 * Math.pow(v, 1 / 2.2)));
  const I = Math.max(...lin);
  drawRoom(disp, lin, tm, dt);
  drawScope(REDUCE ? 0 : dt);
  renderSchematic(lin, disp, I, dt);
  $('#roomSw').style.background = `rgb(${disp})`;
  $('#roomVal').textContent = ard.alive ? `${toHex(disp)} · ${t('room.light', { p: Math.round(I * 100) })}` : t('room.reboot');
  if (ard.st) {
    $('#briBig').textContent = ard.st.bri;
    $('#briBar').style.width = `${ard.st.bri / 2.55}%`;
    knobs.forEach((k) => k.setAttribute('aria-valuenow', ard.st.bri));
  }
  if (tm - memT > 100) { memT = tm; renderMem(tm); }
}

function renderMem(tm) {
  const s = ard.st;
  $('#chipArd').classList.toggle('off', !ard.alive);
  if (!s) return;
  const save = ard.savePending
    ? `true  // ${t('mem.saveIn', { s: Math.max(0, (FW.SAVE_DELAY_MS - (tm - ard.lastChange)) / 1000).toFixed(1) })}`
    : 'false';
  const e = eeprom.st;
  $('#mem').textContent =
`st.on      = ${s.on}
st.bri     = ${s.bri}
st.color   = {${s.color.join(', ')}}
st.effect  = ${s.effect}  // ${EFFECT_NAMES[s.effect]}
cur[]      = {${ard.cur.map((v) => v.toFixed(1)).join(', ')}}
analogWrite: D5=${ard.pwm[0]} D6=${ard.pwm[1]} D9=${ard.pwm[2]}
reportPending = ${ard.reportPending}
savePending   = ${save}
EEPROM[1..]   = on ${e.on}, bri ${e.bri}, {${e.color.join(',')}}, eff ${e.effect}`;
}

// ---------- Язык ----------
function applyLang() {
  document.documentElement.lang = LANG;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach((e) => (e.textContent = t(e.dataset.i18n)));
  document.querySelectorAll('[data-i18n-html]').forEach((e) => (e.innerHTML = t(e.dataset.i18nHtml)));
  document.querySelectorAll('[data-i18n-attr]').forEach((e) => e.dataset.i18nAttr.split('|').forEach((pair) => {
    const [attr, key] = pair.split(':');
    e.setAttribute(attr, t(key));
  }));
  document.querySelectorAll('.langs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === LANG)));
  document.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-label', t('ha.colorN', { hex: b.dataset.hex })));
  renderRemote();
  renderParts();
  renderBridgeBtn();
  renderHa();
  $('#stepT').textContent = trace.cur ? t(trace.cur.n, trace.cur.v) : t('step.idle');
}
function setLang(lang, fromUser) {
  LANG = lang;
  try { localStorage.setItem('lang', lang); } catch (e) { /* без сохранения */ }
  if (fromUser) {
    try {
      const u = new URL(location.href);
      u.searchParams.set('lang', lang);
      history.replaceState(null, '', u);
    } catch (e) { /* адрес не меняем */ }
  }
  applyLang();
}

// ---------- Запуск ----------
if (SHOT) document.body.classList.add('shot');
buildSchematic();
buildRemote();
buildHa();
buildCode('ino');
buildCode('py');
selectFile('ino');
knobs.forEach(bindKnob);
document.querySelectorAll('.tap').forEach(bindTap);
$('#encCw').onclick = () => detent(1);
$('#encCcw').onclick = () => detent(-1);
$('#encPress').onclick = encPress;
$('#btnReset').onclick = () => fwReset(t('lm.reset'));
$('#btnBridge').onclick = () => setBridge(!bridge.running);
$('#logClear').onclick = () => ($('#log').innerHTML = '');
$('#wiresBtn').onclick = () => {
  scene.wires = !scene.wires;
  $('#wiresBtn').setAttribute('aria-pressed', String(scene.wires));
};
document.querySelectorAll('.tab').forEach((tb) => (tb.onclick = () => selectFile(tb.dataset.f)));
document.querySelectorAll('.langs button').forEach((b) => (b.onclick = () => setLang(b.dataset.lang, true)));
setLang(LANG, false);
log('bridge.py', t('lm.portOpen'), 'pc');
fwBoot();
if (SHOT) setTap(1, 0.7);  // на превью из правого крана течёт вода
requestAnimationFrame(frame);
