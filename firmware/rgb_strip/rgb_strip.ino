// RGB-лента (12V, общий анод) на Arduino Uno/Nano через 3 N-MOSFET.
// Управление: энкодер (яркость / вкл-выкл), ИК-пульт, serial-мост к Home Assistant.
// Состояние хранится здесь и сохраняется в EEPROM, так что пульт и энкодер работают и без ПК.
//
// Протокол serial (115200, по одной строке):
//   мост -> Arduino:  S on bri r g b effect ms   — задать состояние, переход за ms миллисекунд
//                     ?                          — прислать текущее состояние
//   Arduino -> мост:  READY                      — после старта
//                     STATE on bri r g b effect  — при любом изменении (откуда бы оно ни пришло)
//                     IR протокол адрес команда  — каждый принятый ИК-код (для настройки пульта)
//
// Библиотека: IRremote 4.x (Менеджер библиотек -> "IRremote" by shirriff, z3t0, ArminJo).

#include <EEPROM.h>
#include <IRremote.hpp>

// ---------- Пины ----------
// IRremote занимает Timer2, поэтому ШИМ на 3 и 11 недоступен — используем 5, 6 (Timer0) и 9 (Timer1).
const uint8_t PIN_LED[3] = {5, 6, 9};   // R, G, B -> затворы MOSFET
const uint8_t PIN_ENC_A = 2;            // CLK энкодера (прерывание)
const uint8_t PIN_ENC_B = 3;            // DT энкодера (прерывание)
const uint8_t PIN_ENC_BTN = 4;          // SW энкодера
const uint8_t PIN_IR = 7;               // OUT ИК-приёмника

// ---------- Настройки ----------
const uint8_t ENC_STEP = 8;             // шаг яркости за один щелчок энкодера
const uint8_t IR_STEP = 16;             // шаг яркости за одно нажатие +/- на пульте
const unsigned long LOCAL_FADE_MS = 300;  // плавность для кнопок и пульта
const unsigned long ENC_FADE_MS = 80;     // энкодер — быстрее, чтобы не было «резины»
const unsigned long REPORT_INTERVAL_MS = 150;
const unsigned long SAVE_DELAY_MS = 3000; // пишем в EEPROM через 3 с после последнего изменения
const unsigned long RAINBOW_PERIOD_MS = 20000;
const unsigned long BREATHE_PERIOD_MS = 4000;
const float GAMMA = 2.2;

enum Effect : uint8_t { NONE = 0, RAINBOW = 1, BREATHE = 2 };

// ---------- ИК-пульт ----------
// Коды ниже — для типового 21-кнопочного пульта из наборов Arduino (NEC, адрес 0x00).
// Для другого пульта: откройте Монитор порта, нажимайте кнопки и перепишите адрес и команды
// из строк "IR NEC 0x0 0x45".
enum Action : uint8_t { A_TOGGLE, A_BRI_UP, A_BRI_DOWN, A_COLOR, A_EFFECT };
struct IrKey { uint8_t command; Action action; uint8_t arg; };

const uint16_t IR_ADDRESS = 0x00;
const IrKey IR_KEYS[] = {
  {0x43, A_TOGGLE,   0},        // >||  вкл/выкл
  {0x15, A_BRI_UP,   0},        // +    ярче
  {0x07, A_BRI_DOWN, 0},        // -    темнее
  {0x09, A_EFFECT,   RAINBOW},  // EQ   радуга
  {0x19, A_EFFECT,   BREATHE},  // 100+ дыхание
  {0x16, A_COLOR,    0},        // 0    белый
  {0x0C, A_COLOR,    1},        // 1    красный
  {0x18, A_COLOR,    2},        // 2    зелёный
  {0x5E, A_COLOR,    3},        // 3    синий
  {0x08, A_COLOR,    4},        // 4    оранжевый
  {0x1C, A_COLOR,    5},        // 5    жёлтый
  {0x5A, A_COLOR,    6},        // 6    бирюзовый
  {0x42, A_COLOR,    7},        // 7    фиолетовый
  {0x52, A_COLOR,    8},        // 8    розовый
  {0x4A, A_COLOR,    9},        // 9    тёплый белый
};

const uint8_t PRESETS[][3] = {
  {255, 255, 255}, {255, 0, 0}, {0, 255, 0}, {0, 0, 255}, {255, 80, 0},
  {255, 200, 0},   {0, 255, 200}, {150, 0, 255}, {255, 0, 120}, {255, 140, 40},
};

