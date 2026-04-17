export const PALETTE = [
  '#ef6f6c', // coral
  '#2ec4b6', // teal
  '#4f6df5', // indigo
  '#f4b942', // amber
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#ec4899', // rose
  '#64748b', // slate
];

export function colorForRoot(index: number): string {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

export function tintForDepth(hex: string, depth: number): string {
  const amount = Math.min(0.82, 0.58 + depth * 0.08);
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return rgbToHex(mix(r), mix(g), mix(b));
}

export const GREEN = '#22c55e';
export const GREEN_DARK = '#16a34a';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = hex.replace('#', '');
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function readableText(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? '#1a1a1a' : '#ffffff';
}
