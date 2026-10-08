import type { KioskApp } from "./kiosk.js";
import { button, el } from "./ui.js";

let dialog: HTMLElement | null = null;

/** Player-facing dialog to install maps (.osz) and skins (.osk) and to remove them again. */
export function openImport(app: KioskApp): void {
  if (dialog) { dialog.remove(); dialog = null; app.onImportStatus(null); return; }
  const panel = el("div", "operator importer"); dialog = panel; panel.id = "import-dialog";
  const close = () => { panel.remove(); dialog = null; app.onImportStatus(null); app.showScreen(); };

  panel.append(el("h2", "", "IMPORTAR MAPAS Y SKINS"));
  const drop = el("div", "dropzone", "ARRASTRA AQUI TUS ARCHIVOS .OSZ (MAPAS) Y .OSK (SKINS), O ELIGELOS");
  const input = el("input"); input.type = "file"; input.multiple = true; input.accept = ".osz,.osk,.zip"; input.id = "import-files";
  input.addEventListener("change", () => { const f = Array.from(input.files ?? []); input.value = ""; if (f.length) void app.importFiles(f).then(refresh); });
  const pick = button("ELEGIR ARCHIVOS", () => input.click(), "primary", "import-pick");
  input.style.display = "none";
  drop.append(el("br"), pick, input);
  panel.append(drop);
  const status = el("div", "dim", "Un .osz puede traer varios mapas y, a veces, su propia skin. Un .osk es solo una skin.");
  status.id = "import-status";
  const errs = el("div", "err");
  panel.append(status, errs);
  app.onImportStatus((msg, errors) => { status.textContent = msg; status.className = errors.length && msg === "NADA IMPORTADO" ? "err" : ""; errs.replaceChildren(...errors.map((e) => el("div", "", e))); });

  panel.append(el("h2", "", "INSTALADO"));
  const list = el("div"); list.id = "import-list";
  const refresh = () => {
    list.replaceChildren();
    for (const p of app.library.packs) {
      const row = el("div", "row");
      row.append(el("span", "", `${p.name}  -  ${p.beatmaps.length} mapa${p.beatmaps.length === 1 ? "" : "s"}${p.hasSkin ? "  +  skin" : ""}`),
        button("QUITAR", async () => { await app.library.remove(p.name); if (app.selected && app.selected.pack === p) app.selected = null; refresh(); }, "", `rm-${p.id}`));
      list.append(row);
    }
    if (!app.library.packs.length) list.append(el("div", "dim", "Todavia no hay mapas. Importa un .osz para empezar."));
  };
  refresh();
  panel.append(list, button("LISTO", close, "primary", "import-close"));
  app.screenHost().append(panel);
}
