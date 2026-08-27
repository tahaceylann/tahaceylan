#!/usr/bin/env python3
"""Generates simple flat-design app icons (viral burst + play button) as PNG
files, using only the Python standard library (zlib + struct) -- no Pillow
needed.

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
    rx = min(radius, w / 2)
    ry = min(radius, h / 2)
    cx = min(max(x, rx), w - rx)
    cy = min(max(y, ry), h - ry)
    dx = x - cx
    dy = y - cy
    return (dx * dx) / (rx * rx + 1e-9) + (dy * dy) / (ry * ry + 1e-9) <= 1.0


def make_icon(size):
    w = h = size
    radius = size * 0.22
    pixels = [[(0, 0, 0, 0) for _ in range(w)] for _ in range(h)]

    grad_a = (0xFF, 0x2D, 0x78)  # canlı pembe (magenta)
    grad_b = (0x7B, 0x2F, 0xF7)  # elektrik moru
    cx, cy = w * 0.5, h * 0.5

    # köşegen gradyan arka plan
    for y in range(h):
        for x in range(w):
            if not rounded_mask(x + 0.5, y + 0.5, w, h, radius):
                continue
            t = ((x + y) / (w + h))
            r, g, b = lerp_color(grad_a, grad_b, t)
            pixels[y][x] = (r, g, b, 255)

    # viral patlama ışınları (ince, yarı saydam beyaz ışınlar)
    ray_count = 14
    for i in range(ray_count):
        angle = (2 * math.pi / ray_count) * i
        length = size * 0.46
        steps = int(length)
        for s in range(int(size * 0.20), steps):
            px = cx + math.cos(angle) * s
            py = cy + math.sin(angle) * s
            xi, yi = int(px), int(py)
            if 0 <= xi < w and 0 <= yi < h and pixels[yi][xi][3] != 0:
                fade = max(0.0, 1 - (s - size * 0.20) / (length - size * 0.20))
                base = pixels[yi][xi][:3]
                r, g, b = lerp_color(base, (255, 255, 255), 0.55 * fade)
                pixels[yi][xi] = (r, g, b, 255)
                # ışınlara biraz kalınlık ver
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        xx, yy = xi + dx, yi + dy
                        if 0 <= xx < w and 0 <= yy < h and pixels[yy][xx][3] != 0:
                            b2 = pixels[yy][xx][:3]
                            r2, g2, b2v = lerp_color(b2, (255, 255, 255), 0.25 * fade)
                            pixels[yy][xx] = (r2, g2, b2v, 255)

    # merkezde yumuşak beyaz disk (oynat düğmesi zemini)
    disk_r = size * 0.30
    for y in range(h):
        for x in range(w):
            if pixels[y][x][3] == 0:
                continue
            dx = x - cx
            dy = y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            if dist <= disk_r:
                glow = max(0.0, 1.0 - dist / disk_r)
                base = pixels[y][x][:3]
                r, g, b = lerp_color(base, (255, 255, 255), 0.92 * min(1.0, glow + 0.35))
                pixels[y][x] = (r, g, b, 255)
            elif dist <= disk_r * 1.18:
                f = (dist - disk_r) / (disk_r * 0.18)
                base = pixels[y][x][:3]
                r, g, b = lerp_color((255, 255, 255), base, f)
                pixels[y][x] = (r, g, b, 255)

    # oynat üçgeni (play button), merkeze göre hafif sağa kaydırılmış
    tri_h = size * 0.30
    tri_w = size * 0.26
    offset_x = size * 0.03
    apex = (cx + tri_w * 0.55 + offset_x, cy)
    top = (cx - tri_w * 0.45 + offset_x, cy - tri_h * 0.5)
    bot = (cx - tri_w * 0.45 + offset_x, cy + tri_h * 0.5)

    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    def point_in_tri(pt, a, b, c):
        d1 = sign(pt, a, b)
        d2 = sign(pt, b, c)
        d3 = sign(pt, c, a)
        has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
        has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
        return not (has_neg and has_pos)

    tri_color = (0xFF, 0x2D, 0x78)
    y0 = int(cy - tri_h * 0.6)
    y1 = int(cy + tri_h * 0.6)
    x0 = int(cx - tri_w * 0.55 + offset_x)
    x1 = int(cx + tri_w * 0.65 + offset_x)
    for y in range(max(0, y0), min(h, y1)):
        for x in range(max(0, x0), min(w, x1)):
            if point_in_tri((x, y), apex, top, bot):
                pixels[y][x] = (*tri_color, 255)

    return pixels


def write_png(pixels, path):
    h = len(pixels)
    w = len(pixels[0])
    raw = bytearray()
    for y in range(h):
        raw.append(0)
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
