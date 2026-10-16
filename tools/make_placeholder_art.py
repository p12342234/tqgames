#!/usr/bin/env python3
"""產生佔位商品圖 (art/<pack>/*.png) 並打包成 TexturePacker「JSON (Hash)」相容的 Texture Atlas。
正式上線請改用 TexturePacker（見 tools/pack.sh），輸出格式與路徑相同，遊戲程式碼不用改。"""
import json, math, os
from PIL import Image, ImageDraw

S, SS = 128, 4  # 單張尺寸、超取樣倍率
PACKS = {
    "tiles-core": {
        "apple":  ("circle",   (230, 57, 70)),
        "milk":   ("carton",   (72, 149, 239)),
        "bread":  ("loaf",     (222, 158, 87)),
        "soda":   ("hexagon",  (82, 183, 136)),
        "candy":  ("star",     (247, 118, 190)),
        "cheese": ("triangle", (255, 209, 102)),
    },
    "tiles-halloween": {
        "pumpkin": ("pumpkin", (240, 124, 28)),
        "ghost":   ("ghost",   (232, 236, 245)),
    },
}

def poly(n, r, cx, cy, rot=-math.pi / 2):
    return [(cx + r * math.cos(rot + 2 * math.pi * i / n), cy + r * math.sin(rot + 2 * math.pi * i / n)) for i in range(n)]

def draw_tile(shape, col):
    W = S * SS
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = W // 2
    dark = tuple(int(v * 0.65) for v in col) + (255,)
    fill = col + (255,)
    m = int(W * 0.10)
    d.rounded_rectangle([m, m, W - m, W - m], radius=int(W * 0.22), fill=dark)   # 底板
    k = int(W * 0.04)
    inner = [m + k, m + k, W - m - k, W - m - k]
    d.rounded_rectangle(inner, radius=int(W * 0.19), fill=(255, 255, 255, 235))
    p = int(W * 0.24)
    if shape in ("circle", "pumpkin"):
        d.ellipse([p, p, W - p, W - p], fill=fill, outline=dark, width=SS * 3)
        if shape == "pumpkin":
            d.rectangle([c - SS * 3, p - SS * 6, c + SS * 3, p + SS * 4], fill=(70, 120, 50, 255))
            for ex in (-1, 1):
                d.polygon([(c + ex * W * .11, c - W * .05), (c + ex * W * .05, c + W * .05), (c + ex * W * .17, c + W * .05)], fill=(60, 30, 10, 255))
            d.arc([c - W * .14, c, c + W * .14, c + W * .16], 20, 160, fill=(60, 30, 10, 255), width=SS * 3)
    elif shape == "carton":
        d.rectangle([p + SS * 6, p, W - p - SS * 6, W - p], fill=fill, outline=dark, width=SS * 3)
        d.polygon([(p + SS * 6, p), (c, p - SS * 10), (W - p - SS * 6, p)], fill=dark)
        d.rectangle([p + SS * 12, c - SS * 6, W - p - SS * 12, c + SS * 12], fill=(255, 255, 255, 255))
    elif shape == "loaf":
        d.rounded_rectangle([p - SS * 2, c - W * .12, W - p + SS * 2, W - p], radius=int(W * .1), fill=fill, outline=dark, width=SS * 3)
        d.ellipse([p - SS * 2, p, W - p + SS * 2, c + W * .05], fill=fill, outline=dark, width=SS * 3)
        for i in (-1, 0, 1):
            d.line([(c + i * W * .1 - SS * 4, p + SS * 8), (c + i * W * .1 + SS * 4, c - SS * 4)], fill=dark, width=SS * 3)
    elif shape == "hexagon":
        d.polygon(poly(6, W * .29, c, c), fill=fill, outline=dark)
        d.ellipse([c - W * .1, c - W * .1, c + W * .1, c + W * .1], fill=(255, 255, 255, 230))
    elif shape == "star":
        pts = []
        for i in range(10):
            r = W * .30 if i % 2 == 0 else W * .13
            a = -math.pi / 2 + i * math.pi / 5
            pts.append((c + r * math.cos(a), c + r * math.sin(a)))
        d.polygon(pts, fill=fill, outline=dark)
    elif shape == "triangle":
        d.polygon([(c, p - SS * 4), (W - p + SS * 6, W - p), (p - SS * 6, W - p)], fill=fill, outline=dark)
        for (x, y) in [(c - W * .03, c + W * .05), (c + W * .08, c + W * .15), (c - W * .09, c + W * .17)]:
            d.ellipse([x - SS * 5, y - SS * 5, x + SS * 5, y + SS * 5], fill=dark)
    elif shape == "ghost":
        d.pieslice([p, p, W - p, W - p + SS * 20], 180, 360, fill=fill, outline=dark, width=SS * 3)
        d.rectangle([p, c - SS * 2, W - p, W - p - SS * 6], fill=fill)
        for i in range(3):
            x0 = p + i * (W - 2 * p) / 3
            d.pieslice([x0, W - p - SS * 20, x0 + (W - 2 * p) / 3, W - p + SS * 8], 0, 180, fill=(255, 255, 255, 235))
        for ex in (-1, 1):
            d.ellipse([c + ex * W * .1 - SS * 6, c - W * .1, c + ex * W * .1 + SS * 6, c - W * .1 + SS * 16], fill=(40, 40, 60, 255))
    return im.resize((S, S), Image.LANCZOS)

def pack(pack_name, frames):
    pad = 2
    cols = math.ceil(math.sqrt(len(frames)))
    rows = math.ceil(len(frames) / cols)
    W, H = cols * (S + pad) + pad, rows * (S + pad) + pad
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out = {}
    for i, (name, img) in enumerate(frames):
        x, y = pad + (i % cols) * (S + pad), pad + (i // cols) * (S + pad)
        sheet.paste(img, (x, y))
        out[name] = {
            "frame": {"x": x, "y": y, "w": S, "h": S}, "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": S, "h": S}, "sourceSize": {"w": S, "h": S},
        }
    os.makedirs("assets/atlas", exist_ok=True)
    sheet.save(f"assets/atlas/{pack_name}.png")
    meta = {"app": "make_placeholder_art.py (TexturePacker JSON Hash compatible)", "version": "1.0",
            "image": f"{pack_name}.png", "format": "RGBA8888", "size": {"w": W, "h": H}, "scale": "1"}
    with open(f"assets/atlas/{pack_name}.json", "w", encoding="utf8") as f:
        json.dump({"frames": out, "meta": meta}, f, indent=1)

for pack_name, items in PACKS.items():
    os.makedirs(f"art/{pack_name}", exist_ok=True)
    frames = []
    for pid, (shape, col) in items.items():
        im = draw_tile(shape, col)
        fn = f"tile_{pid}.png"
        im.save(f"art/{pack_name}/{fn}")
        frames.append((fn, im))
    pack(pack_name, frames)
    print("packed", pack_name, len(frames), "frames")
