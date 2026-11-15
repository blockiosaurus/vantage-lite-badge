#!/usr/bin/env python3
"""Draw the screens shots.lua recorded, as Solana OS would, into PNGs.

    python3 tools/screens/render.py tools/screens/out/shots.json tools/screens/out

These are renders, not captures: every object, position, text and colour
comes from the app's own draw calls, run on the badge's Lua 5.5 in the
harness; the drawing follows Solana OS's widgets (main/core/ui.c: 36 px list
rows with a green mark, the 16 px hint bar, the 22 px status bar, the
purple-to-green bar, the green toast) and its dark theme (main/core/theme.h).
The fonts differ: the badge uses ABC Diatype, licensed to the firmware only,
so this uses Inter and DejaVu Sans Mono. Needs Pillow and qrcode.
"""

import json
import os
import sys

import qrcode
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

S = 2  # render scale: 320x240 drawn at 640x480
W, H = 320, 240
STATUS_H = 22
ROOT_H = H - STATUS_H  # 218, ui.H
HINT_H = 16
ROW_H = 36

THEME = {
    "purple": 0x9945FF, "green": 0x14F195, "pink": 0xEB54BC, "lpurple": 0xB6B0FF,
    "blue": 0x64A8F2, "aqua": 0x80ECFF, "lime": 0xACFF9B, "yellow": 0xE8F180,
    "orange": 0xFF754A, "bg": 0x000000, "panel": 0x111116, "border": 0x2A2935,
    "text": 0xFFFFFF, "dim": 0x8E8C9E,
}
PANEL_HI = 0x1C1B26

FONT_DIR = "/usr/share/fonts"
SANS = os.path.join(FONT_DIR, "opentype/inter/Inter-Regular.otf")
SANS_MED = os.path.join(FONT_DIR, "opentype/inter/Inter-Medium.otf")
MONO = os.path.join(FONT_DIR, "truetype/dejavu/DejaVuSansMono.ttf")
_fonts = {}


def font(size):
    """Solana OS fonts: 12 is always mono; 14, 20, 32 are the sans."""
    if size not in _fonts:
        if size == 12:
            _fonts[size] = ImageFont.truetype(MONO, 11 * S)
        else:
            _fonts[size] = ImageFont.truetype(SANS_MED if size >= 20 else SANS, size * S)
    return _fonts[size]


def rgb(c, default="text"):
    if c is None:
        c = default
    if isinstance(c, str):
        c = THEME[c]
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255)


def line_h(size):
    return {12: 14, 14: 17, 20: 24, 32: 38}[size]


def fit(f, text, width):
    """Cut text to width with "...", as LVGL's DOTS long mode does."""
    if f.getlength(text) <= width:
        return text
    while text and f.getlength(text + "...") > width:
        text = text[:-1]
    return text + "..."


def wrap(f, text, width):
    lines, cur = [], ""
    for word in text.split(" "):
        trial = word if not cur else cur + " " + word
        if f.getlength(trial) <= width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


