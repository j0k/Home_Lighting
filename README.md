# Подсветка кухни: RGB-лента на Arduino + энкодер + ИК-пульт + Home Assistant

**Симулятор:** https://juri-konoplev.pro/Home_Lighting/ ([EN](https://juri-konoplev.pro/Home_Lighting/?lang=en) · [FR](https://juri-konoplev.pro/Home_Lighting/?lang=fr)).
Кухня с двойной мойкой, энкодер, ИК-пульт, Home Assistant, режим «Проводка», схема подключения
и построчная трассировка кода прошивки и моста.

```
firmware/rgb_strip/rgb_strip.ino   прошивка Arduino (лента, энкодер, ИК, EEPROM, serial)
bridge/bridge.py                   мост serial <-> MQTT, сущность light в HA через Discovery
docs/                              сайт симулятора (GitHub Pages раздаёт эту папку)
  index.html, css/style.css
  js/util.js, i18n.js              общие мелочи, переводы RU/EN/FR
  js/firmware.js, bridge.js        порт прошивки и моста на JS
  js/trace.js                      какие строки кода выполняются при каждом действии
  js/schematic.js, scene.js        схема (SVG) и кухня (canvas)
  js/controls.js, parts.js, main.js  ручки, пульт, HA, список компонентов, запуск
  js/sources.js                    исходники .ino/.py для просмотра кода (генерируется)
  preview.png                      превью для Telegram (генерируется)
tools/                             сборка и проверка (Node 22+, Chrome или Edge)
```

### Симулятор: сборка и проверка

```bash
node tools/build.mjs     # после правок firmware/ или bridge/: обновить docs/js/sources.js
node tools/check.mjs     # прогнать сценарии в headless Chrome на трёх языках + скриншоты в tools/.out
node tools/preview.mjs   # переснять docs/preview.png (страница в режиме ?shot=preview)
```

Страницу можно открыть и прямо с диска: `docs/index.html`.

## Детали

Цены и варианты замены: раздел «Компоненты и стоимость» внизу симулятора.

| Что | Сколько | Примечание |
|---|---|---|
| Arduino Nano / Uno | 1 | |
| RGB-лента 12 В, общий анод (4 провода: +12V, R, G, B) | ~3 м | 5050, 60 LED/м ≈ 14 Вт/м; над раковиной IP65 |
| Блок питания 12 В | 1 | с запасом 20–30%: на 3 м ≈ 5 А |
| MOSFET IRLZ44N (или IRLB8721) | 3 | именно logic-level (буква L), иначе от 5 В не откроется полностью |
| Резистор 220 Ом | 3 | между пином и затвором |
| Резистор 10 кОм | 3 | затвор → GND, чтобы лента не мигала при загрузке |
| Энкодер KY-040 | 1 | |
| ИК-приёмник VS1838B / TSOP38238 + пульт NEC | 1 | подойдёт пульт из набора Arduino |

## Подключение

| Arduino | Куда |
|---|---|
| D5 → 220 Ом → затвор Q1 | сток Q1 → R− ленты |
| D6 → 220 Ом → затвор Q2 | сток Q2 → G− ленты |
| D9 → 220 Ом → затвор Q3 | сток Q3 → B− ленты |
| GND | исток всех MOSFET и GND блока питания (**общая земля обязательна**) |
| D2 / D3 / D4 | CLK / DT / SW энкодера (+ на 5V, GND на GND) |
| D7 | OUT ИК-приёмника (VCC на 5V, GND на GND) |
| USB | компьютер, на котором запущен `bridge.py` |

+12V блока питания идёт прямо на +12V ленты. 12 В на пины Arduino не подавать.
Пины 3 и 11 для ленты не годятся: их Timer2 занят библиотекой IRremote.

## Прошивка

1. Arduino IDE → Менеджер библиотек → установить **IRremote** (версия 4.x).
2. Открыть `firmware/rgb_strip/rgb_strip.ino`, выбрать плату и порт, загрузить.
3. Монитор порта на 115200: должно появиться `READY` и `STATE ...`.

**Свой пульт.** Нажимайте кнопки, в мониторе порта появятся строки `IR NEC 0x0 0x45`. Впишите адрес в
`IR_ADDRESS`, а команды в таблицу `IR_KEYS`.
**Энкодер крутится не в ту сторону.** Поменяйте местами провода CLK и DT.

## Home Assistant

Нужен MQTT-брокер (аддон Mosquitto) и интеграция MQTT в HA.

```powershell
cd bridge
pip install -r requirements.txt
python bridge.py --serial COM3 --mqtt-host 192.168.1.10 --mqtt-user mqtt --mqtt-password ****
```

В HA сама появится сущность «Подсветка комнаты» с яркостью, цветом, эффектами `rainbow` / `breathe`
и поддержкой `transition`. Изменения с пульта и энкодера тоже видны в HA: Arduino сообщает о каждом.

Мост должен работать постоянно на том компьютере, куда воткнута Arduino. Для автозапуска
в Windows используйте Планировщик заданий (при входе в систему, `pythonw.exe bridge.py ...`).
Открытие порта перезагружает Nano, это нормально: состояние хранится в EEPROM.

Если HA стоит на Raspberry Pi или мини-ПК, Arduino можно подключить прямо к нему и запускать мост там.
Если держать ПК включённым неудобно, есть вариант без моста: ESP8266/ESP32 с ESPHome вместо Arduino.
