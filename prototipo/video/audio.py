"""Original synthesized soundtrack for the POIPIU promo (120 BPM, 40 s). Output: promo.wav"""
import sys, wave
import numpy as np

SR = 44100
DUR = 40.0
N = int(SR * DUR)
BEAT = 0.5
out = np.zeros(N, dtype=np.float64)
rng = np.random.default_rng(7)


def put(sig, t0, gain=1.0):
    i = int(t0 * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    out[i:j] += sig[: j - i] * gain


def tarr(d):
    return np.arange(int(d * SR)) / SR


def kick():
    t = tarr(0.28)
    f = 42 + 110 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def clap():
    t = tarr(0.22)
    n = rng.standard_normal(len(t))
    return (n * np.exp(-t * 22) * 0.6 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.3)


def hat(open_=False):
    t = tarr(0.18 if open_ else 0.06)
    n = np.diff(rng.standard_normal(len(t) + 1))
    return n * np.exp(-t * (28 if open_ else 80))


def tone(freq, d, shape="tri", decay=5.0, harm=0):
    t = tarr(d)
    x = 2 * np.pi * freq * t
    if shape == "sine":
        s = np.sin(x)
    elif shape == "tri":
        s = (2 / np.pi) * np.arcsin(np.sin(x))
    elif shape == "square":
        s = np.sign(np.sin(x)) * 0.5
    else:  # saw (band-limited-ish)
        s = sum(np.sin(x * k) / k for k in range(1, 6)) * 0.6
    return s * np.exp(-t * decay)


def bell(freq, d=0.9):
    t = tarr(d)
    return sum(a * np.sin(2 * np.pi * freq * m * t) for m, a in ((1, 1), (2.76, 0.4), (5.4, 0.2))) * np.exp(-t * 5)


def whoosh(d=0.4):
    t = tarr(d)
    n = np.diff(rng.standard_normal(len(t) + 1))
    env = np.sin(np.pi * t / d) ** 2
    return n * env * (0.2 + 0.8 * t / d)


def pad(freqs, d, gain=0.12):
    t = tarr(d)
    env = np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.4)
    return sum(np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.003 * t) for f in freqs) * env * gain


NOTE = lambda n: 440.0 * 2 ** ((n - 69) / 12)

# --- 0-3 s intro: riser, impact, pad
t = tarr(1.5)
n = np.diff(rng.standard_normal(len(t) + 1))
put(n * (t / 1.5) ** 2 * 0.5, 0, 1)
put(np.sin(2 * np.pi * np.cumsum(200 + 1800 * (t / 1.5) ** 2) / SR) * (t / 1.5) ** 2 * 0.3, 0, 1)
t = tarr(1.6)
put(np.sin(2 * np.pi * 38 * t) * np.exp(-t * 2.2) * 1.0, 1.5, 1)
put(kick() * 1.2, 1.5, 1)
put(rng.standard_normal(int(0.5 * SR)) * np.exp(-tarr(0.5) * 9) * 0.4, 1.5, 1)
put(pad([NOTE(57), NOTE(60), NOTE(64)], 1.6), 1.5, 1)

# --- cuts: whoosh
for b in (3, 8, 14, 20, 27, 34):
    put(whoosh(0.45), b - 0.25, 0.5)

# --- groove 3-34
roots = [NOTE(33), NOTE(29), NOTE(36), NOTE(31)]  # A1 F1 C2 G1
t0 = 3.0
while t0 < 34.0 - 1e-6:
    beat = int(round((t0 - 3.0) / BEAT))
    put(kick(), t0, 0.95)
    if beat % 2 == 1:
        put(clap(), t0, 0.6)
    put(hat(), t0 + 0.25, 0.5)
    if beat % 4 == 3:
        put(hat(True), t0 + 0.25, 0.4)
    bar = int((t0 - 3.0) // 2) % 4
    r = roots[bar]
    for k, mul in enumerate((1, 1, 2, 1)):
        put(tone(r * mul, 0.22, "saw", 7), t0 + k * 0.125, 0.33)
    t0 += BEAT

# --- scene 2 hit blips (circles at 3.5 + 0.5 i)
for i in range(9):
    put(tone(1318.5, 0.12, "sine", 25), 3.5 + i * 0.5, 0.35)

# --- lead arpeggio 8-34 (sparkle), muted during ticket scene tail
penta = [NOTE(n) for n in (69, 72, 74, 76, 79, 81)]
k = 0
t0 = 8.0
while t0 < 34.0:
    if not (14 <= t0 < 20):
        put(tone(penta[(k * 3) % 6], 0.2, "tri", 9), t0, 0.26 if t0 < 27 else 0.18)
    k += 1
    t0 += 0.25

# --- scene 3 score-arrival blips
for i in range(22):
    put(tone(1568 if i % 5 != 4 else 1760, 0.1, "sine", 22), 8.3 + i * 0.25 + 0.55, 0.22)

# --- scene 4 skin swaps
for tt in (14.0, 16.0, 18.0):
    put(whoosh(0.35), tt, 0.4)
    put(tone(880, 0.12, "square", 20), tt + 0.3, 0.2)

# --- scene 5 typing clicks + chime
for i in range(6):
    put(tone(1100, 0.04, "square", 60), 22.2 + i * 0.45, 0.4)
put(bell(NOTE(84)) + bell(NOTE(88)) + bell(NOTE(91)), 25.5, 0.22)

# --- scene 6 ticket sparkles + cha-ching
r2 = np.random.default_rng(3)
tt = 27.5
while tt < 32.0:
    put(bell(float(r2.choice([1568, 1976, 2349, 2637])), 0.35), tt, 0.12)
    tt += 0.11 + r2.random() * 0.1
put(bell(1568, 1.0), 32.4, 0.3)
put(bell(2093, 1.2), 32.55, 0.3)

# --- scene 7: breakdown pad + coins
put(pad([NOTE(57), NOTE(60), NOTE(64), NOTE(69)], 3.0), 34.0, 0.9)
put(pad([NOTE(53), NOTE(57), NOTE(60), NOTE(65)], 3.0), 37.0, 0.9)
for c in (35.5, 37.5, 39.0):
    put(tone(1976, 0.08, "square", 30), c + 0.45, 0.28)
    put(bell(2637, 0.7), c + 0.53, 0.3)
put(kick(), 34.0, 0.9)
for k in range(4):
    put(kick(), 36.0 + k * 0.5, 0.5)

# --- master: soft clip, fade out, normalise
out = np.tanh(out * 1.1)
fade = np.ones(N)
fade[-int(0.5 * SR):] = np.linspace(1, 0, int(0.5 * SR))
fade[: int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
out *= fade
out = out / max(1e-9, np.max(np.abs(out))) * 0.89
pcm = (out * 32767).astype(np.int16)
stereo = np.column_stack([pcm, pcm]).ravel()
with wave.open(sys.argv[1] if len(sys.argv) > 1 else "promo.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(stereo.tobytes())
print("ok", round(len(pcm) / SR, 2), "s")