class Screen:
    def __init__(self):
        self.img = Image.new("RGB", (W * S, H * S), (0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def rect(self, x, y, w, h, colour, radius=0, outline=None):
        box = [x * S, y * S, (x + w) * S - 1, (y + h) * S - 1]
        if radius:
            self.d.rounded_rectangle(box, radius=radius * S, fill=colour, outline=outline, width=S if outline else 0)
        else:
            self.d.rectangle(box, fill=colour, outline=outline, width=S if outline else 0)

    def text(self, x, y, s, size, colour, anchor="la"):
        self.d.text((x * S, y * S), s, font=font(size), fill=colour, anchor=anchor)


def status_bar(sc):
    sc.rect(0, 0, W, STATUS_H, rgb("bg"))
    # Solana OS draws its logomark here; a plain dot stands in for it.
    sc.d.ellipse([8 * S, 5 * S, 20 * S, 17 * S], fill=rgb(0x2A2935))
    sc.text(30, 3, "Vantage Lite", 14, rgb("text"))
    sc.text(W - 6, 5, "87%", 12, rgb("text"), anchor="ra")
    # battery body and the Wi-Fi arcs, drawn simply
    bx = W - 6 - font(12).getlength("87%") / S - 22
    sc.rect(bx, 7, 16, 8, None, radius=2, outline=rgb("text"))
    sc.rect(bx + 2, 9, 10, 4, rgb("text"))
    wx, wy = W - 76, 15
    for r in (3, 6, 9):
        sc.d.arc([(wx - r) * S, (wy - r) * S, (wx + r) * S, (wy + r) * S], 225, 315, fill=rgb("dim"), width=S + 1)


def draw_label(sc, ox, oy, o):
    size = o.get("size") or 14
    f = font(size)
    colour = rgb(o.get("colour"))
    text = o.get("text") or ""
    w = o.get("w")
    lines = wrap(f, text, w * S) if w else [text]
    for i, ln in enumerate(lines):
        x = o["x"]
        if w and o.get("align") == "center":
            x = o["x"] + (w * S - f.getlength(ln)) / S / 2
        elif w and o.get("align") == "right":
            x = o["x"] + (w * S - f.getlength(ln)) / S
        sc.text(ox + x, oy + o["y"] + i * line_h(size), ln, size, colour)


def draw_list(sc, ox, oy, o):
    x, y, w, h = o["x"], o["y"], o["w"], o["h"]
    rows = o.get("rows") or []
    if isinstance(rows, dict):  # an empty Lua table encodes as {}
        rows = []
    if not rows:
        sc.text(ox + x + w / 2, oy + y + h / 2, "Nothing here yet", 14, rgb("dim"), anchor="mm")
        return
    visible = h // ROW_H
    sel = max(0, min(len(rows), o.get("sel") or 1) - 1)
    top = max(0, sel - visible + 1)
    for i in range(visible):
        idx = top + i
        if idx >= len(rows):
            break
        r = rows[idx]
        rx, ry = ox + x, oy + y + i * ROW_H
        if idx == sel:
            sc.rect(rx, ry, w - 6, ROW_H, rgb(PANEL_HI), radius=4)
            sc.rect(rx, ry + 4, 3, ROW_H - 8, rgb("green"))
        right = r.get("right") or ""
        if right:
            sc.text(rx + w - 6 - 4, ry + 4, right, 12, rgb("dim"), anchor="ra")
        sc.text(rx + 10, ry + 2, fit(font(14), r.get("title") or "", (w - 100) * S), 14, rgb("text"))
        sc.text(rx + 10, ry + 19, fit(font(12), r.get("sub") or "", (w - 20) * S), 12, rgb("dim"))
    if len(rows) > visible:
        track = visible * ROW_H
        bar = max(12, track * visible // len(rows))
        pos = (track - bar) * top // max(1, len(rows) - visible)
        sc.rect(ox + x + w - 3, oy + y + pos, 3, bar, rgb("purple"), radius=1)


def draw_bar(sc, ox, oy, o):
    x, y, w, h = ox + o["x"], oy + o["y"], o["w"], o["h"]
    sc.rect(x, y, w, h, rgb(PANEL_HI), radius=h / 2)
    fill = int(w * max(0, min(100, o.get("value") or 0)) / 100)
    if fill <= 0:
        return
    grad = Image.new("RGB", (fill * S, h * S))
    a, b = rgb("purple"), rgb("green")
    gd = ImageDraw.Draw(grad)
    for px in range(fill * S):
        t = px / max(1, fill * S - 1)
        gd.line([(px, 0), (px, h * S)], fill=tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3)))
    mask = Image.new("L", grad.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, grad.size[0] - 1, grad.size[1] - 1], radius=h * S // 2, fill=255)
    sc.img.paste(grad, (int(x * S), int(y * S)), mask)


def draw_canvas(sc, ox, oy, o):
    w, h = o["w"], o["h"]
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    draws = o.get("draws") or []
    if isinstance(draws, dict):
        draws = []
    for op in draws:
        kind = op[0]
        if kind == "p":
            ld.point((op[1], op[2]), fill=rgb(op[3]))
        elif kind == "l":
            ld.line([(op[1], op[2]), (op[3], op[4])], fill=rgb(op[5]))
        elif kind == "r":
            ld.rectangle([op[1], op[2], op[1] + op[3] - 1, op[2] + op[4] - 1], fill=rgb(op[5]))
    big = layer.resize((w * S, h * S), Image.NEAREST)
    sc.img.paste(big, ((ox + o["x"]) * S, (oy + o["y"]) * S), big)


def draw_qr(sc, ox, oy, o):
    size = o["size"]
    q = qrcode.QRCode(border=2, error_correction=qrcode.constants.ERROR_CORRECT_L, box_size=1)
    q.add_data(o["text"])
    q.make(fit=True)
    img = q.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((size * S, size * S), Image.NEAREST)
    sc.img.paste(img, ((ox + o["x"]) * S, (oy + o["y"]) * S))


BADGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "badge")


