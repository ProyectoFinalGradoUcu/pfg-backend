export const TIPOS_PERMITIDOS: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

const FIRMAS: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export function coincideMagicNumber(buffer: Buffer, mimetype: string): boolean {
  const firma = FIRMAS[mimetype];
  if (!firma || buffer.length < firma.length) return false;
  return firma.every((byte, i) => buffer[i] === byte);
}
