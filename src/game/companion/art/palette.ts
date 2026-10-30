/** The core 12 colours of the Gilded Pages palette, plus the extended tones the sprites need. */
export const PAL = {
  midnightNavy: '#141B2D',
  jazzBlack: '#0B0B0F',
  champagneGold: '#E3C16F',
  giltShine: '#F6E3A1',
  emerald: '#0F4D3A',
  jade: '#2E8B6A',
  signalGreen: '#39FF8E',
  ivoryPearl: '#F2EDE4',
  lampAmber: '#E8A87C',
  dustyRose: '#C9787A',
  ashGrey: '#8A8580',
  espresso: '#3B2418',

  // Extended set (part of the 32-colour palette).
  navyLight: '#24315A',
  navyMist: '#3A4A78',
  goldShadow: '#A8873F',
  emeraldShadow: '#0A3528',
  skin: '#EDC6A3',
  skinShade: '#CC9877',
  skinLight: '#F7DEC6',
  stocking: '#D4A688',
  stockingShade: '#A97C64',
  blush: '#F3A5A0',
  lip: '#B85A62',
  mouth: '#7A2E34',
  // Roxy's long ringlets: medium coffee brown, inked dark between the curls.
  hair: '#6E4731',
  hairDeep: '#2A1A14',
  hairShade: '#4E3122',
  hairLight: '#9C6E4B',
  hairShine: '#C59468',
  // Big Stardew-style eyes.
  eyeDark: '#2A1A1E',
  iris: '#7A4A2E',
  irisLight: '#A8703E',
  eyeShine: '#FFFFFF',
  pearlShade: '#A39887',
  leather: '#6B4226',
  leatherShade: '#45291A',
  leatherLight: '#8C5A35',
  shoe: '#4A2328',
  shoeLight: '#7A3A40',
  /** Warm, soft dark outline (Stardew-like) rather than near-black. */
  outline: '#33201F',
  paper: '#F4ECD8',
  paperShade: '#D8CBAE',
  ink: '#6E6458',
  bookCover: '#7A2E35',
  taxiYellow: '#E8B83A',
  taxiShade: '#B0852A',
  glass: '#9FC7C9',
} as const;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export function hexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}