def draw_image(sc, ox, oy, o):
    """A bundled PNG, as Solana OS draws one: pixels under half opaque are
    see-through, the rest solid (no blending), scaled by whole pixels."""
    img = Image.open(os.path.join(BADGE_DIR, o["src"])).convert("RGBA")
    mask = img.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    k = (o.get("scale") or 1) * S
    big = img.resize((img.width * k, img.height * k), Image.NEAREST)
    sc.img.paste(big.convert("RGB"), ((ox + o["x"]) * S, (oy + o["y"]) * S), mask.resize(big.size, Image.NEAREST))


def draw_hint(sc, text):
    y = STATUS_H + ROOT_H - HINT_H
    sc.rect(0, y, W, HINT_H, rgb("panel"))
    sc.rect(0, y, W, 1, rgb("border"))
    sc.text(6, y + HINT_H / 2, text, 12, rgb("dim"), anchor="lm")


def draw_toast(sc, text):
    f = font(14)
    tw = f.getlength(text) / S
    w = min(W - 20, tw + 24)
    x = (W - w) / 2
    y = STATUS_H + ROOT_H - HINT_H - 34
    sc.rect(x, y, w, 25, rgb("green"), radius=12)
    sc.text(W / 2, y + 12.5, fit(f, text, (w - 24) * S), 14, rgb("bg"), anchor="mm")


def label_box(o):
    size = o.get("size") or 14
    f = font(size)
    text = o.get("text") or ""
    w = o.get("w")
    lines = wrap(f, text, w * S) if w else [text]
    width = w if w else f.getlength(text) / S
    if w and o.get("align") in ("center", "right"):
        used = max(f.getlength(ln) for ln in lines) / S
        x0 = o["x"] + (w - used) / (2 if o["align"] == "center" else 1)
        return (x0, o["y"], x0 + used, o["y"] + len(lines) * line_h(size))
    used = max(f.getlength(ln) for ln in lines) / S if w else width
    return (o["x"], o["y"], o["x"] + used, o["y"] + len(lines) * line_h(size))


def layout_problems(shot):
    """Labels that overlap each other or run into the hint bar (with these fonts)."""
    boxes = [(o, label_box(o)) for o in shot["objs"]
             if o["kind"] == "label" and o.get("visible", True) and o.get("text")]
    out = []
    limit = ROOT_H - HINT_H if shot.get("hint") else ROOT_H
    for o, (x0, y0, x1, y1) in boxes:
        if y1 > limit + 2:
            out.append(f"'{o['text'][:30]}' runs {y1 - limit:.0f}px into the hint bar")
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            a, b = boxes[i][1], boxes[j][1]
            if a[0] < b[2] - 1 and b[0] < a[2] - 1 and a[1] < b[3] - 3 and b[1] < a[3] - 3:
                out.append(f"'{boxes[i][0]['text'][:24]}' overlaps '{boxes[j][0]['text'][:24]}'")
    return out


