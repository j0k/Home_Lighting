// Проверка симулятора в headless Chrome: открывает страницу на трёх языках, крутит энкодер,
// жмёт пульт и HA, останавливает мост, открывает кран, и смотрит, что состояние меняется как в прошивке.
// Заодно ловит ошибки в консоли, непереведённые строки и потерянные строки трассировки.
//   node tools/check.mjs [папка для скриншотов, по умолчанию tools/.out]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, pageUrl, sleep } from './lib/chrome.mjs';

const outDir = process.argv[2] || 'tools/.out';
mkdirSync(outDir, { recursive: true });
const results = [];
const ok = (name, cond, info = '') => { results.push({ name, pass: !!cond, info }); };

const b = await launch({ width: 1400, height: 900 });
try {
  await b.open(pageUrl('?lang=ru'));
  await sleep(1500);
  const E = b.evaluate;

  // --- загрузка и плавное включение из EEPROM ---
  ok('Arduino загрузилась', await E('ard.alive'));
  ok('лента горит после загрузки', await E('Math.max(...ard.pwm) > 0'), await E('JSON.stringify(ard.pwm)'));
  ok('HA получил состояние', await E('ha.available && ha.state.state === "ON"'));

  // --- трассировка: каждый шаг каждого сценария находит свои строки в исходниках ---
  const missing = await E(`(() => {
    const names = ['encoder', 'button', 'irUnknown', 'ha', 'boot', 'eeprom'];
    const all = names.flatMap((n) => TRACES[n]());
    for (const a of ['toggle', 'up', 'down', 'color', 'effect']) all.push(...TRACES.ir({ a, arg: 1 }));
    return all.filter((s) => !findRange(s)).map((s) => s.f + ': ' + s.a);
  })()`);
  ok('все строки трассировки найдены', missing.length === 0, missing.join('; '));

  // --- энкодер: 3 щелчка = +24 ---
  const bri0 = await E('ard.st.bri');
  await E('detent(1); detent(1); detent(1)');
  await sleep(300);
  ok('энкодер: +3 щелчка = +24', await E('ard.st.bri') === Math.min(255, bri0 + 24), `${bri0} → ${await E('ard.st.bri')}`);
  await sleep(400);
  ok('HA увидел новую яркость', await E('ha.state.brightness') === await E('ard.st.bri'));

  // --- кнопка энкодера выключает и включает ---
  await E('encPress()');
  await sleep(600);
  ok('кнопка энкодера выключает', await E('ard.st.on === 0 && Math.max(...ard.pwm) === 0'));
  await E('encPress()');
  await sleep(600);
  ok('кнопка энкодера включает', await E('ard.st.on === 1 && Math.max(...ard.pwm) > 0'));

  // --- пульт: «1» = красный, «+» ярче, незнакомая кнопка ничего не меняет ---
  await E('irPress(0x0C, false)');
  await sleep(500);
  ok('пульт «1» → красный', await E('JSON.stringify(ard.st.color)') === '[255,0,0]');
  const bri1 = await E('ard.st.bri');
  await E('irPress(0x07, false)');
  await sleep(300);
  ok('пульт «−» → темнее на 16', await E('ard.st.bri') === Math.max(1, bri1 - 16));
  const before = await E('JSON.stringify(ard.st)');
  await E('irPress(0x45, false)');
  await sleep(300);
  ok('неназначенная кнопка не меняет состояние', await E('JSON.stringify(ard.st)') === before);

  // --- Home Assistant → мост → Arduino → обратно в HA ---
  await E('haSend({ state: "ON", color: { r: 0, g: 0, b: 255 } })');
  await sleep(1500);
  ok('HA → Arduino: синий', await E('JSON.stringify(ard.st.color)') === '[0,0,255]');
  ok('Arduino → HA: подтверждение', await E('ha.state.color.b === 255 && ha.state.color.r === 0'));

  // --- мост остановлен: HA недоступен, пульт по-прежнему работает ---
  await E('setBridge(false)');
  await sleep(300);
  ok('без моста HA недоступен', await E('!ha.available && !document.getElementById("haOffline").hidden'));
  await E('irPress(0x0C, false)');
  await sleep(400);
  ok('без моста пульт работает', await E('JSON.stringify(ard.st.color)') === '[255,0,0]');
  await E('setBridge(true)');
  await sleep(2500);
  ok('мост запущен снова: HA доступен', await E('ha.available'));

  // --- EEPROM: через 3 с тишины состояние сохраняется ---
  await sleep(3300);
  ok('EEPROM сохранил состояние', await E('JSON.stringify(eeprom.st) === JSON.stringify(ard.st)'));

  // --- краны и проводка ---
  await E('setTap(0, 1)');
  await sleep(800);
  ok('левый кран открыт, вода течёт', await E('scene.taps[0].flow > 0.9'));
  await E('setTap(0, 0)');
  await E('document.getElementById("wiresBtn").click()');
  await sleep(300);
  ok('режим «Проводка» включается', await E('scene.wires === true'));
  await b.screenshot(join(outDir, 'page-ru.png'));
  await E('document.getElementById("wiresBtn").click()');

  // --- языки: всё переведено, ключи не торчат ---
  const dictCheck = await E(`(() => {
    const ru = Object.keys(I18N.ru);
    return LANGS.map((l) => ({ l, missing: ru.filter((k) => !(k in I18N[l])) }));
  })()`);
  dictCheck.forEach(({ l, missing }) => ok(`словарь ${l}: все ключи есть`, missing.length === 0, missing.join(', ')));
  for (const lang of ['en', 'fr', 'ru']) {
    await E(`setLang('${lang}')`);
    await sleep(200);
    const raw = await E(`[...document.querySelectorAll('[data-i18n],[data-i18n-html]')]
      .filter((e) => { const k = e.dataset.i18n || e.dataset.i18nHtml; return k && e.textContent.trim() === k; })
      .map((e) => e.dataset.i18n || e.dataset.i18nHtml)`);
    ok(`язык ${lang}: нет непереведённых ключей`, raw.length === 0, raw.join(', '));
    ok(`язык ${lang}: заголовок и список компонентов`, await E(`document.documentElement.lang === '${lang}' && document.querySelectorAll('#plist details').length === PARTS.length`));
    if (lang !== 'ru') await b.screenshot(join(outDir, `page-${lang}.png`));
  }

  ok('нет ошибок в консоли', b.errors.length === 0, b.errors.join(' | '));
} catch (e) {
  ok('проверка дошла до конца', false, e.message);
} finally {
  await b.close();
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'OK  ' : 'FAIL'} ${r.name}${r.info && !r.pass ? '  — ' + r.info : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} проверок пройдено. Скриншоты: ${outDir}`);
process.exit(failed ? 1 : 0);
