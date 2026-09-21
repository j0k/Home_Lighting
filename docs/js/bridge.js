// Порт bridge/bridge.py: serial <-> MQTT. Плюс модель брокера и карточки Home Assistant.
const bridge = { running: true, state: null };
const ha = { available: false, state: null };

function bridgeLine(line) {
  if (!bridge.running) return;
  const p = line.split(' ');
  if (p[0] === 'STATE' && p.length === 7) {
    const [on, bri, r, g, b, eff] = p.slice(1).map(Number);
    bridge.state = { on: !!on, bri, color: [r, g, b], effect: eff };
    bridgePublishState();
  } else if (p[0] === 'IR') {
    log('bridge.py', t('lm.irCode') + p.slice(1).join(' '), 'pc');
  } else if (p[0] === 'READY') {
    log('bridge.py', t('lm.ready'), 'pc');
  } else {
    log('bridge.py', 'Arduino: ' + line, 'pc');
  }
}
function bridgePublishState() {
  const online = bridge.running && bridge.state !== null;
  if (!online) {
    mqtt('room_rgb/availability', 'offline', 'down');
    return;
  }
  const s = bridge.state;
  const payload = { state: s.on ? 'ON' : 'OFF', brightness: s.bri, color_mode: 'rgb',
    color: { r: s.color[0], g: s.color[1], b: s.color[2] }, effect: EFFECT_NAMES[s.effect] || 'none' };
  mqtt('room_rgb/state', JSON.stringify(payload), 'down', () => { ha.available = true; ha.state = payload; renderHa(); });
}
function bridgeCommand(cmd) {
  if (!bridge.running) return;
  if (!bridge.state) { log('bridge.py', t('lm.noArd'), 'pc'); return; }
  const s = { ...bridge.state, color: bridge.state.color.slice() };
  if ('state' in cmd) s.on = cmd.state === 'ON';
  if ('brightness' in cmd) s.bri = clamp(Math.trunc(cmd.brightness), 1, 255);
  if ('color' in cmd) { s.color = ['r', 'g', 'b'].map((k) => clamp(Math.trunc(cmd.color[k]), 0, 255)); s.effect = 0; }
  if ('effect' in cmd) s.effect = Math.max(0, EFFECT_NAMES.indexOf(cmd.effect));
  const ms = Math.trunc(parseFloat(cmd.transition ?? 0.5) * 1000);
  const line = `S ${s.on ? 1 : 0} ${s.bri} ${s.color.join(' ')} ${s.effect} ${ms}`;
  log(t('lk.pcArd'), line, 'pc');
  packet('w-usb', { color: 'var(--t-f)', dur: 260, reverse: true });
  flashText('usbText', line);
  setTimeout(() => fwSerialIn(line), 280);
}
// Команда из карточки HA: публикуется в room_rgb/set
function haSend(cmd) {
  if (!ha.available) return;
  const tr = $('#haTrans').value;
  if (tr !== '') cmd.transition = Number(tr);
  mqtt('room_rgb/set', JSON.stringify(cmd), 'up', () => bridgeCommand(cmd));
  runTrace('ha');
}
function mqtt(topic, payload, dir, done) {
  log(dir === 'up' ? 'HA → MQTT' : 'MQTT → HA', `${topic} ${payload}`, 'mq');
  flashText('mqttText', topic);
  const hops = dir === 'up' ? ['w-mq2', 'w-mq1'] : ['w-mq1', 'w-mq2'];
  packet(hops[0], { color: 'var(--t-k)', dur: 180, reverse: dir === 'up' });
  setTimeout(() => packet(hops[1], { color: 'var(--t-k)', dur: 180, reverse: dir === 'up' }), 180);
  if (done) setTimeout(done, 380);
}
function setBridge(running) {
  bridge.running = running;
  if (!running) {
    bridge.state = null;
    log('bridge.py', t('lm.stopped'), 'pc');
    log(t('lk.broker'), 'last will: room_rgb/availability offline', 'mq');
    ha.available = false;
    renderHa();
  } else {
    log('bridge.py', t('lm.portOpen'), 'pc');
    mqtt('homeassistant/light/room_rgb/config', '{"schema":"json","supported_color_modes":["rgb"],…}', 'down');
    fwReset(t('lm.dtr'));
  }
  renderBridgeBtn();
  $('#chipBridge').classList.toggle('off', !running);
}
function renderBridgeBtn() {
  $('#btnBridge').textContent = t(bridge.running ? 'btn.bridgeStop' : 'btn.bridgeStart');
}
