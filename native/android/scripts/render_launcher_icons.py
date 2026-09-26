#!/usr/bin/env python3
"""Rasterise the XTREAM mint-X mark for Fire TV.

Fire OS often ignores adaptive-icon XML and keeps a cached OpenTV TV-set from
an older sideload. Bitmap mipmaps + a bitmap leanback banner are what the
Apps row actually shows.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res"
MINT = (46, 230, 166, 255)  # #2EE6A6
DARK = (11, 15, 20, 255)  # #0B0F14
FONT = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")

DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}


def _x_mark(size: int, pad_ratio: float = 0.08) -> Image.Image:
    scale = 8
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(s * pad_ratio)
    radius = int(s * 0.20)
    draw.rounded_rectangle([pad, pad, s - pad - 1, s - pad - 1], radius=radius, fill=MINT)
    inset = int(s * 0.30)
    width = max(scale * 3, int(s * 0.11))
    lines = [((inset, inset), (s - inset, s - inset)), ((s - inset, inset), (inset, s - inset))]
    r = width // 2
    for a, b in lines:
        draw.line([a, b], fill=DARK, width=width)
        for p in (a, b):
            draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=DARK)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def _banner(width: int = 320, height: int = 180) -> Image.Image:
    img = Image.new("RGBA", (width, height), DARK)
    draw = ImageDraw.Draw(img)
    mark = _x_mark(80, pad_ratio=0.06)
    left = 22
    img.paste(mark, (left, (height - mark.height) // 2), mark)
    font = ImageFont.truetype(str(FONT), 36)
    text = "XTREAM"
    bbox = draw.textbbox((0, 0), text, font=font)
    th = bbox[3] - bbox[1]
    x = left + mark.width + 16
    y = (height - th) // 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=MINT)
    return img


def main() -> None:
    for density, size in DENSITIES.items():
        folder = ROOT / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        icon = _x_mark(size)
        icon.save(folder / "ic_xtream.png", "PNG")
        icon.save(folder / "ic_xtream_round.png", "PNG")

    nodpi = ROOT / "drawable-nodpi"
    nodpi.mkdir(parents=True, exist_ok=True)
    _banner().save(nodpi / "banner.png", "PNG")
    print("wrote launcher mipmaps and drawable-nodpi/banner.png")


if __name__ == "__main__":
    main()
