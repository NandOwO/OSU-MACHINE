export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function button(label: string, onClick: () => void, cls = "", id = ""): HTMLButtonElement {
  const b = el("button", cls, label);
  b.type = "button";
  if (id) b.id = id;
  b.addEventListener("click", onClick);
  return b;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");

/** Animates a number from `from` to `to` inside an element. Returns a canceller. */
export function countUp(node: HTMLElement, to: number, ms = 1400, from = 0, format: (n: number) => string = fmt): () => void {
  let raf = 0;
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    node.textContent = format(from + (to - from) * e);
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Dots showing how many plays are left. */
export function playDots(left: number, total = 3): HTMLElement {
  const wrap = el("span", "dots");
  for (let i = 0; i < Math.max(total, left); i++) wrap.append(el("i", i < left ? "on" : ""));
  return wrap;
}
