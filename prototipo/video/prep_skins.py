"""Extracts only the images the promo needs from .osk skins into private/skins/<id>/ and writes manifest.json.
Usage: python3 -I prep_skins.py <out_dir> id=path.osk [id=path.osk ...]"""
import io, json, re, sys, zipfile
from pathlib import Path
from PIL import Image

out = Path(sys.argv[1])
manifest = {}

def parse_ini(text):
    ini, section = {}, ""
    colors = {}
    for raw in text.splitlines():
        line = raw.split("//")[0].strip()
        if not line:
            continue
        m = re.match(r"\[(.+)\]", line)
        if m:
            section = m.group(1); continue
        if ":" not in line:
            continue
        k, v = [s.strip() for s in line.split(":", 1)]
        if section == "Colours":
            if re.match(r"Combo\d+", k):
                colors[int(k[5:])] = [int(x) for x in v.split(",")[:3]]
            else:
                ini["c_" + k] = [int(x) for x in v.split(",")[:3]]
        else:
            ini.setdefault(k, v)
    ini["_colors"] = [colors[k] for k in sorted(colors)]
    return ini

for spec in sys.argv[2:]:
    sid, path = spec.split("=", 1)
    z = zipfile.ZipFile(path)
    names = {n.lower().replace("\\", "/"): n for n in z.namelist()}
    ini = parse_ini(z.read(names["skin.ini"]).decode("utf-8-sig", "replace"))
    prefix = ini.get("HitCirclePrefix", "default").replace("\\", "/").lower()
    d = out / sid
    d.mkdir(parents=True, exist_ok=True)
    files = {}

    def grab(key, candidates):
        for c in candidates:
            real = names.get(c.lower())
            if not real:
                continue
            data = z.read(real)
            try:
                im = Image.open(io.BytesIO(data)).convert("RGBA")
            except Exception:
                continue
            scale = 2 if "@2x" in c.lower() else 1
            fname = f"{key}.png"
            im.save(d / fname)
            files[key] = {"file": fname, "scale": scale, "w": im.width, "h": im.height, "hidden": im.width <= 2 and im.height <= 2}
            return True
        return False

    for base in ("hitcircle", "hitcircleoverlay", "approachcircle", "sliderfollowcircle", "cursor", "cursortrail",
                 "sliderendcircle", "sliderendcircleoverlay", "sliderstartcircle", "sliderstartcircleoverlay",
                 "sliderscorepoint", "reversearrow"):
        grab(base, [f"{base}@2x.png", f"{base}.png"])
    grab("sliderb", ["sliderb0@2x.png", "sliderb0.png", "sliderb@2x.png", "sliderb.png"])
    # Follow points: first animation frame that is actually visible (skins often hide the rest with 1x1 images).
    if not grab("followpoint", ["followpoint@2x.png", "followpoint.png"]) or files["followpoint"]["hidden"]:
        files.pop("followpoint", None)
        for n in range(0, 80):
            if grab("followpoint", [f"followpoint-{n}@2x.png", f"followpoint-{n}.png"]) and not files["followpoint"]["hidden"]:
                break
            files.pop("followpoint", None)
    for j in ("300", "100", "50", "0"):
        grab("hit" + j, [f"hit{j}-0@2x.png", f"hit{j}-0.png", f"hit{j}@2x.png", f"hit{j}.png"])
    for dgt in range(10):
        grab(f"digit{dgt}", [f"{prefix}-{dgt}@2x.png", f"{prefix}-{dgt}.png"])
    manifest[sid] = {
        "name": ini.get("Name", sid), "author": ini.get("Author", ""),
        "colors": ini["_colors"] or [[255, 255, 255]],
        "overlap": int(float(ini.get("HitCircleOverlap", "0"))),
        "sliderBorder": ini.get("c_SliderBorder", [255, 255, 255]),
        "sliderTrack": ini.get("c_SliderTrackOverride"),
        "files": files,
    }
    print(sid, sorted(files), "colors", len(ini["_colors"]))
(out / "manifest.json").write_text(json.dumps(manifest, indent=1))
