import { PlayRenderer, FIELD } from "../render/PlayRenderer.js";
import { expandCharset } from "../kiosk/config.js";
import type { Screen } from "../kiosk/machine.js";
import { rankOf } from "../kiosk/rank.js";
import type { LibEntry } from "./library.js";
import type { KioskApp } from "./kiosk.js";
import { tutorialMap } from "./tutorialMap.js";
import { button, countUp, el, fmt, playDots } from "./ui.js";
import logoUrl from "../../prototipo/logo/poipiu-logo.svg?url";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const bpmOf = (e: LibEntry) => { const p = e.entry.beatmap.timingPoints.find((t) => t.uninherited); return p ? Math.round(60000 / p.beatLength) : 0; };
const lengthOf = (e: LibEntry) => { const o = e.entry.beatmap.hitObjects; return o.length ? (o[o.length - 1]!.time - o[0]!.time) / 1000 : 0; };
const kv = (label: string, value: string): HTMLElement => { const d = el("div", "kv", label); d.append(el("b", "", value)); return d; };
const title = (e: LibEntry) => `${e.entry.beatmap.metadata.artist} - ${e.entry.beatmap.metadata.title}`;

// ------------------------------------------------------------------ idle

function idle(app: KioskApp): HTMLElement {
  const s = el("div", "screen idle");
  const logo = el("img", "logo"); logo.src = logoUrl; logo.alt = "POIPIU";
  s.append(logo, el("div", "big blink", "PASA TU TARJETA"), el("div", "sub blink", "INSERT COIN"));
  let best: { name: string; score: number; map: string } | null = null;
  for (const e of app.library.entries) { const top = app.machine.boards.list(e.mapKey)[0]; if (top && (!best || top.score > best.score)) best = { name: top.name, score: top.score, map: e.entry.beatmap.metadata.title }; }
  s.append(el("div", "note", best ? `TOP: ${best.name}  ${fmt(best.score)}  - ${best.map.toUpperCase()}` : "SIGUE EL RITMO. SUMA PUNTOS. GANA PREMIOS."));
  if (!app.library.entries.length) s.append(el("div", "note", "SIN MAPAS INSTALADOS. ABRE EL PANEL DE OPERADOR (CTRL+SHIFT+O) Y AGREGA ARCHIVOS .OSZ"));
  return s;
}

// ------------------------------------------------------------------ credited

function credited(app: KioskApp): HTMLElement {
  const m = app.machine, sess = m.session!;
  const s = el("div", "screen");
  s.append(el("h2", "title yellow", "DEPOSITO ACEPTADO"));
  const plays = el("div", "big", `${m.playsLeft} JUGADAS`); plays.append(playDots(m.playsLeft, Math.max(3, m.playsLeft)));
  s.append(plays);
  const card = el("div", "card pink");
  if (sess.cardUid) {
    card.append(kv("TARJETA", `..${sess.cardUid}`), kv("SALDO DE TICKETS", fmt(m.balance)));
  } else {
    card.append(kv("SIN TARJETA", "SOLO MONEDA"), el("div", "note", m.cfg.tickets.cardRequired ? "PASA TU TARJETA PARA ACUMULAR TICKETS. SIN ELLA SE PIERDEN." : "JUEGAS SIN TARJETA."));
  }
  s.append(card, el("div", "note", "CADA INTENTO O CAMBIO DE MAPA USA UNA JUGADA."), button("COMENZAR", () => m.continueFromCredit(), "primary", "start"));
  return s;
}

// ------------------------------------------------------------------ tutorial

