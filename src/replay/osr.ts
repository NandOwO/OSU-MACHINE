import LZMA from "lzma";

export interface ReplayFrame {
  time: number;
  x: number;
  y: number;
  /** Key bitmask: 1=M1, 2=M2, 4=K1, 8=K2, 16=smoke. */
  keys: number;
}

export interface Replay {
  mode: number;
  gameVersion: number;
  beatmapMd5: string;
  player: string;
  n300: number;
  n100: number;
  n50: number;
  geki: number;
  katu: number;
  miss: number;
  score: number;
  maxCombo: number;
  perfect: boolean;
  mods: number;
  timestamp: bigint;
  frames: ReplayFrame[];
}

class Reader {
  private i = 0;
  private view: DataView;
  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  u8() { return this.buf[this.i++]!; }
  u16() { const v = this.view.getUint16(this.i, true); this.i += 2; return v; }
  i32() { const v = this.view.getInt32(this.i, true); this.i += 4; return v; }
  i64() { const v = this.view.getBigInt64(this.i, true); this.i += 8; return v; }
  bytes(n: number) { const b = this.buf.subarray(this.i, this.i + n); this.i += n; return b; }
  uleb() {
    let result = 0, shift = 0;
    for (;;) {
      const b = this.u8();
      result |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return result;
      shift += 7;
    }
  }
  string() {
    if (this.u8() === 0) return "";
    const n = this.uleb();
    return new TextDecoder().decode(this.bytes(n));
  }
}

function decompress(data: Uint8Array): string {
  // lzma-js expects a signed byte array.
  const arr = Array.from(data, (b) => (b > 127 ? b - 256 : b));
  const out = LZMA.decompress(arr) as unknown;
  return typeof out === "string" ? out : new TextDecoder().decode(Uint8Array.from(out as number[]));
}

export function parseReplay(buf: Uint8Array): Replay {
  const r = new Reader(buf);
  const mode = r.u8();
  const gameVersion = r.i32();
  const beatmapMd5 = r.string();
  const player = r.string();
  r.string(); // replay md5
  const n300 = r.u16(), n100 = r.u16(), n50 = r.u16(), geki = r.u16(), katu = r.u16(), miss = r.u16();
  const score = r.i32();
  const maxCombo = r.u16();
  const perfect = r.u8() !== 0;
  const mods = r.i32();
  r.string(); // life bar graph
  const timestamp = r.i64();
  const len = r.i32();
  const text = decompress(r.bytes(len));

  const frames: ReplayFrame[] = [];
  let t = 0;
  const parts = text.split(",");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p === "") continue;
    const [w, x, y, z] = p.split("|");
    const delta = Number(w);
    if (delta === -12345) continue; // RNG seed marker
    t += delta;
    // The first two frames are placeholders at (256, -500).
    if (i < 2 && Number(x) === 256 && Number(y) === -500) continue;
    frames.push({ time: t, x: Number(x), y: Number(y), keys: Number(z) | 0 });
  }

  return { mode, gameVersion, beatmapMd5, player, n300, n100, n50, geki, katu, miss, score, maxCombo, perfect, mods, timestamp, frames };
}
