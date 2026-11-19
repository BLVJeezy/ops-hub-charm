/**
 * A tiny PNG of a clock ("1:23:45"), drawn with a built-in 5×7 pixel font.
 * Mail clients cannot run code, but they load images: each time the mail is opened the image is fetched again
 * and shows the time as it is then. No libraries: the PNG is written by hand (stored deflate, CRC32, Adler-32).
 */
const FONT: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  d: ["00001", "00001", "01101", "10011", "10001", "10011", "01101"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

let CRC: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function chunk(type: string, data: Uint8Array): number[] {
  const t = [...type].map((ch) => ch.charCodeAt(0));
  const body = new Uint8Array([...t, ...data]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}
/** zlib stream made of stored (uncompressed) blocks: valid everywhere, no compressor needed. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const out: number[] = [0x78, 0x01];
  for (let i = 0; i < raw.length || i === 0; i += 65535) {
    const part = raw.subarray(i, Math.min(raw.length, i + 65535)),
      last = i + 65535 >= raw.length;
    out.push(
      last ? 1 : 0,
      part.length & 255,
      part.length >> 8,
      ~part.length & 255,
      (~part.length >> 8) & 255,
      ...part,
    );
    if (last) break;
  }
  let a = 1,
    b = 0;
  for (const x of raw) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  out.push(...u32(((b << 16) | a) >>> 0));
  return new Uint8Array(out);
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Draws `text` (digits, ":", "d", space) at `scale` pixels per font dot. */
export function clockPng(
  text: string,
  { scale = 6, ink = "#1B222C", paper = "#F5EFE1" } = {},
): Uint8Array {
  const chars = [...text].filter((ch) => FONT[ch]);
  const pad = scale * 2,
    cw = 5 * scale,
    gap = scale;
  const width = pad * 2 + Math.max(1, chars.length) * (cw + gap) - gap,
    height = pad * 2 + 7 * scale;
  const rows = new Uint8Array(height * (width + 1)); // filter byte + one palette index per pixel (0 = paper, 1 = ink)
  chars.forEach((ch, i) => {
    const x0 = pad + i * (cw + gap);
    FONT[ch].forEach((line, gy) => {
      [...line].forEach((on, gx) => {
        if (on !== "1") return;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const y = pad + gy * scale + dy,
              x = x0 + gx * scale + dx;
            rows[y * (width + 1) + 1 + x] = 1;
          }
      });
    });
  });
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 3, 0, 0, 0]);
  const plte = new Uint8Array([...hex(paper), ...hex(ink)]);
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...chunk("IHDR", ihdr),
    ...chunk("PLTE", plte),
    ...chunk("IDAT", zlibStored(rows)),
    ...chunk("IEND", new Uint8Array()),
  ]);
}
