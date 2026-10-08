// Node only. A tiny WebSocket server that speaks like tosu, so the whole chain can run without osu! installed.
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { toTosuMessage } from "./tosu.js";
import type { OsuSnapshot } from "./types.js";

function frame(text: string): Buffer {
  const p = Buffer.from(text);
  const head = p.length < 126 ? Buffer.from([0x81, p.length]) : p.length < 65536 ? Buffer.from([0x81, 126, p.length >> 8, p.length & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(p.length), 2); return b; })();
  return Buffer.concat([head, p]);
}

export class MockTosuServer {
  private server: Server;
  private clients = new Set<Socket>();
  port = 0;
  constructor() {
    this.server = createServer((_q, r) => { r.writeHead(426).end(); });
    this.server.on("upgrade", (req, socket: Socket) => {
      const key = String(req.headers["sec-websocket-key"] ?? "");
      const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      this.clients.add(socket);
      socket.on("close", () => this.clients.delete(socket));
      socket.on("error", () => this.clients.delete(socket));
      socket.on("data", () => undefined); // we never read what the client sends
    });
  }
  listen(port = 0): Promise<number> {
    return new Promise((res) => this.server.listen(port, "127.0.0.1", () => { this.port = (this.server.address() as { port: number }).port; res(this.port); }));
  }
  get url(): string { return `ws://127.0.0.1:${this.port}/websocket/v2`; }
  get clientCount(): number { return this.clients.size; }
  send(s: OsuSnapshot): void { const f = frame(JSON.stringify(toTosuMessage(s))); for (const c of this.clients) c.write(f); }
  async play(snaps: OsuSnapshot[], gapMs = 5): Promise<void> { for (const s of snaps) { this.send(s); await new Promise((r) => setTimeout(r, gapMs)); } }
  close(): Promise<void> { for (const c of this.clients) c.destroy(); return new Promise((r) => this.server.close(() => r())); }
}