const TUTORIAL = [
  { head: "1/3  TIMING", text: "UN ANILLO SE ENCOGE HACIA EL CIRCULO. HAZ CLIC (O Z / X) CUANDO LO TOQUE." },
  { head: "2/3  SLIDERS", text: "MANTEN EL CLIC Y SIGUE LA BOLA HASTA EL FINAL DEL SLIDER." },
  { head: "3/3  COMBO Y PUNTOS", text: "CADA GOLPE SEGUIDO SUBE EL COMBO Y MULTIPLICA TUS PUNTOS. NO FALLES." },
];
function tutorial(app: KioskApp): HTMLElement {
  const s = el("div", "screen");
  s.style.justifyContent = "flex-end"; s.style.paddingBottom = "4vh";
  const step = TUTORIAL[app.tutorialStep - 1]!;
  const card = el("div", "card");
  card.append(el("h2", "title", step.head), el("div", "note", step.text));
  const row = el("div", "btn-row");
  row.append(
    button(app.tutorialStep < 3 ? "SIGUIENTE" : "LISTO", () => { if (app.tutorialStep < 3) { app.tutorialStep = (app.tutorialStep + 1) as 1 | 2 | 3; app.showScreen(); } else { app.tutorialStep = 1; app.machine.finishTutorial(); } }, "primary", "tut-next"),
    button("SALTAR", () => { app.tutorialStep = 1; app.machine.finishTutorial(); }, "", "tut-skip"),
  );
  card.append(row); s.append(card);
  app.startTutorialDemo();
  return s;
}

// ------------------------------------------------------------------ skins

