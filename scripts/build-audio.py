#!/usr/bin/env python3
"""
Turn generated music into loops the game can actually play.

    python3 scripts/build-audio.py ~/Downloads

Generated tracks come out as songs: they fade in, play, and fade out. Looped,
that means the sound dips to silence every couple of minutes, which is worse
than no music at all because it sounds broken rather than quiet.

This does two things to each track:

  1. Trims the fade-out, so the loop never reaches the part that dies away.
  2. Crossfades the new tail back over the head, so the seam is continuous.
     After this a plain <audio loop> is enough -- no Web Audio, no loop points
     to keep in sync with the files, nothing to get wrong at playback time.

It also re-encodes to AAC. The originals are 192kbps stereo MP3 and total 13MB
against a 6MB budget; on an iPad over a phone connection that is a long wait
before anything is heard.

macOS only: uses afconvert, which ships with the OS, so there is no dependency
to install.
"""

import math
import struct
import subprocess
import sys
import wave
from pathlib import Path

# Tracks to build, and how loud each should sit relative to the others.
# Ambience has to stay under a question without competing with it.
TRACKS = {
    "main_theme": 1.0,
    "tournament": 1.0,
    "training_grounds": 0.9,
    "match_ambience": 0.55,
    "penalty_shootout": 0.9,
}

CROSSFADE_SEC = 2.0
BITRATE = 96000
OUT_DIR = Path("public/audio")


def decode(src: Path, dst: Path) -> None:
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", "LEI16@44100", str(src), str(dst)],
        check=True,
        capture_output=True,
    )


def encode(src: Path, dst: Path) -> None:
    subprocess.run(
        ["afconvert", "-f", "m4af", "-d", "aac", "-b", str(BITRATE), str(src), str(dst)],
        check=True,
        capture_output=True,
    )


def read_wav(path: Path):
    with wave.open(str(path), "rb") as w:
        channels, rate, frames = w.getnchannels(), w.getframerate(), w.getnframes()
        raw = w.readframes(frames)
    samples = list(struct.unpack("<%dh" % (len(raw) // 2), raw))
    return samples, channels, rate


def write_wav(path: Path, samples, channels: int, rate: int) -> None:
    clipped = [max(-32768, min(32767, int(v))) for v in samples]
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(struct.pack("<%dh" % len(clipped), *clipped))


def frame_rms(samples, start_frame: int, frames: int, channels: int) -> float:
    a, b = start_frame * channels, (start_frame + frames) * channels
    seg = samples[a:b]
    if not seg:
        return 0.0
    return math.sqrt(sum(v * v for v in seg) / len(seg))


def find_fade_out(samples, channels: int, rate: int) -> int:
    """The frame where the track starts dying away, measured against its own peak."""
    total = len(samples) // channels
    window = int(rate * 0.1)
    peak = max(
        frame_rms(samples, i, window, channels) for i in range(0, total - window, window * 5)
    )
    threshold = peak * 0.25
    for i in range(total - window, 0, -window):
        if frame_rms(samples, i, window, channels) > threshold:
            return min(total, i + window)
    return total


def build(name: str, gain: float, source_dir: Path) -> None:
    src = source_dir / f"{name}.mp3"
    if not src.exists():
        print(f"  skip {name}: no {src}")
        return

    tmp_in, tmp_out = Path("/tmp/wmc_in.wav"), Path("/tmp/wmc_out.wav")
    decode(src, tmp_in)
    samples, channels, rate = read_wav(tmp_in)
    total = len(samples) // channels

    end = find_fade_out(samples, channels, rate)
    fade = int(CROSSFADE_SEC * rate)
    if end - fade < rate * 5:
        print(f"  skip {name}: too short once the fade-out is removed")
        return

    # Crossfade the last `fade` frames over the first `fade` frames, then drop
    # that tail. What is left begins already blended with its own ending, so
    # playing it on repeat has no seam to hear.
    #
    # Note it is the TAIL that gets dropped, not the head. Dropping the head
    # instead leaves a `fade`-length hole in the middle of the track, which is a
    # subtler fault than the gap it was meant to fix.
    body = samples[: end * channels]
    keep = end - fade
    out = list(body[: keep * channels])
    for f in range(fade):
        t = f / fade
        for c in range(channels):
            head = body[f * channels + c]
            tail = body[(keep + f) * channels + c]
            out[f * channels + c] = head * t + tail * (1 - t)

    if gain != 1.0:
        out = [v * gain for v in out]

    write_wav(tmp_out, out, channels, rate)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dst = OUT_DIR / f"{name}.m4a"
    encode(tmp_out, dst)

    trimmed = (total - end) / rate
    print(
        f"  {name:18} {len(out) // channels / rate:5.1f}s loop"
        f"  (trimmed {trimmed:4.1f}s of fade)  {dst.stat().st_size / 1024:5.0f} KB"
    )


def main() -> None:
    source_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads").expanduser()
    print(f"building loops from {source_dir}")
    for name, gain in TRACKS.items():
        build(name, gain, source_dir)
    if OUT_DIR.exists():
        total = sum(f.stat().st_size for f in OUT_DIR.glob("*.m4a"))
        print(f"  total {total / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
