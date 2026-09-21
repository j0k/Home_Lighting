"""Рисует docs/preview.png (1200x630) — картинку-превью для Telegram и других мессенджеров.
Нужен Pillow и numpy: pip install pillow numpy"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
LIGHT = np.array([255, 140, 40], dtype=float)  # тёплый оранжевый, как в симуляторе при старте
FONTS = Path("C:/Windows/Fonts")


def font(name, size, fallback="arial.ttf"):
    for n in (name, fallback):
        try:
            return ImageFont.truetype(str(FONTS / n), size)
        except OSError:
            continue
    return ImageFont.load_default()


def lit(alpha):
    """Цвет поверхности под лентой: тёмная основа + свет с заданной силой."""
    base = np.array([11, 12, 14], dtype=float)
    return tuple(int(v) for v in base * (1 - alpha) + LIGHT * alpha)


cab_b, top_y = int(H * 0.40), int(H * 0.72)
edge_y = top_y + int(H * 0.06)
img = Image.new("RGB", (W, H), (11, 12, 14))
px = np.array(img, dtype=float)

# Фартук: свет падает сверху вниз
for y in range(cab_b, top_y):
    t = (y - cab_b) / (top_y - cab_b)
    a = 0.95 - 0.55 * t ** 0.7
    px[y, :] = lit(a)
# Столешница
for y in range(top_y, edge_y):
    t = (y - top_y) / (edge_y - top_y)
    px[y, :] = np.array(lit(0.5 - 0.3 * t)) * 0.9
img = Image.fromarray(px.clip(0, 255).astype("uint8"))
d = ImageDraw.Draw(img)

# Плитка «кабанчик»
rows = 5
th = (top_y - cab_b) / rows
tw = th * 2.4
for r in range(rows):
    y = cab_b + r * th
    d.line([(0, y), (W, y)], fill=(0, 0, 0), width=2)
    x = -tw / 2 if r % 2 else 0
    while x < W:
        d.line([(x, y), (x, y + th)], fill=(0, 0, 0), width=2)
        x += tw
# Смягчаем швы: смешиваем с исходником
img = Image.blend(img, Image.fromarray(px.clip(0, 255).astype("uint8")), 0.55)
d = ImageDraw.Draw(img)

# Мойка и смеситель
sx, sw = int(W * 0.63), int(W * 0.2)
d.rounded_rectangle([sx - sw // 2, top_y + 8, sx + sw // 2, edge_y - 8], radius=8, fill=(6, 6, 7), outline=lit(0.45), width=2)
fy = cab_b + int((top_y - cab_b) * 0.28)
d.line([(sx, top_y + 6), (sx, fy + 40)], fill=(10, 10, 11), width=12)
d.arc([sx - 6, fy, sx + 86, fy + 80], start=180, end=360, fill=(10, 10, 11), width=12)
d.line([(sx + 80, fy + 40), (sx + 80, fy + 58)], fill=(10, 10, 11), width=12)

# Кромка и нижние шкафы
d.rectangle([0, edge_y, W, edge_y + 16], fill=(18, 18, 20))
d.line([(0, edge_y), (W, edge_y)], fill=lit(0.35), width=2)
low_y = edge_y + 16
d.rectangle([0, low_y, W, H], fill=(15, 16, 19))
for i in range(1, 5):
    d.rectangle([W * i // 5 - 1, low_y, W * i // 5 + 1, H], fill=(8, 9, 10))

# Верхние шкафы
d.rectangle([0, 0, W, cab_b], fill=(19, 20, 23))
for i in range(1, 6):
    d.rectangle([W * i // 6 - 1, 0, W * i // 6 + 1, cab_b], fill=(8, 9, 10))
d.rectangle([0, cab_b - 9, W, cab_b], fill=(28, 29, 33))

# Лента со свечением
glow = Image.new("RGB", (W, H), (0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.rectangle([0, cab_b, W, cab_b + 5], fill=tuple(int(v) for v in LIGHT))
glow = glow.filter(ImageFilter.GaussianBlur(14))
img = Image.fromarray(np.clip(np.array(img, dtype=int) + np.array(glow, dtype=int) * 2, 0, 255).astype("uint8"))
d = ImageDraw.Draw(img)
d.rectangle([0, cab_b, W, cab_b + 4], fill=(255, 196, 140))

# Ручка энкодера на фартуке
kx, ky, kr = int(W * 0.88), int((cab_b + top_y) / 2), 38
d.ellipse([kx - kr - 5, ky - kr - 5, kx + kr + 5, ky + kr + 5], fill=(12, 13, 15))
for i in range(36):
    col = (59, 62, 67) if i % 2 else (38, 40, 44)
    d.pieslice([kx - kr, ky - kr, kx + kr, ky + kr], i * 10, i * 10 + 10, fill=col)
d.ellipse([kx - kr * 0.72, ky - kr * 0.72, kx + kr * 0.72, ky + kr * 0.72], fill=(70, 73, 79))
d.line([(kx + 6, ky - 24), (kx + 2, ky - 8)], fill=(255, 154, 85), width=4)

# Текст на фасадах верхних шкафов
title = font("segoeuib.ttf", 64)
sub = font("segoeui.ttf", 30)
mono = font("consola.ttf", 24, "cour.ttf")
d.text((56, 58), "Стенд RGB-подсветки кухни", font=title, fill=(243, 245, 244))
d.text((58, 150), "Arduino · энкодер · ИК-пульт · Home Assistant", font=sub, fill=(185, 194, 191))

# Мини-осциллограф ШИМ на нижних шкафах
ox, oy = 56, low_y + 34
for i, (col, duty) in enumerate([((224, 65, 58), 0.75), ((34, 160, 97), 0.4), ((59, 111, 224), 0.12)]):
    y0 = oy + i * 30
    x, per = 0, 36
    pts = []
    while x < 300:
        on = x + per * duty
        pts += [(ox + x, y0), (ox + min(on, 300), y0), (ox + min(on, 300), y0 + 16), (ox + min(x + per, 300), y0 + 16), (ox + min(x + per, 300), y0)]
        x += per
    d.line(pts, fill=col, width=3)
d.text((W - 56, H - 44), "j0k.github.io/Home_Lighting", font=mono, fill=(150, 160, 157), anchor="rs")

out = Path(__file__).resolve().parent.parent / "docs" / "preview.png"
out.parent.mkdir(exist_ok=True)
img.save(out, optimize=True)
print(out)
