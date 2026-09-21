"""Мост Arduino (serial) <-> Home Assistant (MQTT) для RGB-ленты.

Состоянием владеет Arduino (её ещё крутят энкодером и переключают пультом), поэтому мост
только пересылает команды из HA и публикует то, что Arduino присылает в строках STATE.
Сущность light появляется в HA сама через MQTT Discovery.
"""

import argparse
import json
import logging
import threading
import time

import paho.mqtt.client as mqtt
import serial

EFFECTS = {"none": 0, "rainbow": 1, "breathe": 2}
EFFECT_NAMES = {v: k for k, v in EFFECTS.items()}
DEFAULT_TRANSITION_S = 0.5
HA_STATUS_TOPIC = "homeassistant/status"

log = logging.getLogger("bridge")


class Bridge:
    def __init__(self, args):
        self.args = args
        self.state = None  # последнее STATE от Arduino; None — Arduino не на связи
        self.ser = None
        self.ser_lock = threading.Lock()

        self.mqtt = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"{args.id}-bridge")
        if args.mqtt_user:
            self.mqtt.username_pw_set(args.mqtt_user, args.mqtt_password)
        self.mqtt.will_set(self.topic("availability"), "offline", retain=True)
        self.mqtt.on_connect = self.on_connect
        self.mqtt.on_message = self.on_message

    def topic(self, suffix):
        return f"{self.args.id}/{suffix}"

    # ---------- MQTT ----------

    def on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            log.error("MQTT: не удалось подключиться: %s", reason_code)
            return
        log.info("MQTT: подключено")
        client.subscribe(self.topic("set"))
        client.subscribe(HA_STATUS_TOPIC)
        self.publish_discovery()
        self.publish_state()

    def on_message(self, client, userdata, msg):
        payload = msg.payload.decode(errors="ignore")
        if msg.topic == HA_STATUS_TOPIC:
            if payload == "online":  # HA перезапустился — напомним о себе
                self.publish_discovery()
                self.publish_state()
            return
        try:
            self.handle_command(json.loads(payload))
        except (ValueError, KeyError, TypeError) as e:
            log.warning("Не разобрал команду %r: %s", payload, e)

    def publish_discovery(self):
        config = {
            "name": None,  # имя сущности = имя устройства
            "unique_id": f"{self.args.id}_light",
            "schema": "json",
            "command_topic": self.topic("set"),
            "state_topic": self.topic("state"),
            "availability_topic": self.topic("availability"),
            "brightness": True,
            "supported_color_modes": ["rgb"],
            "effect": True,
            "effect_list": list(EFFECTS),
            "device": {
                "identifiers": [self.args.id],
                "name": self.args.name,
                "manufacturer": "DIY",
                "model": "Arduino RGB strip",
            },
        }
        self.mqtt.publish(f"homeassistant/light/{self.args.id}/config", json.dumps(config), retain=True)

    def publish_state(self):
        online = self.state is not None
        self.mqtt.publish(self.topic("availability"), "online" if online else "offline", retain=True)
        if not online:
            return
        s = self.state
        r, g, b = s["color"]
        payload = {
            "state": "ON" if s["on"] else "OFF",
            "brightness": s["bri"],
            "color_mode": "rgb",
            "color": {"r": r, "g": g, "b": b},
            "effect": EFFECT_NAMES.get(s["effect"], "none"),
        }
        self.mqtt.publish(self.topic("state"), json.dumps(payload), retain=True)

    def handle_command(self, cmd):
        if self.state is None:
            log.warning("Arduino не на связи, команда пропущена: %s", cmd)
            return
        s = {**self.state, "color": list(self.state["color"])}
        if "state" in cmd:
            s["on"] = cmd["state"] == "ON"
        if "brightness" in cmd:
            s["bri"] = max(1, min(255, int(cmd["brightness"])))
        if "color" in cmd:
            s["color"] = [max(0, min(255, int(cmd["color"][k]))) for k in "rgb"]
            s["effect"] = 0
        if "effect" in cmd:
            s["effect"] = EFFECTS.get(cmd["effect"], 0)
        ms = int(float(cmd.get("transition", DEFAULT_TRANSITION_S)) * 1000)
        r, g, b = s["color"]
        # Состояние в HA обновится, когда Arduino подтвердит его строкой STATE.
        self.send(f"S {int(s['on'])} {s['bri']} {r} {g} {b} {s['effect']} {ms}")

    # ---------- Serial ----------

    def send(self, line):
        with self.ser_lock:
            if self.ser is None:
                log.warning("Порт закрыт, не отправлено: %s", line)
                return
            log.debug("-> %s", line)
            self.ser.write((line + "\n").encode())

    def handle_line(self, line):
        log.debug("<- %s", line)
        parts = line.split()
        if parts[0] == "STATE" and len(parts) == 7:
            on, bri, r, g, b, eff = map(int, parts[1:])
            self.state = {"on": bool(on), "bri": bri, "color": [r, g, b], "effect": eff}
            self.publish_state()
        elif parts[0] == "IR":
            log.info("ИК-код: %s", " ".join(parts[1:]))
        elif parts[0] == "READY":
            log.info("Arduino запустилась")
        else:
            log.warning("Arduino: %s", line)

    def run(self):
        self.mqtt.connect_async(self.args.mqtt_host, self.args.mqtt_port)
        self.mqtt.loop_start()
        while True:
            try:
                with serial.Serial(self.args.serial, 115200, timeout=1) as ser:
                    log.info("Порт %s открыт", self.args.serial)
                    with self.ser_lock:
                        self.ser = ser
                    while True:
                        line = ser.readline().decode(errors="ignore").strip()
                        if line:
                            self.handle_line(line)
            except serial.SerialException as e:
                log.error("Порт %s: %s. Повтор через 5 с", self.args.serial, e)
            with self.ser_lock:
                self.ser = None
            self.state = None
            self.publish_state()
            time.sleep(5)


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--serial", required=True, help="порт Arduino, например COM3 или /dev/ttyUSB0")
    p.add_argument("--mqtt-host", required=True)
    p.add_argument("--mqtt-port", type=int, default=1883)
    p.add_argument("--mqtt-user")
    p.add_argument("--mqtt-password")
    p.add_argument("--id", default="room_rgb", help="идентификатор устройства в MQTT/HA")
    p.add_argument("--name", default="Подсветка комнаты", help="имя устройства в HA")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        Bridge(args).run()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
