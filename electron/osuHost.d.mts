export interface OsuConfig { osuDir: string; osuExe: string; osuArgs: string[]; tosuExe: string | null; tosuArgs: string[]; launch: boolean }
export function readOsuConfig(file: string): OsuConfig | null;
export function findCfg(osuDir: string): string | null;
export function setSkinInCfg(osuDir: string, skinFolder: string): boolean;
export function extractInto(bytes: Uint8Array, dest: string): number;
export function syncContent(osuDir: string, contentDir: string): { maps: string[]; skins: string[] };
export function skinFolderFor(file: string | null | undefined): string | null;
export function findReplay(osuDir: string, sinceMs: number, opts?: { timeoutMs?: number; pollMs?: number }): Promise<Uint8Array | null>;
export class OsuSupervisor {
  constructor(cfg: OsuConfig, contentDir: string, opts?: { spawnFn?: (...a: any[]) => any; restartDelay?: number });
  prepare(skinFile?: string | null): { synced: { maps: string[]; skins: string[] }; skinSet: boolean };
  stopOsu(): void;
  stopAll(): void;
  findReplay(sinceMs: number, opts?: { timeoutMs?: number; pollMs?: number }): Promise<Uint8Array | null>;
  status(): { osu: boolean; tosu: boolean; osuRestarts: number };
}
