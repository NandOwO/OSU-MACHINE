"""Packs the built web app (dist/) into one self-contained HTML page: code, styles, font and logo inline.
Usage: python3 -I tools/build-single.py [out.html]   (run `npx vite build` first)"""
import base64, re, sys
from pathlib import Path

dist = Path("dist")
out = Path(sys.argv[1] if len(sys.argv) > 1 else "dist-single/poipiu.html")
html = (dist / "index.html").read_text()

js_path = dist / re.search(r'<script[^>]+src="\./([^"]+\.js)"', html).group(1)
css_path = dist / re.search(r'<link[^>]+href="\./([^"]+\.css)"', html).group(1)
js, css = js_path.read_text(), css_path.read_text()

def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()

# Font and any asset the CSS/JS point at by path become data URIs.
font = dist / "fonts" / "PressStart2P-Regular.ttf"
css = re.sub(r'url\(["\']?(?:\./|/|\.\./)?fonts/PressStart2P-Regular\.ttf["\']?\)', f'url({data_uri(font, "font/ttf")})', css)
for svg in (dist / "assets").glob("*.svg"):
    js = js.replace(f"./assets/{svg.name}", data_uri(svg, "image/svg+xml")).replace(f"assets/{svg.name}", data_uri(svg, "image/svg+xml"))
    css = css.replace(f"./{svg.name}", data_uri(svg, "image/svg+xml"))
js = re.sub(r"//# sourceMappingURL=.*", "", js).replace("</script", "<\\/script")
assert "fonts/PressStart2P" not in css, "font URL was not inlined"

factory = ""
if len(sys.argv) > 2:  # optional: dir with slimmed .osz/.osk to embed as factory content
    import json
    packs = {f.name: base64.b64encode(f.read_bytes()).decode() for f in sorted(Path(sys.argv[2]).iterdir()) if f.suffix.lower() in (".osz", ".osk")}
    factory = '<script type="application/json" id="factory-content">' + json.dumps(packs) + "</script>\n"

page = f"""<title>POIPIU</title>POIPIU</title>
<style>
{css}
#narrow {{ display: none; position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 30; padding: 10px 14px; border-radius: 10px;
  background: rgb(18 16 46 / 0.96); border: 2px solid var(--neon-pink); color: var(--text); font: 12px/1.5 var(--font-ui); text-align: center; }}
@media (max-width: 760px) {{ #narrow {{ display: block; }} }}
</style>
<div id="stage"><canvas id="game" width="1920" height="1080"></canvas><div id="ui"></div></div>
<p id="narrow">POIPIU se juega con mouse y pantalla horizontal. En el celular solo se ve la demostración.</p>
<script type="module">
{js}
</script>
{factory}"""
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page)
print(out, round(len(page) / 1024), "KB")
