import { button, el, fmt } from "./ui.js";
import type { KioskApp } from "./kiosk.js";

let open: HTMLElement | null = null;

/** Hidden operator panel (Ctrl+Shift+O): rules, prizes, content, cards, rankings and stats. */
export function openOperator(app: KioskApp): void {
  if (open) { open.remove(); open = null; return; }
  const m = app.machine, cfg = m.cfg;
  const panel = el("div", "operator"); open = panel; panel.id = "operator";
  const close = () => { panel.remove(); open = null; app.showScreen(); };
  panel.append(el("h2", "", "PANEL DE OPERADOR"));

  // ---- rules
  const fields: [string, string, number, (v: number) => unknown][] = [
    ["Jugadas por deposito", "playsPerDeposit", cfg.credits.playsPerDeposit, (v) => ({ credits: { playsPerDeposit: v } })],
    ["Tickets maximos por partida", "maxPerPlay", cfg.tickets.maxPerPlay, (v) => ({ tickets: { maxPerPlay: v } })],
    ["Exponente de la curva", "curveExponent", cfg.tickets.curveExponent, (v) => ({ tickets: { curveExponent: v } })],
    ["Objetos minimos para pagar tickets", "minObjectsForTickets", cfg.tickets.minObjectsForTickets, (v) => ({ tickets: { minObjectsForTickets: v } })],
    ["Largo maximo del nombre", "nameMaxLength", cfg.leaderboard.nameMaxLength, (v) => ({ leaderboard: { nameMaxLength: v } })],
    ["Tamano del ranking", "size", cfg.leaderboard.size, (v) => ({ leaderboard: { size: v } })],
  ];
  panel.append(el("h2", "", "REGLAS"));
  for (const [label, id, value, make] of fields) {
    const l = el("label"), i = el("input"); i.type = "number"; i.step = "any"; i.value = String(value); i.id = `op-${id}`;
    i.addEventListener("change", () => { const v = Number(i.value); if (Number.isFinite(v)) m.setConfig(make(v)); });
    l.append(el("span", "", label), i); panel.append(l);
  }
  const boolRow = (label: string, id: string, value: boolean, make: (v: boolean) => unknown) => {
    const l = el("label"), i = el("input"); i.type = "checkbox"; i.checked = value; i.id = `op-${id}`;
    i.addEventListener("change", () => m.setConfig(make(i.checked))); l.append(el("span", "", label), i); panel.append(l);
  };
  boolRow("La tarjeta da un deposito", "cardGivesDeposit", cfg.credits.cardGivesDeposit, (v) => ({ credits: { cardGivesDeposit: v } }));
  boolRow("Sin tarjeta se pierden los tickets", "cardRequired", cfg.tickets.cardRequired, (v) => ({ tickets: { cardRequired: v } }));
  boolRow("Tutorial en la primera sesion", "tutorial", cfg.tutorial.enabledFirstSession, (v) => ({ tutorial: { enabledFirstSession: v } }));

  // ---- prizes
  panel.append(el("h2", "", "PREMIOS (JSON: id, name, tickets)"));
  const ta = el("textarea"); ta.id = "op-prizes"; ta.rows = 7; ta.style.cssText = "width:100%;background:#12102e;color:#f5f5ff;border:2px solid #8c88b8;border-radius:8px;font:inherit;padding:8px";
  ta.value = JSON.stringify(cfg.prizes, null, 1);
  panel.append(ta, button("GUARDAR PREMIOS", () => { try { m.setConfig({ prizes: JSON.parse(ta.value) }); app.toast("PREMIOS GUARDADOS"); } catch { app.toast("JSON INVALIDO"); } }, "", "op-save-prizes"));

  // ---- content
  panel.append(el("h2", "", "CONTENIDO (.OSZ MAPAS, .OSK SKINS)"));
  const input = el("input"); input.type = "file"; input.multiple = true; input.accept = ".osz,.osk,.zip"; input.id = "files";
  const list = el("div"); const status = el("div", "dim");
  const refresh = () => {
    list.replaceChildren();
    for (const p of app.library.packs) {
      const row = el("div", "row"); row.append(el("span", "", `${p.name}  -  ${p.beatmaps.length} mapas${p.hasSkin ? "  +  skin" : ""}`), button("QUITAR", async () => { await app.library.remove(p.name); refresh(); }, "", `rm-${p.id}`));
      list.append(row);
    }
    if (!app.library.packs.length) list.append(el("div", "dim", "No hay archivos instalados."));
  };
  input.addEventListener("change", async () => {
    for (const f of Array.from(input.files ?? [])) {
      try { status.textContent = `Leyendo ${f.name}...`; await app.library.add(f.name, new Uint8Array(await f.arrayBuffer())); status.textContent = `${f.name} agregado`; }
      catch (e) { status.textContent = `No se pudo leer ${f.name}: ${(e as Error).message}`; status.className = "err"; }
    }
    refresh();
  });
  panel.append(input, status, list); refresh();

  // ---- cards
  panel.append(el("h2", "", "TARJETAS"));
  const cards = m.cards.list();
  const tbl = el("table"); tbl.append(Object.assign(el("tr"), { innerHTML: "<th>UID</th><th>TICKETS</th><th></th>" }));
  for (const c of cards) {
    const tr = el("tr"); const act = el("td");
    act.append(button("+1000", () => { m.cards.adjust(c.uid, 1000, "operador"); app.updateMeters(); close(); openOperator(app); }, "", `add-${c.uid}`));
    tr.append(Object.assign(el("td"), { textContent: c.uid }), Object.assign(el("td"), { textContent: fmt(c.tickets) }), act); tbl.append(tr);
  }
  panel.append(cards.length ? tbl : el("div", "dim", "Aun no hay tarjetas registradas."));

  // ---- rankings
  panel.append(el("h2", "", "RANKINGS"));
  for (const e of app.library.entries) {
    const n = m.boards.list(e.mapKey).length; if (!n) continue;
    const row = el("div", "row"); row.append(el("span", "", `${e.entry.beatmap.metadata.title} [${e.entry.beatmap.metadata.version}]: ${n} entradas`), button("REINICIAR", () => { m.boards.reset(e.mapKey); close(); openOperator(app); }, "", `reset-${e.mapKey}`));
    panel.append(row);
  }

  // ---- stats
  panel.append(el("h2", "", "ESTADISTICAS"));
  const st = m.stats;
  panel.append(el("div", "", `Monedas ${st.coins}   Depositos con tarjeta ${st.cardDeposits}   Partidas ${st.plays}   Tickets pagados ${fmt(st.ticketsPaid)}   Tickets perdidos ${fmt(st.ticketsLost)}   Tickets canjeados ${fmt(st.ticketsRedeemed)}`));
  panel.append(button("CERRAR", close, "primary", "op-close"));
  app.screenHost().append(panel);
}
