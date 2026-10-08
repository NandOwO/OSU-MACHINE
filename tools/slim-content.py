"""Shrinks factory maps/skins for the web demo (the artifact page has a size cap).
Usage: python3 -I tools/slim-content.py <in_dir> <out_dir>
Maps keep difficulties, one re-encoded audio track, a small background and hit sounds.
Skins keep only the osu!standard elements the renderer uses plus hit sounds."""
import io, json, os, re, subprocess, sys, tempfile, zipfile
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
SKIN_KEEP = re.compile(r"^(hitcircle.*|hitcircleoverlay.*|default-\d.*|approachcircle.*|cursor.*|sliderb.*|sliderfollowcircle.*|sliderstartcircle.*|sliderendcircle.*|reversearrow.*|followpoint.*|hit(0|50|100|300|300g|300k).*|sliderscorepoint.*|lighting.*|spinner-(approachcircle|circle|spin|clear).*|(normal|soft|drum)-(hit|slider).*|combobreak.*|failsound.*)\.(png|wav|mp3|ogg)$|^skin\.ini$", re.I)

def audio(data):
    with tempfile.NamedTemporaryFile(suffix=".bin") as f:
        f.write(data); f.flush()
        return subprocess.run(["ffmpeg", "-v", "error", "-i", f.name, "-vn", "-ac", "1", "-ar", "32000", "-b:a", "56k", "-f", "mp3", "-"], capture_output=True, check=True).stdout

def jpg(data):
    im = Image.open(io.BytesIO(data)).convert("RGB"); im.thumbnail((960, 540))
    out = io.BytesIO(); im.save(out, "JPEG", quality=65); return out.getvalue()

for fn in sorted(os.listdir(src)):
    if not re.search(r"\.(osz|osk)$", fn, re.I): continue
    zin = zipfile.ZipFile(os.path.join(src, fn)); is_map = fn.lower().endswith(".osz")
    bgs = set()
    names = zin.namelist()
    if is_map:
        for n in names:
            if n.lower().endswith(".osu"):
                for m in re.finditer(r'^0,0,"([^"]+)"', zin.read(n).decode("utf-8", "ignore"), re.M): bgs.add(m.group(1).lower())
        audios = set()
        for n in names:
            if n.lower().endswith(".osu"):
                m = re.search(r"^AudioFilename:\s*(.+?)\s*$", zin.read(n).decode("utf-8", "ignore"), re.M)
                if m: audios.add(m.group(1).lower())
    out = os.path.join(dst, fn)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for n in names:
            if n.endswith("/"): continue
            base = n.lower(); data = None
            if is_map:
                if base.endswith(".osu"): data = zin.read(n)
                elif base in audios: data = audio(zin.read(n))
                elif base in bgs: data = jpg(zin.read(n))
                elif re.search(r"^[^/]+\.wav$", base) and zin.getinfo(n).file_size < 150_000: data = zin.read(n)
            else:
                if "/" not in n and SKIN_KEEP.match(n):
                    data = zin.read(n)
                    if n.lower().endswith(".wav") and len(data) > 150_000: data = None
            if data is not None: z.writestr(n, data)
    print(fn, os.path.getsize(os.path.join(src, fn)) // 1024, "KB ->", os.path.getsize(out) // 1024, "KB")
json.dump(sorted(f for f in os.listdir(dst) if re.search(r"\.(osz|osk)$", f, re.I)), open(os.path.join(dst, "manifest.json"), "w"))