def render_screen(shot):
    sc = Screen()
    status_bar(sc)
    ox, oy = 0, STATUS_H
    sc.rect(0, oy, W, ROOT_H, rgb(shot.get("bg") or "bg"))
    for o in shot["objs"]:
        if not o.get("visible", True):
            continue
        k = o["kind"]
        if k == "label":
            draw_label(sc, ox, oy, o)
        elif k == "rect":
            sc.rect(ox + o["x"], oy + o["y"], o["w"], o["h"], rgb(o.get("colour") or "panel"), radius=o.get("radius") or 0,
                    outline=rgb(o["border"]) if o.get("border") is not None else None)
        elif k == "bar":
            draw_bar(sc, ox, oy, o)
        elif k == "list":
            draw_list(sc, ox, oy, o)
        elif k == "canvas":
            draw_canvas(sc, ox, oy, o)
        elif k == "qr":
            draw_qr(sc, ox, oy, o)
        elif k == "image":
            draw_image(sc, ox, oy, o)
    if shot.get("hint"):
        draw_hint(sc, shot["hint"])
    if shot.get("toast"):
        draw_toast(sc, shot["toast"])
    return sc.img


def on_badge(screen, leds, caption):
    """The screen in a plain bezel, with the six top LEDs and the two on the edge."""
    pad, top, right, bottom = 28, 56, 56, 64
    w, h = screen.width + pad + right, screen.height + top + bottom
    img = Image.new("RGB", (w, h), (18, 18, 24))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=36, fill=(30, 30, 38), outline=(52, 52, 64), width=2)
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    spots = [(pad + screen.width * (i + 0.5) / 6, top / 2) for i in range(6)]
    spots += [(pad + screen.width + right / 2, top + screen.height * f) for f in (0.3, 0.7)]
    for (cx, cy), c in zip(spots, leds):
        lit = sum(c) > 0
        if lit:
            gd.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=tuple(min(255, int(v * 1.6)) for v in c))
    img = ImageChops.add(img, glow.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(img)
    for (cx, cy), c in zip(spots, leds):
        lit = sum(c) > 0
        core = tuple(min(255, 60 + int(v * 1.5)) for v in c) if lit else (58, 58, 68)
        d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=core, outline=(80, 80, 92))
    d.rectangle([pad - 2, top - 2, pad + screen.width + 1, top + screen.height + 1], fill=(0, 0, 0))
    img.paste(screen, (pad, top))
    if caption:
        f = ImageFont.truetype(SANS, 22)
        d.text((w / 2, top + screen.height + bottom / 2), caption, font=f, fill=(200, 200, 212), anchor="mm")
    return img


def sheet(images, cols=4, gap=24):
    cw, ch = images[0].width, images[0].height
    rows = (len(images) + cols - 1) // cols
    out = Image.new("RGB", (cols * cw + (cols + 1) * gap, rows * ch + (rows + 1) * gap), (12, 12, 16))
    for i, im in enumerate(images):
        r, c = divmod(i, cols)
        out.paste(im, (gap + c * (cw + gap), gap + r * (ch + gap)))
    return out


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "tools/screens/out/shots.json"
    out = sys.argv[2] if len(sys.argv) > 2 else "tools/screens/out"
    os.makedirs(out, exist_ok=True)
    shots = json.load(open(src))
    framed = []
    for shot in shots:
        for problem in layout_problems(shot):
            print(f"  layout: {shot['name']}: {problem}")
        screen = render_screen(shot)
        screen.save(os.path.join(out, f"{shot['name']}-screen.png"))
        badge = on_badge(screen, shot.get("leds") or [[0, 0, 0]] * 8, shot.get("caption"))
        badge.save(os.path.join(out, f"{shot['name']}.png"))
        framed.append(badge)
    sheet(framed).save(os.path.join(out, "contact-sheet.png"))
    print(f"{len(shots)} screens -> {out}")


if __name__ == "__main__":
    main()
