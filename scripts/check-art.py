#!/usr/bin/env python3
"""
Check that the character art is actually cut out.

    python3 scripts/check-art.py

`sips -g hasAlpha` answers a different question than the one that matters: it
says an alpha channel exists, not that anything in it is transparent. A PNG
exported with a white background baked in and a fully opaque alpha channel
passes that check and then renders as a white box on a dark green pitch.

So this decodes the file and looks at the alpha values: the four corners, which
should be empty on a cut-out portrait, and the overall share of transparent
pixels.

Pure standard library — there is no PIL on this machine.
"""

import struct
import sys
import zlib
from pathlib import Path

ART_DIR = Path("public/art")

# A cut-out figure on a 1:1 or 3:4 canvas leaves a lot of empty space. Less than
# this and the background is probably still baked in.
MIN_TRANSPARENT = 0.10


def read_png(path: Path):
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")

    pos, idat, header = 8, bytearray(), None
    while pos < len(raw):
        (length,) = struct.unpack(">I", raw[pos : pos + 4])
        kind = raw[pos + 4 : pos + 8]
        body = raw[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break
        pos += 12 + length

    width, height, depth, colour, _, _, interlace = header
    if depth != 8 or colour != 6:
        raise ValueError(f"expected 8-bit RGBA, got depth {depth} colour type {colour}")
    if interlace:
        raise ValueError("interlaced PNGs are not supported")

    return width, height, zlib.decompress(bytes(idat))


def unfilter(data: bytes, width: int, height: int) -> bytearray:
    """Reverse the per-scanline filters. Four bytes per pixel, so bpp is 4."""
    stride, bpp = width * 4, 4
    out = bytearray(stride * height)
    pos = 0
    for y in range(height):
        kind = data[pos]
        pos += 1
        row = bytearray(data[pos : pos + stride])
        pos += stride
        above = out[(y - 1) * stride : y * stride] if y else bytes(stride)

        if kind == 1:
            for i in range(bpp, stride):
                row[i] = (row[i] + row[i - bpp]) & 0xFF
        elif kind == 2:
            for i in range(stride):
                row[i] = (row[i] + above[i]) & 0xFF
        elif kind == 3:
            for i in range(stride):
                left = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + ((left + above[i]) >> 1)) & 0xFF
        elif kind == 4:
            for i in range(stride):
                a = row[i - bpp] if i >= bpp else 0
                b = above[i]
                c = above[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                row[i] = (row[i] + pred) & 0xFF
        elif kind != 0:
            raise ValueError(f"unknown filter {kind} on row {y}")

        out[y * stride : (y + 1) * stride] = row
    return out


def check(path: Path) -> bool:
    width, height, data = read_png(path)
    pixels = unfilter(data, width, height)
    stride = width * 4

    alpha = pixels[3::4]
    clear = sum(1 for a in alpha if a == 0)
    share = clear / len(alpha)

    def corner(x: int, y: int) -> int:
        return pixels[y * stride + x * 4 + 3]

    corners = [
        corner(0, 0),
        corner(width - 1, 0),
        corner(0, height - 1),
        corner(width - 1, height - 1),
    ]

    ok = share >= MIN_TRANSPARENT and max(corners) == 0
    print(
        f"  {path.name:26} {width}x{height}  "
        f"{share * 100:5.1f}% clear  corners={corners}  "
        f"{'ok' if ok else 'BACKGROUND STILL BAKED IN'}"
    )
    return ok


def main() -> None:
    files = sorted(ART_DIR.glob("*.png"))
    if not files:
        print(f"no PNGs in {ART_DIR}")
        return
    print(f"checking {len(files)} files in {ART_DIR}")
    if not all([check(f) for f in files]):
        sys.exit(1)


if __name__ == "__main__":
    main()
