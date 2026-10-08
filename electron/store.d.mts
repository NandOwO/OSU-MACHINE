export const safeName: (s: string) => string;
export function writeAtomic(path: string, data: string | Uint8Array): void;
export class FileStore {
  constructor(dir: string);
  get(key: string): string | null;
  set(key: string, json: string): void;
  remove(key: string): void;
}
export class ContentFolder {
  constructor(dir: string);
  list(): { name: string; size: number }[];
  read(name: string): Buffer | null;
  add(name: string, bytes: Uint8Array): string;
  remove(name: string): void;
  seed(srcDir: string): string[];
}
