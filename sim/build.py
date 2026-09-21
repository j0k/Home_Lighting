"""Собирает docs/index.html для GitHub Pages: встраивает исходники прошивки и моста в template.html
и оборачивает страницу в полноценный документ с превью для Telegram и других мессенджеров (Open Graph)."""
import json
from pathlib import Path

SITE = "https://j0k.github.io/Home_Lighting/"
TITLE = "Стенд RGB-подсветки кухни"
DESCRIPTION = ("Интерактивный симулятор: крутите энкодер, жмите ИК-пульт и управляйте из Home Assistant, "
               "а на схеме и в коде Arduino видно, что происходит.")

HEAD = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{DESCRIPTION}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Home Lighting">
<meta property="og:title" content="{TITLE}">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:url" content="{SITE}">
<meta property="og:image" content="{SITE}preview.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ru_RU">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}preview.png">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23131417'/%3E%3Crect x='4' y='13' width='24' height='4' rx='2' fill='%23ff9a55'/%3E%3C/svg%3E">
<style>
  html {{ color-scheme: light dark; }}
  body {{ margin: 0; }}
  img {{ max-width: 100%; }}
  [hidden] {{ display: none !important; }}
</style>
"""

root = Path(__file__).resolve().parent
sources = {
    "ino": (root.parent / "firmware/rgb_strip/rgb_strip.ino").read_text(encoding="utf-8"),
    "py": (root.parent / "bridge/bridge.py").read_text(encoding="utf-8"),
}
data = json.dumps(sources, ensure_ascii=False).replace("</", r"<\/")
page = (root / "template.html").read_text(encoding="utf-8").replace("__SOURCES__", data, 1)

# template.html начинается с <title> и <style> (как у артефакта), дальше идёт разметка страницы
split = page.index("</style>") + len("</style>")
html = HEAD + page[:split] + "\n</head>\n<body>\n" + page[split:] + "\n</body>\n</html>\n"

out = root.parent / "docs" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8", newline="\n")
print(out, len(html), "bytes")
