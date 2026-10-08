"""Soundtrack mixer for the POIPIU promo (80 s).

- 0-3 s: synthesized riser + impact.
- Menus, results and outro: a synthesized arcade groove plus effects for every on-screen event.
- Each gameplay chunk (12 s): the map's own song, cut at the replay's start so music and cursor stay in sync,
  plus the map's hit sound at every judged hit of the replay.

Usage: python3 -I audio.py <workdir> <out.wav>   (reads private/data.json and private/<key>-audio.mp3|-hit.wav)
"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

SR = 44100
DUR = 80.0
N = int(SR * DUR)
work, out_path = Path(sys.argv[1]), sys.argv[2]
priv = Path("private")
out = np.zeros((N, 2), dtype=np.float64)
rng = np.random.default_rng(7)

TL = dict(coin=3, skin=6.5, map=9.5, g1=12.5, r1=24.5, c1=27, g2=29.5, r2=41.5, c2=44, g3=46.5, r3=58.5, rank=63.5, prize=69.5, cta=74.5)
GAME_LEN = 12.0
GAMES = [("deneb", TL["g1"]), ("kimi", TL["g2"]), ("shiori", TL["g3"])]
data = json.loads((priv / "data.json").read_text())["maps"]


def put(sig, t0, gain=1.0, pan=0.0):
    if sig.ndim == 1:
        sig = np.column_stack([sig, sig])
    i = int(round(t0 * SR))
    if i >= N or i + len(sig) <= 0:
        return
    s0 = max(0, -i)
    i = max(0, i)
    j = min(N, i + len(sig) - s0)
    seg = sig[s0: s0 + (j - i)] * gain
    out[i:j, 0] += seg[:, 0] * (1 - max(0, pan))
    out[i:j, 1] += seg[:, 1] * (1 + min(0, pan))


def tarr(d):
    return np.arange(int(d * SR)) / SR


def kick():
    t = tarr(0.28)
    f = 42 + 110 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def clap():
    t = tarr(0.22)
    n = rng.standard_normal(len(t))
    return n * np.exp(-t * 22) * 0.6 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.3


def hat(open_=False):
    t = tarr(0.18 if open_ else 0.06)
    n = np.diff(rng.standard_normal(len(t) + 1))
    return n * np.exp(-t * (28 if open_ else 80))


def tone(freq, d, shape="tri", decay=5.0):
    t = tarr(d)
    x = 2 * np.pi * freq * t
    if shape == "sine":
        s = np.sin(x)
    elif shape == "tri":
        s = (2 / np.pi) * np.arcsin(np.sin(x))
    elif shape == "saw":
        s = sum(np.sin(x * k) / k for k in range(1, 6)) * 0.6
    else:
        s = np.sign(np.sin(x)) * 0.5
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
chime = lambda t0, g=0.22: put(bell(NOTE(84)) + bell(NOTE(88)) + bell(NOTE(91)), t0, g)


def groove(t_start, t_end, gain=1.0, full=True):
    """Synthesized 120 BPM groove (A minor loop) between two times."""
    roots = [NOTE(33), NOTE(29), NOTE(36), NOTE(31)]
    penta = [NOTE(n) for n in (69, 72, 74, 76, 79, 81)]
    t0 = t_start
    while t0 < t_end - 1e-6:
        beat = int(round((t0 - t_start) / 0.5))
        put(kick(), t0, 0.9 * gain)
        if beat % 2 == 1:
            put(clap(), t0, 0.5 * gain)
        put(hat(), t0 + 0.25, 0.45 * gain)
        bar = int((t0 - t_start) // 2) % 4
        for q, mul in enumerate((1, 1, 2, 1)):
            put(tone(roots[bar] * mul, 0.22, "saw", 7), t0 + q * 0.125, 0.3 * gain)
        if full:
            put(tone(penta[(beat * 3) % 6], 0.2, "tri", 9), t0, 0.2 * gain)
            put(tone(penta[(beat * 3 + 2) % 6], 0.2, "tri", 9), t0 + 0.25, 0.16 * gain)
        t0 += 0.5


def decode(src, dst, start=None, dur=None, mono=False):
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if start is not None:
        cmd += ["-ss", str(start)]
    if dur is not None:
        cmd += ["-t", str(dur)]
    cmd += ["-i", str(src), "-ar", str(SR), "-ac", "1" if mono else "2", "-c:a", "pcm_s16le", str(dst)]
    subprocess.run(cmd, check=True)
    with wave.open(str(dst), "rb") as w:
        raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768.0
        return raw.reshape(-1, 2) if not mono else raw


# ---------------- intro ----------------
t = tarr(1.5)
n = np.diff(rng.standard_normal(len(t) + 1))
put(n * (t / 1.5) ** 2 * 0.5, 0)
put(np.sin(2 * np.pi * np.cumsum(200 + 1800 * (t / 1.5) ** 2) / SR) * (t / 1.5) ** 2 * 0.3, 0)
t = tarr(1.6)
put(np.sin(2 * np.pi * 38 * t) * np.exp(-t * 2.2), 1.5)
put(kick() * 1.2, 1.5)
put(rng.standard_normal(int(0.5 * SR)) * np.exp(-tarr(0.5) * 9) * 0.4, 1.5)
put(pad([NOTE(57), NOTE(60), NOTE(64)], 1.6), 1.5)

# ---------------- grooves between the plays ----------------
groove(TL["coin"], TL["g1"], 0.42)
groove(TL["r1"], TL["g2"], 0.30, full=False)
groove(TL["r2"], TL["g3"], 0.30, full=False)
groove(TL["r3"], DUR, 0.42)

# ---------------- gameplay chunks: real songs + hit sounds ----------------
for key, t0 in GAMES:
    m = data[key]
    r0 = m["play"]["r0"]
    song = decode(priv / f"{key}-audio.mp3", work / f"{key}-song.wav", start=r0, dur=GAME_LEN + 0.4)
    n_s = min(len(song), int((GAME_LEN + 0.3) * SR))
    song = song[:n_s].copy()
    f_in, f_out = int(0.06 * SR), int(0.3 * SR)
    song[:f_in] *= np.linspace(0, 1, f_in)[:, None]
    song[-f_out:] *= np.linspace(1, 0, f_out)[:, None]
    put(song, t0, 0.95)
    hit = decode(priv / f"{key}-hit.wav", work / f"{key}-hit.wav", mono=True)
    k = min(len(hit), int(0.35 * SR))
    hit = hit[:k] * np.linspace(1, 0, k)
    for h in m["play"]["hits"]:
        put(hit, t0 + (h / 1000.0 - r0), 0.30)

# ---------------- effects ----------------
CUTS = [TL[k] for k in ("coin", "skin", "map", "g1", "r1", "c1", "g2", "r2", "c2", "g3", "r3", "rank", "prize", "cta")]
for b in CUTS:
    put(whoosh(0.4), b - 0.22, 0.45)

# card tap
put(whoosh(0.5), TL["coin"] + 0.8, 0.35)
put(tone(1318, 0.09, "square", 24), TL["coin"] + 1.7, 0.25)
put(tone(1760, 0.12, "square", 20), TL["coin"] + 1.82, 0.25)
for i in range(3):
    put(tone(NOTE(76 + 4 * i), 0.14, "sine", 14), TL["coin"] + 2.0 + i * 0.28, 0.3)
# skin select
for tt in (TL["skin"] + 0.9, TL["skin"] + 1.8):
    put(tone(NOTE(79), 0.08, "square", 28), tt, 0.2)
chime(TL["skin"] + 2.4, 0.2)
# map select + countdown
put(whoosh(0.6), TL["map"] + 0.4, 0.4)
for i in range(3):
    put(tone(880, 0.16, "sine", 12), TL["map"] + 1.5 + i * 0.5, 0.4)
put(tone(1760, 0.3, "sine", 7), TL["g1"], 0.35)


def result_fx(t0, fly):
    put(whoosh(0.35), t0 + 0.05, 0.35)
    tt = t0 + 0.35
    while tt < t0 + 1.5:
        put(tone(1250, 0.025, "square", 70), tt, 0.12)
        tt += 0.07
    put(whoosh(0.5), fly - 0.8, 0.3)
    put(bell(NOTE(96), 0.5), fly, 0.25)


result_fx(TL["r1"], TL["r1"] + 1.3)
result_fx(TL["r2"], TL["r2"] + 1.3)
# changes + countdowns
for c in (TL["c1"], TL["c2"]):
    put(tone(NOTE(79), 0.08, "square", 28), c + 0.7, 0.2)
    put(tone(NOTE(83), 0.08, "square", 28), c + 1.0, 0.2)
    for i in range(3):
        put(tone(880, 0.16, "sine", 12), c + 0.9 + i * 0.5, 0.38)
for g in (TL["g2"], TL["g3"]):
    put(tone(1760, 0.3, "sine", 7), g, 0.35)
# summary
for i in range(3):
    put(whoosh(0.3), TL["r3"] + 0.2 + i * 0.2, 0.3)
    put(tone(NOTE(72 + 3 * i), 0.1, "sine", 18), TL["r3"] + 0.35 + i * 0.2, 0.3)
put(bell(NOTE(96), 0.5), TL["r3"] + 0.9, 0.25)
chime(TL["r3"] + 1.7, 0.26)
# ranking
put(whoosh(0.35), TL["rank"] + 0.8, 0.4)
put(tone(180, 0.15, "sine", 18), TL["rank"] + 1.5, 0.5)
for i in range(6):
    put(tone(1100, 0.04, "square", 60), TL["rank"] + 2.0 + i * 0.42, 0.3)
chime(TL["rank"] + 4.8, 0.28)
# prize
put(whoosh(0.5), TL["prize"] + 0.35, 0.4)
r2_ = np.random.default_rng(3)
tt = TL["prize"] + 3.2
while tt < TL["prize"] + 4.4:
    put(bell(float(r2_.choice([1568, 1976, 2349, 2637])), 0.3), tt, 0.1)
    tt += 0.09 + r2_.random() * 0.06
for i in range(14):
    put(tone(1000, 0.03, "square", 60), TL["prize"] + 3.3 + i * 0.07, 0.12)
put(bell(1568, 1.0), TL["prize"] + 4.2, 0.28)
put(bell(2093, 1.2), TL["prize"] + 4.35, 0.28)
# call to action coins
for c in (TL["cta"] + 1.4, TL["cta"] + 3.0):
    put(tone(1976, 0.08, "square", 30), c + 0.45, 0.25)
    put(bell(2637, 0.7), c + 0.53, 0.28)

# ---------------- master ----------------
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
