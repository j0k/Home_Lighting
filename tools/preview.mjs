// Снимает картинку-превью для Telegram и соцсетей: docs/preview.png, 1200×630.
// Это настоящая страница в режиме ?shot=preview (кухня + осциллограф), а не отдельный рисунок.
//   node tools/preview.mjs
import { launch, pageUrl, sleep } from './lib/chrome.mjs';

const b = await launch({ width: 1200, height: 630 });
try {
  await b.open(pageUrl('?shot=preview&lang=ru'));
  await sleep(2200);  // дождаться плавного включения ленты и напора воды
  await b.screenshot('docs/preview.png', { x: 0, y: 0, width: 1200, height: 630 });
  if (b.errors.length) throw new Error('Ошибки на странице:\n' + b.errors.join('\n'));
  console.log('written docs/preview.png');
} finally {
  await b.close();
}
