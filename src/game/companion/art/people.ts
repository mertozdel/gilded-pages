/**
 * Looks for everyone else in the café: the regulars from regulars.json and a few walk-ins,
 * drawn with the same figure code as Roxy (see figure.ts).
 */
import type { RegularDef } from '../../../content';
import { hexMix } from '../../iso/iso';
import type { HairStyle, Look, Tones } from './figure';

function tones(base: string): Tones {
  return { base, shade: hexMix(base, '#000000', 0.25), light: hexMix(base, '#FFFFFF', 0.22) };
}

function hairTones(base: string): Look['hair'] {
  return { base, shade: hexMix(base, '#000000', 0.25), light: hexMix(base, '#FFFFFF', 0.25), deep: hexMix(base, '#000000', 0.5) };
}

const STYLE: Record<string, { hair: HairStyle; bottoms: Look['bottoms']; shoes: Look['shoes']; glasses?: boolean; beard?: boolean }> = {
  writer: { hair: 'long', bottoms: 'jeans', shoes: 'sneakers', glasses: true },
  odile: { hair: 'bun', bottoms: 'skirt', shoes: 'boots' },
  guide: { hair: 'puff', bottoms: 'trousers', shoes: 'boots' },
  busker: { hair: 'cap', bottoms: 'trousers', shoes: 'boots', beard: true },
  florist: { hair: 'braids', bottoms: 'skirt', shoes: 'boots' },
};

export function regularLook(r: RegularDef): Look {
  const s = STYLE[r.id] ?? { hair: 'short' as const, bottoms: 'jeans' as const, shoes: 'sneakers' as const };
  return {
    skin: tones(r.colors.skin),
    hair: hairTones(r.colors.hair),
    hairStyle: s.hair,
    top: { ...tones(r.colors.top), trim: hexMix(r.colors.top, '#FFFFFF', 0.4) },
    sleeve: 'long',
    bottoms: s.bottoms,
    bottomTones: tones(r.colors.bottom),
    shoes: s.shoes,
    glasses: s.glasses,
    beard: s.beard ? hexMix(r.colors.hair, '#000000', 0.15) : undefined,
  };
}

/** Walk-in customers who aren't regulars (yet). */
export const WALK_INS: { id: string; look: Look }[] = [
  {
    id: 'walkin-beard',
    look: {
      skin: tones('#E0B48E'),
      hair: hairTones('#5A3A26'),
      hairStyle: 'short',
      top: { ...tones('#2E4268'), trim: '#C9D2E0' },
      sleeve: 'long',
      bottoms: 'jeans',
      bottomTones: tones('#3A3A48'),
      shoes: 'sneakers',
      beard: '#4A2E1E',
    },
  },
  {
    id: 'walkin-bob',
    look: {
      skin: tones('#F2D2B6'),
      hair: hairTones('#2A2024'),
      hairStyle: 'bob',
      top: { ...tones('#A9443B'), trim: '#E8C0B8' },
      sleeve: 'long',
      bottoms: 'jeans',
      bottomTones: tones('#4F6F9E'),
      shoes: 'boots',
      glasses: true,
    },
  },
  {
    id: 'walkin-knit',
    look: {
      skin: tones('#B07A58'),
      hair: hairTones('#1E1614'),
      hairStyle: 'long',
      top: { ...tones('#BCCB9F'), trim: '#F2EDE4' },
      sleeve: 'long',
      bottoms: 'trousers',
      bottomTones: tones('#6B4C3B'),
      shoes: 'boots',
    },
  },
];
