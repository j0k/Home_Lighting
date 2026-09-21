// Мини-клиент Chrome DevTools Protocol без зависимостей: запускает headless Chrome/Edge,
// открывает страницу и даёт send()/evaluate()/screenshot(). Нужен Node 22+ (встроенный WebSocket).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

export function pageUrl(query = '') {
  return pathToFileURL(resolve('docs/index.html')).href + query;
}

export async function launch({ width = 1400, height = 900, scale = 1 } = {}) {
  const exe = CANDIDATES.find((p) => p && existsSync(p));
  if (!exe) throw new Error('Не нашёл Chrome или Edge. Укажите путь в переменной CHROME.');
  const dir = mkdtempSync(join(tmpdir(), 'hl-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });

  let page;
  for (let i = 0; i < 100 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = list.find((t) => t.type === 'page');
    } catch { /* Chrome ещё стартует */ }
    if (!page) await sleep(100);
  }
  if (!page) { proc.kill(); throw new Error('Chrome не ответил на порту отладки'); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(m.error.message)); else res(m.result);
    } else listeners.forEach((f) => f(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const errors = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`.trim());
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function open(url) {
    const loaded = new Promise((res) => listeners.push((m) => m.method === 'Page.loadEventFired' && res()));
    await send('Page.navigate', { url });
    await loaded;
    await evaluate('document.fonts.ready.then(() => true)');
  }
  async function screenshot(path, clip) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !clip, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
  }
  async function close() {
    try { ws.close(); } catch { /* уже закрыт */ }
    proc.kill();
    await sleep(400);
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Chrome ещё держит файлы */ }
  }
  return { send, evaluate, open, screenshot, close, errors };
}
