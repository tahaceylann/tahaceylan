#!/usr/bin/env python3
"""Generates simple flat-design app icons (city skyline + coin) as PNG files,
using only the Python standard library (zlib + struct) -- no Pillow needed.

Produces the icon set referenced by manifest.json and index.html:
  icons/icon-512.png, icon-192.png, icon-180.png (apple-touch-icon),
  icon-32.png (favicon), icon-16.png
"""
import struct
import zlib
import os
import math

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def rounded_mask(x, y, w, h, radius):
    """Return True if pixel (x,y) is inside a rounded-rect of size w x h."""
    rx = min(radius, w / 2)
    ry = min(radius, h / 2)
    # distance from nearest rounded corner
    cx = min(max(x, rx), w - rx)
    cy = min(max(y, ry), h - ry)
    dx = x - cx
    dy = y - cy
    return (dx * dx) / (rx * rx + 1e-9) + (dy * dy) / (ry * ry + 1e-9) <= 1.0 or (
        rx == 0 and ry == 0
    )


def make_icon(size):
    w = h = size
    radius = size * 0.22
    pixels = [[(0, 0, 0, 0) for _ in range(w)] for _ in range(h)]

    sky_top = (0x1B, 0x0F, 0x4E)      # deep indigo
    sky_bottom = (0xE3, 0x7B, 0x2C)   # warm sunset orange/gold
    building_dark = (0x12, 0x0A, 0x2A)
    building_mid = (0x21, 0x14, 0x45)
    window_gold = (0xFF, 0xD1, 0x66)

    # skyline silhouette: list of (x_start_frac, width_frac, height_frac, shade)
    buildings = [
        (0.00, 0.14, 0.34, building_mid),
        (0.12, 0.16, 0.52, building_dark),
        (0.26, 0.14, 0.40, building_mid),
        (0.38, 0.13, 0.66, building_dark),
        (0.49, 0.15, 0.48, building_mid),
        (0.62, 0.13, 0.72, building_dark),
        (0.73, 0.14, 0.44, building_mid),
        (0.85, 0.15, 0.58, building_dark),
    ]

    coin_cx, coin_cy, coin_r = w * 0.66, h * 0.30, size * 0.16

    for y in range(h):
        t_sky = y / h
        base = lerp_color(sky_top, sky_bottom, min(1.0, t_sky * 1.15))
        for x in range(w):
            if not rounded_mask(x + 0.5, y + 0.5, w, h, radius):
                continue
            r, g, b = base
            pixels[y][x] = (r, g, b, 255)

    # coin (sun) behind buildings
    for y in range(h):
        for x in range(w):
            if pixels[y][x][3] == 0:
                continue
            dx = x - coin_cx
            dy = y - coin_cy
            dist = math.sqrt(dx * dx + dy * dy)
            if dist <= coin_r:
                glow = max(0.0, 1.0 - dist / coin_r)
                r, g, b = lerp_color((0xFF, 0xE9, 0xA8), (0xFF, 0xC1, 0x3D), 1 - glow)
                pixels[y][x] = (r, g, b, 255)
            elif dist <= coin_r * 1.35:
                a = pixels[y][x]
                f = (dist - coin_r) / (coin_r * 0.35)
                r, g, b = lerp_color((0xFF, 0xD1, 0x66), a[:3], f)
                pixels[y][x] = (r, g, b, 255)

    # buildings
    for (xf, wf, hf, shade) in buildings:
        bx0 = int(w * xf)
        bx1 = int(w * (xf + wf))
        by0 = int(h * (1 - hf)) + int(h * 0.06)
        by1 = h
        for y in range(max(0, by0), by1):
            for x in range(max(0, bx0), min(w, bx1)):
                if pixels[y][x][3] == 0:
                    continue
                pixels[y][x] = (*shade, 255)
        # windows: small grid of gold dots
        win_size = max(1, int(w * 0.012))
        gap = win_size * 2
        for wy in range(by0 + gap, by1 - gap, gap):
            for wx in range(bx0 + gap, bx1 - gap, gap):
                if (wx // gap + wy // gap) % 3 == 0:
                    continue
                for yy in range(wy, min(wy + win_size, h)):
                    for xx in range(wx, min(wx + win_size, w)):
                        if pixels[yy][xx][3] != 0:
                            pixels[yy][xx] = (*window_gold, 255)

    # ground glow line
    glow_y = h - 1
    for x in range(w):
        if pixels[glow_y][x][3] != 0:
            pixels[glow_y][x] = (0xFF, 0xD1, 0x66, 255)

    return pixels


def write_png(pixels, path):
    h = len(pixels)
    w = len(pixels[0])
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0 for each scanline
        for x in range(w):
            r, g, b, a = pixels[y][x]
            raw += bytes((r, g, b, a))
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        c = tag + data
        crc = zlib.crc32(c) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size, name in [
        (512, "icon-512.png"),
        (192, "icon-192.png"),
        (180, "icon-180.png"),
        (32, "icon-32.png"),
        (16, "icon-16.png"),
    ]:
        pixels = make_icon(size)
        write_png(pixels, os.path.join(OUT_DIR, name))
        print(f"wrote {name} ({size}x{size})")


if __name__ == "__main__":
    main()
