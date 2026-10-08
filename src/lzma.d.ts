declare module "lzma/src/lzma_worker.js" {
  export const LZMA_WORKER: { decompress(data: number[] | Uint8Array): string | number[] };
}
