"""Soundtrack mixer for the POIPIU promo (40 s).
Intro: synthesized riser + impact. From 3.0 s: the map's own song, trimmed so it stays in sync with the replay,
plus synthesized effects for every on-screen event. Usage: python3 -I audio.py <song.wav or ""> <out.wav>"""
import sys, wave
import numpy as np

SR = 44100
DUR = 40.0
N = int(SR * DUR)
out = np.zeros((N, 2), dtype=np.float64)
rng = np.random.default_rng(7)
song_path, out_path = sys.argv[1], sys.argv[2]


def put(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    seg = sig[: j - i] * gain
    out[i:j, 0] += seg * (1 - max(0, pan))
    out[i:j, 1] += seg * (1 + min(0, pan))


def tarr(d):
    return np.arange(int(d * SR)) / SR


def kick():
    t = tarr(0.28)
    f = 42 + 110 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def tone(freq, d, shape="tri", decay=5.0):
    t = tarr(d)
    x = 2 * np.pi * freq * t
    s = np.sin(x) if shape == "sine" else (2 / np.pi) * np.arcsin(np.sin(x)) if shape == "tri" else np.sign(np.sin(x)) * 0.5
    return s * np.exp(-t * decay)


def bell(freq, d=0.9):
    t = tarr(d)
    return sum(a * np.sin(2 * np.pi * freq * m * t) for m, a in ((1, 1), (2.76, 0.4), (5.4, 0.2))) * np.exp(-t * 5)


def whoosh(d=0.4):
    t = tarr(d)
    n = np.diff(rng.standard_normal(len(t) + 1))
    return n * np.sin(np.pi * t / d) ** 2 * (0.2 + 0.8 * t / d)


def pad(freqs, d, gain=0.12):
    t = tarr(d)
    env = np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.4)
    return sum(np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.003 * t) for f in freqs) * env * gain


NOTE = lambda n: 440.0 * 2 ** ((n - 69) / 12)

# --- intro 0-3 s
t = tarr(1.5)
n = np.diff(rng.standard_normal(len(t) + 1))
put(n * (t / 1.5) ** 2 * 0.5, 0)
put(np.sin(2 * np.pi * np.cumsum(200 + 1800 * (t / 1.5) ** 2) / SR) * (t / 1.5) ** 2 * 0.3, 0)
t = tarr(1.6)
put(np.sin(2 * np.pi * 38 * t) * np.exp(-t * 2.2), 1.5)
put(kick() * 1.2, 1.5)
put(rng.standard_normal(int(0.5 * SR)) * np.exp(-tarr(0.5) * 9) * 0.4, 1.5)
put(pad([NOTE(57), NOTE(60), NOTE(64)], 1.6), 1.5)

# --- the map's song, in sync with the replay (song time 36 s at video time 3 s)
if song_path:
    with wave.open(song_path, "rb") as w:
        assert w.getnchannels() == 2 and w.getsampwidth() == 2 and w.getframerate() == SR
        raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2) / 32768.0
    m = min(len(raw), N - int(3 * SR))
    seg = raw[:m].copy()
    fade_in = int(0.12 * SR)
    seg[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    out[int(3 * SR): int(3 * SR) + m] += seg * 0.9
else:
    # Fallback without the song: a plain synthesized pulse so the video is still usable.
    for k in range(int((DUR - 3) / 0.5)):
        put(kick(), 3 + k * 0.5, 0.8)

CUTS = (3, 11, 16, 21, 28, 35)
for b in CUTS:
    put(whoosh(0.45), b - 0.25, 0.5)

# --- scene 2: skin swaps
for tt in (3 + 8 / 3, 3 + 16 / 3):
    put(whoosh(0.3), tt - 0.05, 0.45)
    put(tone(1568, 0.1, "sine", 25), tt + 0.02, 0.25)

# --- scene 3: cards, odometer ticks, chime
put(whoosh(0.35), 11.15, 0.35, -0.5)
put(whoosh(0.35), 11.40, 0.35, 0.5)
tt = 11.75
while tt < 14.4:
    put(tone(1300, 0.03, "square", 70), tt, 0.14)
    tt += 0.075
put(bell(NOTE(84)) + bell(NOTE(88)) + bell(NOTE(91)), 14.45, 0.22)

# --- scene 4: selection moves
for k, tt in enumerate((16.0, 17.7, 19.4)):
    put(tone(NOTE(76 + 2 * k), 0.12, "square", 20), tt + 0.02, 0.18)

# --- scene 5: row drop, typing, chime
put(whoosh(0.35), 21.95, 0.4)
put(tone(180, 0.15, "sine", 18), 22.55, 0.5)
for i in range(8):
    put(tone(1100, 0.04, "square", 60), 23.2 + i * 0.42, 0.3)
put(bell(NOTE(84)) + bell(NOTE(88)) + bell(NOTE(91)), 26.6, 0.24)

# --- scene 6: ticket sparkles + prize
r2 = np.random.default_rng(3)
tt = 28.4
while tt < 32.9:
    put(bell(float(r2.choice([1568, 1976, 2349, 2637])), 0.35), tt, 0.1)
    tt += 0.11 + r2.random() * 0.1
put(bell(1568, 1.0), 33.4, 0.28)
put(bell(2093, 1.2), 33.55, 0.28)

# --- scene 7: coins
for c in (36.5, 38.0, 39.2):
    put(tone(1976, 0.08, "square", 30), c + 0.45, 0.25)
    put(bell(2637, 0.7), c + 0.53, 0.28)

# --- master
fade = np.ones(N)
fade[-int(0.6 * SR):] = np.linspace(1, 0, int(0.6 * SR))
out *= fade[:, None]
out = np.tanh(out * 0.9)
out = out / max(1e-9, np.max(np.abs(out))) * 0.5
pcm = (out * 32767).astype(np.int16)
with wave.open(out_path, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", round(len(pcm) / SR, 2), "s")
