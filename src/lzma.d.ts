declare module "lzma" {
  const LZMA: { decompress(data: number[] | Uint8Array): string | number[] };
  export default LZMA;
}
