import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContentFolder, FileStore, safeName } from "../electron/store.mjs";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "poipiu-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("FileStore (machine data on disk)", () => {
  it("persists values across instances", () => {
    const d = tmp();
    new FileStore(d).set("cards", JSON.stringify({ A3F2: { tickets: 120 } }));
    expect(JSON.parse(new FileStore(d).get("cards")!)).toEqual({ A3F2: { tickets: 120 } });
  });
  it("never writes outside its folder, whatever the key", () => {
    const d = tmp();
    const s = new FileStore(d);
    s.set("../../etc/passwd", "{}");
    s.set("a/b\\c", "{}");
    expect(readdirSync(d).every((f) => f.endsWith(".json") && !f.includes("/"))).toBe(true);
    expect(safeName("../x")).toBe(".._x");
  });
  it("leaves no temporary files and removes leftovers of an interrupted write", () => {
    const d = tmp();
    const s = new FileStore(d);
    s.set("k", "1");
    expect(readdirSync(d)).toEqual(["k.json"]);
    writeFileSync(join(d, "k.json.tmp"), "half-written");
    new FileStore(d);
    expect(readdirSync(d)).toEqual(["k.json"]);
    expect(readFileSync(join(d, "k.json"), "utf8")).toBe("1");
  });
  it("rejects non-string and oversized values, and can remove keys", () => {
    const s = new FileStore(tmp());
    expect(() => s.set("k", 5 as unknown as string)).toThrow();
    expect(() => s.set("k", "x".repeat(9_000_000))).toThrow();
    s.set("k", "1"); s.remove("k");
    expect(s.get("k")).toBeNull();
  });
});

describe("ContentFolder (installed maps and skins)", () => {
  it("stores, lists, reads and removes only .osz and .osk", () => {
    const c = new ContentFolder(tmp());
    c.add("map one.osz", new Uint8Array([1, 2, 3]));
    c.add("skin.osk", new Uint8Array([4]));
    expect(() => c.add("evil.exe", new Uint8Array([1]))).toThrow();
    expect(c.list().map((f) => f.name).sort()).toEqual(["map_one.osz", "skin.osk"]);
    expect([...c.read("map one.osz")!]).toEqual([1, 2, 3]);
    expect(c.read("../../x.osz")).toBeNull();
    c.remove("skin.osk");
    expect(c.list()).toHaveLength(1);
  });
});
