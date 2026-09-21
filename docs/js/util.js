// Общие мелочи для всех модулей симулятора. Скрипты обычные (не ES-модули),
// чтобы страница открывалась и с диска через file://.
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);
const now = () => performance.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const T0 = now();
const CH_COLORS = ['var(--r)', 'var(--g)', 'var(--b)'];
// ?shot=preview — режим для картинки-превью (tools/preview.mjs): только кухня и осциллограф, 1200×630
const SHOT = new URLSearchParams(location.search).get('shot') === 'preview';
