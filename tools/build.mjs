// Встраивает исходники прошивки и моста в симулятор: пишет docs/js/sources.js.
// Запускать после любой правки firmware/ или bridge/:  node tools/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
const sources = {
  ino: read('firmware/rgb_strip/rgb_strip.ino'),
  py: read('bridge/bridge.py'),
};
const out = join(root, 'docs/js/sources.js');
writeFileSync(out, `// Сгенерировано tools/build.mjs из firmware/ и bridge/ — руками не править.\nconst SRC = ${JSON.stringify(sources, null, 0)};\n`);
console.log('written', out);