function skinPreview(canvas: HTMLCanvasElement, app: KioskApp, skinIndex: number): () => void {
  const skin = app.library.skins[skinIndex]!, g = canvas.getContext("2d")!;
  const r = new PlayRenderer(tutorialMap(3), skin);
  const k = canvas.width / 1024;
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = 1400 + ((app.manual ? 0 : performance.now()) % 3800);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#0b0a22"; g.fillRect(0, 0, canvas.width, canvas.height);
    g.save(); g.scale(k, k); g.translate(-FIELD.x, -FIELD.y + 60); r.draw(g, t, { x: 200 + (t % 1000) / 6, y: 190 }, true); g.restore();
  };
  loop();
  return () => cancelAnimationFrame(raf);
}
function skin(app: KioskApp): HTMLElement {
  const s = el("div", "screen");
  s.append(el("h2", "title pink", "ELIGE TU SKIN"));
  const wrap = el("div", "skins");
  app.library.skins.forEach((sk, i) => {
    const c = el("div", "card skin" + (i === app.skinIdx ? " sel" : "")); c.dataset.skin = String(i);
    const cv = el("canvas"); cv.width = 360; cv.height = 280;
    c.append(cv, el("b", "", sk.name.replace(/[^\w .\-()+']/g, "").trim().slice(0, 26).toUpperCase() || `SKIN ${i}`), el("small", "", sk.author ? `POR ${sk.author}` : ""));
    c.addEventListener("click", () => { app.skinIdx = i; wrap.querySelectorAll(".skin").forEach((n) => n.classList.remove("sel")); c.classList.add("sel"); });
    wrap.append(c);
    if (!app.manual) app.onCleanup(skinPreview(cv, app, i)); else skinPreview(cv, app, i)();
  });
  s.append(wrap, el("div", "note", "IMPORTA TU PROPIA SKIN (.OSK / .OSZ) DESDE EL PANEL DE OPERADOR."), button("CONFIRMAR", () => app.machine.chooseSkin(), "primary", "skin-ok"));
  return s;
}

// ------------------------------------------------------------------ map select

function map(app: KioskApp): HTMLElement {
  const lib = app.library, m = app.machine, groups = lib.groups();
  const s = el("div", "screen mapsel");
  if (!groups.length) {
    s.style.justifyContent = "center";
    s.append(el("h2", "title", "SIN MAPAS"), el("div", "note", "AGREGA ARCHIVOS .OSZ DESDE EL PANEL DE OPERADOR (CTRL+SHIFT+O)."), button("OTRA SKIN", () => m.backToSkin(), "", "back-skin"));
    return s;
  }
  if (!app.selected || !lib.entries.includes(app.selected)) app.selected = groups[0]!.entries[Math.floor(groups[0]!.entries.length / 2)]!;
  const sel = app.selected, group = groups.find((g) => g.entries.includes(sel))!;
  app.setCover(sel.coverUrl);

  const list = el("div", "groups");
  for (const g of groups) {
    const e0 = g.entries[0]!, meta = e0.entry.beatmap.metadata;
    const row = el("div", "group" + (g === group ? " sel" : "")); row.dataset.pack = g.pack.name;
    const th = el("div", "thumb"); if (e0.coverUrl) th.style.backgroundImage = `url(${e0.coverUrl})`;
    const info = el("div"); info.append(el("b", "", meta.title), el("small", "", `${meta.artist}  ·  ${g.entries.length} dificultades`));
    row.append(th, info);
    row.addEventListener("click", () => { if (g !== group) { app.selected = g.entries[Math.floor(g.entries.length / 2)]!; app.showScreen(); } });
    list.append(row);
  }

  const detail = el("div", "detail");
  const cover = el("div", "cover"); if (sel.coverUrl) cover.style.backgroundImage = `url(${sel.coverUrl})`;
  const mt = sel.entry.beatmap.metadata;
  detail.append(cover, el("h3", "", title(sel)), el("div", "meta", `Mapa de ${mt.creator}  ·  BPM ${bpmOf(sel)}  ·  ${mmss(lengthOf(sel))}  ·  ${sel.entry.beatmap.hitObjects.length} objetos`));
  const chips = el("div", "chips");
  for (const e of group.entries) {
    const c = el("span", "chip" + (e === sel ? " sel" : ""), e.entry.beatmap.metadata.version.toUpperCase().slice(0, 22));
    c.addEventListener("click", () => { app.selected = e; app.showScreen(); });
    chips.append(c);
  }
  const d = sel.entry.beatmap.difficulty;
  detail.append(chips, el("div", "meta", `AR ${d.ar}   CS ${d.cs}   OD ${d.od}   HP ${d.hp}`));
  const top = m.boards.list(sel.mapKey).slice(0, 3), t3 = el("div", "top3", "TOP 3  ");
  if (!top.length) t3.append(document.createTextNode("AUN NADIE. SE EL PRIMERO."));
  top.forEach((e, i) => { t3.append(el("br"), document.createTextNode(`#${i + 1}  ${e.name.padEnd(8, " ")}  `)); const b = el("b", "", fmt(e.score)); t3.append(b); });
  detail.append(t3);
  const actions = el("div", "btn-row");
  const play = button(`JUGAR  (${m.playsLeft})`, () => { void app.startSelectedPlay(); }, "primary", "play");
  play.disabled = m.playsLeft <= 0;
  actions.append(play, button("OTRA SKIN", () => m.backToSkin(), "", "back-skin"));
  detail.append(actions);
  s.append(list, detail);

  const move = (dg: number, dd: number) => {
    const gi = groups.indexOf(group);
    if (dg) { const g = groups[(gi + dg + groups.length) % groups.length]!; app.selected = g.entries[Math.min(g.entries.length - 1, Math.floor(g.entries.length / 2))]!; }
    else { const i = group.entries.indexOf(sel); app.selected = group.entries[(i + dd + group.entries.length) % group.entries.length]!; }
    app.showScreen();
  };
  const key = (e: KeyboardEvent) => {
    if (e.code === "ArrowDown") move(1, 0); else if (e.code === "ArrowUp") move(-1, 0);
    else if (e.code === "ArrowRight") move(0, 1); else if (e.code === "ArrowLeft") move(0, -1);
    else if (e.code === "Enter" && m.playsLeft > 0) void app.startSelectedPlay();
  };
  window.addEventListener("keydown", key); app.onCleanup(() => window.removeEventListener("keydown", key));
  void app.previewMap(sel);
  return s;
}

// ------------------------------------------------------------------ results

function results(app: KioskApp): HTMLElement {
  const m = app.machine, r = m.results!, o = r.outcome;
  const s = el("div", "screen");
  const rk = rankOf({ ...o, accuracy: o.accuracy });
  s.append(el("h2", "title yellow", "COMPLETADO"));
  const top = el("div", "btn-row"); top.style.alignItems = "center"; top.style.gap = "4vw";
  top.append(el("div", `rank ${rk}`, rk));
  const col = el("div"); const score = el("div", "big", "0"); score.id = "score";
  col.append(score, el("div", "sub", `PRECISION ${(o.accuracy * 100).toFixed(2)}%   COMBO x${o.maxCombo}`));
  top.append(col); s.append(top);
  countUp(score, o.score, 1500);
  const st = el("div", "stats");
  for (const [cls, lbl, v] of [["s300", "300", o.n300], ["s100", "100", o.n100], ["s50", "50", o.n50], ["s0", "FALLOS", o.miss]] as const) { const c = el("div", cls); c.append(el("span", "", lbl), el("b", "", String(v))); st.append(c); }
  s.append(st);
  const tk = el("div", "big", r.tickets > 0 ? `+${r.tickets} TICKETS` : r.ticketsLost > 0 ? `SIN TARJETA: PERDISTE ${r.ticketsLost} TICKETS` : "0 TICKETS"); tk.id = "tickets-earned";
  if (r.ticketsLost > 0) { tk.style.color = "var(--judge-miss)"; tk.style.fontSize = "1.8vw"; }
  s.append(tk);
  if (r.rank !== null) s.append(el("div", "sub blink", `ENTRASTE AL TOP 50 - PUESTO #${r.rank}`));
  const row = el("div", "btn-row");
  const left = m.playsLeft;
  if (r.rank !== null || left === 0) row.append(button("CONTINUAR", () => m.continueFromResults(), "primary", "results-continue"));
  else {
    row.append(
      button(`REINTENTAR (${left})`, () => { m.playAgain(); void app.startSelectedPlay(); }, "primary", "retry"),
      button("CAMBIAR MAPA", () => m.playAgain(), "", "change"),
    );
    if (m.session?.cardUid) row.append(button("PREMIOS", () => m.openPrizes(), "", "to-prizes"));
    row.append(button("TERMINAR", () => m.endSession(), "", "end"));
  }
  s.append(row);
  return s;
}

// ------------------------------------------------------------------ name entry

function entryRows(app: KioskApp, name: string, hot: boolean): HTMLElement {
  const r = app.machine.results!, list = app.machine.boards.list(r.outcome.mapKey), rank = r.rank ?? 1;
  const rows = el("div", "rows"); rows.id = "rows";
  const all = [...list.slice(0, rank - 1).map((e, i) => ({ p: i + 1, n: e.name, s: e.score, hot: false })),
    { p: rank, n: name, s: r.outcome.score, hot },
    ...list.slice(rank - 1).map((e, i) => ({ p: rank + 1 + i, n: e.name, s: e.score, hot: false }))].slice(0, app.machine.cfg.leaderboard.size);
  const from = Math.max(0, rank - 4);
  for (const e of all.slice(from, from + 9)) {
    const row = el("div", "row-r" + (e.hot ? " hot" : ""));
    row.append(el("span", "p", `#${e.p}`), el("span", "", e.n), el("span", "s", fmt(e.s)));
    rows.append(row);
  }
  return rows;
}
function name(app: KioskApp): HTMLElement {
  const m = app.machine, cfg = m.cfg.leaderboard, charset = expandCharset(cfg.nameCharset);
  const s = el("div", "screen");
  s.append(el("h2", "title yellow", `PUESTO #${m.results!.rank}`), el("div", "sub", "ESCRIBE TU NOMBRE"));
  const chars: string[] = []; let cur = 0;
  const host = el("div"); const box = el("div", "namebox"); const rowsHolder = el("div");
  const draw = () => {
    box.replaceChildren();
    for (let i = 0; i < cfg.nameMaxLength; i++) {
      const c = el("div", "cell" + (i === cur ? " cur" : ""), chars[i] ?? "_"); c.dataset.i = String(i);
      c.addEventListener("click", () => { cur = Math.min(i, chars.length); draw(); });
      if (i === cur) {
        const up = button("▲", () => cycle(1), "up"), dn = button("▼", () => cycle(-1), "down");
        c.append(up, dn);
      }
      box.append(c);
    }
    rowsHolder.replaceChildren(entryRows(app, chars.join("") || "...", true));
  };
  const cycle = (d: number) => {
    const at = charset.indexOf(chars[cur] ?? charset[0]!);
    chars[cur] = charset[(at + d + charset.length) % charset.length]!; draw();
  };
  const type = (ch: string) => { if (cur < cfg.nameMaxLength && charset.includes(ch)) { chars[cur] = ch; cur = Math.min(cur + 1, cfg.nameMaxLength - 1); draw(); } };
  const submit = () => {
    const value = chars.join("");
    const rank = m.submitName(value, app.library.skins[app.skinIdx]?.name);
    if (rank === null && m.screen === "name") app.toast("NOMBRE NO VALIDO");
  };
  const key = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Enter") { e.preventDefault(); submit(); }
    else if (e.code === "Backspace") { e.preventDefault(); if (chars[cur]) chars[cur] = ""; else if (cur > 0) { cur--; chars[cur] = ""; } while (chars.length && !chars[chars.length - 1]) chars.pop(); draw(); }
    else if (e.code === "ArrowUp") { e.preventDefault(); cycle(1); } else if (e.code === "ArrowDown") { e.preventDefault(); cycle(-1); }
    else if (e.code === "ArrowLeft") { cur = Math.max(0, cur - 1); draw(); } else if (e.code === "ArrowRight") { cur = Math.min(chars.length, cfg.nameMaxLength - 1, cur + 1); draw(); }
    else if (e.key.length === 1) { e.preventDefault(); type(e.key.toUpperCase()); }
  };
  window.addEventListener("keydown", key); app.onCleanup(() => window.removeEventListener("keydown", key));
  host.append(box); s.append(host, rowsHolder, el("div", "note", "▲▼ CAMBIA LA LETRA   ◀▶ MUEVE   ENTER CONFIRMA   O ESCRIBE CON EL TECLADO"));
  const row = el("div", "btn-row"); row.append(button("OK", submit, "primary", "name-ok"), button("BORRAR", () => { chars.length = 0; cur = 0; draw(); }, "", "name-clear"));
  s.append(row); draw();
  return s;
}

// ------------------------------------------------------------------ ranking

function ranking(app: KioskApp): HTMLElement {
  const m = app.machine, mapKey = m.results!.outcome.mapKey, list = m.boards.list(mapKey);
  const s = el("div", "screen");
  s.append(el("h2", "title", "TOP 50"));
  const rows = el("div", "rows"); rows.id = "rows";
  list.forEach((e, i) => { const row = el("div", "row-r" + (m.lastRank === i + 1 ? " hot drop" : "")); row.append(el("span", "p", `#${i + 1}`), el("span", "", e.name), el("span", "s", fmt(e.score))); rows.append(row); });
  s.append(rows);
  queueMicrotask(() => rows.querySelector(".hot")?.scrollIntoView({ block: "center" }));
  if (m.lastRank) s.append(el("div", "big", `PUESTO #${m.lastRank}`));
  const row = el("div", "btn-row"), left = m.playsLeft;
  if (left > 0) row.append(button(`REINTENTAR (${left})`, () => { m.continueFromRanking(); void app.startSelectedPlay(); }, "primary", "retry"), button("CAMBIAR MAPA", () => m.continueFromRanking(), "", "change"));
  else row.append(button("CONTINUAR", () => m.continueFromRanking(), "primary", "ranking-continue"));
  if (m.session?.cardUid) row.append(button("PREMIOS", () => m.openPrizes(), "", "to-prizes"));
  row.append(button("TERMINAR", () => m.endSession(), "", "end"));
  s.append(row);
  return s;
}

// ------------------------------------------------------------------ prizes

function prizes(app: KioskApp): HTMLElement {
  const m = app.machine, s = el("div", "screen");
  s.append(el("h2", "title yellow", "CANJEA TUS TICKETS"));
  const bal = el("div", "big", `${fmt(m.balance)} TICKETS`); bal.id = "balance"; s.append(bal);
  const grid = el("div", "prizes");
  for (const p of m.cfg.prizes) {
    const ok = m.balance >= p.tickets, c = el("div", "card pink prize" + (ok ? "" : " no")); c.dataset.prize = p.id;
    c.append(el("b", "", p.name.toUpperCase()), el("div", "cost", fmt(p.tickets)), button(ok ? "CANJEAR" : `FALTAN ${fmt(p.tickets - m.balance)}`, () => {
      const r = m.redeem(p.id);
      if (r.ok) { const strip = el("div", "strip"); app.screenHost().append(strip); requestAnimationFrame(() => strip.classList.add("out")); setTimeout(() => strip.remove(), 4000); app.showScreen(); }
      else app.toast("NO ALCANZAN LOS TICKETS");
    }, "", `redeem-${p.id}`));
    (c.querySelector("button") as HTMLButtonElement).disabled = !ok;
    grid.append(c);
  }
  s.append(grid, button("CERRAR", () => m.closePrizes(), "primary", "prizes-close"));
  return s;
}

export const SCREENS: Record<Screen, (app: KioskApp) => HTMLElement> = {
  idle, credited, tutorial, skin, map, playing: () => el("div"), results, name, ranking, prizes,
};