// ---------- Состояние ----------
struct State {
  uint8_t on;
  uint8_t bri;       // 1..255
  uint8_t color[3];  // цвет на полной яркости
  uint8_t effect;
};

const uint8_t EEPROM_MAGIC = 0xA7;
State st = {0, 128, {255, 255, 255}, NONE};

float cur[3] = {0, 0, 0};   // то, что сейчас на выходах (до гаммы)
float from[3] = {0, 0, 0};  // откуда идёт плавный переход
unsigned long fadeStart = 0, fadeMs = 0;

bool reportPending = false, savePending = false;
unsigned long lastReport = 0, lastChange = 0;

volatile int8_t encDelta = 0;

char line[40];
uint8_t lineLen = 0;

void setup() {
  for (uint8_t i = 0; i < 3; i++) {
    pinMode(PIN_LED[i], OUTPUT);
    analogWrite(PIN_LED[i], 0);
  }
  pinMode(PIN_ENC_A, INPUT_PULLUP);
  pinMode(PIN_ENC_B, INPUT_PULLUP);
  pinMode(PIN_ENC_BTN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_ENC_A), encoderIsr, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_ENC_B), encoderIsr, CHANGE);

  IrReceiver.begin(PIN_IR, DISABLE_LED_FEEDBACK);
  Serial.begin(115200);

  if (EEPROM.read(0) == EEPROM_MAGIC) EEPROM.get(1, st);
  if (st.bri == 0) st.bri = 1;

  Serial.println(F("READY"));
  changed(1000, false);  // плавно включиться в сохранённое состояние и сообщить его мосту
}

void loop() {
  unsigned long now = millis();
  readSerial();
  readEncoder();
  readButton(now);
  readIr();

  if (reportPending && now - lastReport >= REPORT_INTERVAL_MS) report();
  if (savePending && now - lastChange >= SAVE_DELAY_MS) {
    EEPROM.update(0, EEPROM_MAGIC);
    EEPROM.put(1, st);  // put() перезаписывает только изменившиеся байты
    savePending = false;
  }

  render(now);
}

// ---------- Вывод на ленту ----------

void render(unsigned long now) {
  float target[3];
  computeTarget(now, target);
  float k = fadeMs == 0 ? 1.0 : min(1.0, (now - fadeStart) / (float)fadeMs);
  for (uint8_t i = 0; i < 3; i++) {
    cur[i] = from[i] + (target[i] - from[i]) * k;
    analogWrite(PIN_LED[i], (uint8_t)(pow(cur[i] / 255.0, GAMMA) * 255.0 + 0.5));
  }
}

void computeTarget(unsigned long now, float out[3]) {
  float scale = st.on ? st.bri / 255.0 : 0.0;
  if (st.effect == RAINBOW) {
    hsvToRgb((now % RAINBOW_PERIOD_MS) / (float)RAINBOW_PERIOD_MS, 255.0 * scale, out);
    return;
  }
  if (st.effect == BREATHE) {
    float phase = (now % BREATHE_PERIOD_MS) / (float)BREATHE_PERIOD_MS;
    scale *= 0.05 + 0.95 * (1.0 - cos(phase * 2.0 * PI)) / 2.0;
  }
  for (uint8_t i = 0; i < 3; i++) out[i] = st.color[i] * scale;
}

void hsvToRgb(float h, float v, float out[3]) {
  float f = h * 6.0;
  uint8_t sector = (uint8_t)f % 6;
  float t = f - (uint8_t)f;
  float up = v * t, down = v * (1.0 - t);
  switch (sector) {
    case 0: out[0] = v;    out[1] = up;   out[2] = 0;    break;
    case 1: out[0] = down; out[1] = v;    out[2] = 0;    break;
    case 2: out[0] = 0;    out[1] = v;    out[2] = up;   break;
    case 3: out[0] = 0;    out[1] = down; out[2] = v;    break;
    case 4: out[0] = up;   out[1] = 0;    out[2] = v;    break;
    default: out[0] = v;   out[1] = 0;    out[2] = down; break;
  }
}

// Вызывается после любого изменения st: запускает плавный переход, отчёт и отложенное сохранение.
void changed(unsigned long ms, bool save) {
  for (uint8_t i = 0; i < 3; i++) from[i] = cur[i];
  fadeStart = millis();
  fadeMs = ms;
  reportPending = true;
  if (save) {
    savePending = true;
    lastChange = fadeStart;
  }
}

