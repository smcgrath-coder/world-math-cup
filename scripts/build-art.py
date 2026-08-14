#!/usr/bin/env python3
"""
Resize the character art down to the size it is actually drawn at.

    python3 scripts/build-art.py

The generated art arrives at 1024px on the long edge, which is the right size to
keep and the wrong size to ship: 5.4MB of PNG for six figures that are never
drawn larger than about 220 points. On an iPad over a phone connection that is a
wait for pixels nobody can see.

Originals live in `art-src/` and are committed, because they cannot be
regenerated -- the same prompt produces a different person. `public/art/` holds
the built copies.

Targets come from `docs/art/placement.md`: each is roughly twice the largest size
that asset is drawn at, which covers a 2x display with room to spare. If a
placement changes to something bigger, change the number here rather than
scaling the file up in CSS.

macOS only: uses sips, which ships with the OS.
"""

import subprocess
import sys
from pathlib import Path

# Longest edge in pixels, per asset. See the module docstring for how these were
# chosen; the comment on each is where it is drawn.
TARGETS = {
    "rion-ready": 512,  # training ground, the largest figure in the game
    "rion-celebration": 512,  # the win payout, wants some impact
    "rion-portrait": 448,  # above the player card
    "coach": 320,  # an avatar on a settings row at most
    "analyst-thinking": 320,  # film room, small
    "analyst-explaining": 320,  # film room, small
}

SRC_DIR = Path("art-src")
OUT_DIR = Path("public/art")


def build(name: str, longest: int) -> bool:
    src = SRC_DIR / f"{name}.png"
    if not src.exists():
        print(f"  skip {name}: no {src}")
        return True

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dst = OUT_DIR / f"{name}.png"
    result = subprocess.run(
        ["sips", "-Z", str(longest), "-s", "format", "png", str(src), "--out", str(dst)],
        capture_output=True,
    )
    if result.returncode != 0:
        print(f"  FAILED {name}: {result.stderr.decode().strip()}")
        return False

    before = src.stat().st_size / 1024
    after = dst.stat().st_size / 1024
    print(f"  {name:22} {longest:4}px  {before:6.0f} KB -> {after:5.0f} KB")
    return True


def main() -> None:
    if not SRC_DIR.exists():
        print(f"no {SRC_DIR}: put the full-size originals there first")
        sys.exit(1)

    print(f"building art from {SRC_DIR}")
    ok = all([build(name, longest) for name, longest in TARGETS.items()])

    total = sum(f.stat().st_size for f in OUT_DIR.glob("*.png"))
    print(f"  total {total / 1024:.0f} KB")

    # sips is being trusted to carry the alpha channel through the resize, and a
    # silent flatten here would put a white box on a dark green pitch. Cheap to
    # prove rather than assume.
    # Flushed because the check below writes straight to stdout past this
    # script's buffer, and unflushed output makes it read as if the check ran
    # first.
    print("verifying the cut-outs survived the resize", flush=True)
    check = subprocess.run([sys.executable, "scripts/check-art.py"])
    if not ok or check.returncode != 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