void report() {
  Serial.print(F("STATE "));
  Serial.print(st.on);
  Serial.print(' ');
  Serial.print(st.bri);
  for (uint8_t i = 0; i < 3; i++) {
    Serial.print(' ');
    Serial.print(st.color[i]);
  }
  Serial.print(' ');
  Serial.println(st.effect);
  reportPending = false;
  lastReport = millis();
}

void stepBrightness(int delta, unsigned long ms) {
  if (!st.on) {
    st.on = 1;  // покрутили/нажали «ярче» на выключенной ленте — включаем
  } else {
    st.bri = constrain((int)st.bri + delta, 1, 255);
  }
  changed(ms, true);
}

// ---------- Энкодер ----------

void encoderIsr() {
  static const int8_t TABLE[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
  static uint8_t prev = 3;
  static int8_t acc = 0;
  uint8_t s = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
  acc += TABLE[(prev << 2) | s];
  prev = s;
  if (s == 3) {  // энкодер в фиксированном положении (щелчок)
    if (acc >= 2) encDelta++;
    else if (acc <= -2) encDelta--;
    acc = 0;
  }
}

void readEncoder() {
  noInterrupts();
  int8_t d = encDelta;
  encDelta = 0;
  interrupts();
  // Если яркость меняется «не в ту сторону» — поменяйте местами провода CLK и DT.
  if (d != 0) stepBrightness(d * ENC_STEP, ENC_FADE_MS);
}

void readButton(unsigned long now) {
  static bool lastStable = HIGH, lastRead = HIGH;
  static unsigned long changedAt = 0;
  bool r = digitalRead(PIN_ENC_BTN);
  if (r != lastRead) {
    lastRead = r;
    changedAt = now;
  }
  if (now - changedAt > 30 && r != lastStable) {
    lastStable = r;
    if (r == LOW) {
      st.on = !st.on;
      changed(LOCAL_FADE_MS, true);
    }
  }
}

// ---------- ИК ----------

void readIr() {
  if (!IrReceiver.decode()) return;
  IRData &d = IrReceiver.decodedIRData;
  bool repeat = d.flags & IRDATA_FLAGS_IS_REPEAT;

  if (!repeat) {
    Serial.print(F("IR "));
    Serial.print(getProtocolString(d.protocol));
    Serial.print(F(" 0x"));
    Serial.print(d.address, HEX);
    Serial.print(F(" 0x"));
    Serial.println(d.command, HEX);
  }

  if (d.address == IR_ADDRESS) {
    for (const IrKey &k : IR_KEYS) {
      if (k.command != d.command) continue;
      // Удержание кнопки обрабатываем только для яркости, иначе вкл/выкл «дребезжит».
      if (repeat && k.action != A_BRI_UP && k.action != A_BRI_DOWN) break;
      handleAction(k);
      break;
    }
  }
  IrReceiver.resume();
}

void handleAction(const IrKey &k) {
  switch (k.action) {
    case A_TOGGLE:
      st.on = !st.on;
      break;
    case A_BRI_UP:
      stepBrightness(IR_STEP, LOCAL_FADE_MS);
      return;
    case A_BRI_DOWN:
      stepBrightness(-IR_STEP, LOCAL_FADE_MS);
      return;
    case A_COLOR:
      memcpy(st.color, PRESETS[k.arg], 3);
      st.effect = NONE;
      st.on = 1;
      break;
    case A_EFFECT:
      st.effect = st.effect == k.arg ? NONE : k.arg;  // повторное нажатие выключает эффект
      st.on = 1;
      break;
  }
  changed(LOCAL_FADE_MS, true);
}

// ---------- Serial ----------

void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      line[lineLen] = '\0';
      if (lineLen > 0) handleCommand(line);
      lineLen = 0;
    } else if (lineLen < sizeof(line) - 1) {
      line[lineLen++] = c;
    }
  }
}

void handleCommand(const char *cmd) {
  int on, bri, r, g, b, eff;
  unsigned long ms;

  if (cmd[0] == '?') {
    report();
  } else if (cmd[0] == 'S' &&
             sscanf(cmd + 1, "%d %d %d %d %d %d %lu", &on, &bri, &r, &g, &b, &eff, &ms) == 7) {
    st.on = on ? 1 : 0;
    st.bri = constrain(bri, 1, 255);
    st.color[0] = constrain(r, 0, 255);
    st.color[1] = constrain(g, 0, 255);
    st.color[2] = constrain(b, 0, 255);
    st.effect = (eff == RAINBOW || eff == BREATHE) ? eff : NONE;
    changed(ms, true);
  } else {
    Serial.print(F("ERR "));
    Serial.println(cmd);
  }
}
