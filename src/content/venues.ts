/**
 * The two break venues share one festival map (rooms/festival.tmj); a theme is everything else:
 * the art, the props and signs, the reaction bubbles, the lights, the palette and the music set.
 */
import type { CharacterId, VenueId } from './characters';
import type { HighwayThemeId } from '../game/rhythm/HighwayView';

export interface VenueTheme {
  id: VenueId;
  /** The title card and the map's title sign. */
  title: string;
  subtitle: string;
  /** Under public/: the venue art (until the empty-venue art exists). */
  art: string;
  highway: HighwayThemeId;
  /** The meter's name. */
  meter: string;
  /** Star power's name and how to call it. */
  star: string;
  /** How the player gets there (and back). */
  travel: 'train' | 'plane';
  /** The words on the way back. */
  back: string;
  lights: 'neon' | 'none';
  /** The confetti the crowd's celebration bubbles throw. */
  confetti: string[];
  palette: { ink: string; accent: string; panel: string };
  /** Who plays here. */
  character: CharacterId;
}

/** Where each twin's gigs go next, unlocked by their own currency (venues still to be built). */
export const LATER_VENUES: Partial<Record<CharacterId, { id: string; name: string; unlock: number }[]>> = {
  joel: [
    { id: 'night-market', name: 'Night market', unlock: 300 },
    { id: 'rooftop', name: 'Rooftop party', unlock: 800 },
    { id: 'dragon-boat', name: 'Dragon Boat Festival', unlock: 1500 },
  ],
  jonas: [
    { id: 'lakeside', name: 'Lakeside fest', unlock: 300 },
    { id: 'alpine-harvest', name: 'Alpine harvest festival', unlock: 800 },
    { id: 'christmas-market', name: 'Christmas market', unlock: 1500 },
  ],
};

export const VENUES: Record<VenueId, VenueTheme> = {
  bavaria: {
    id: 'bavaria',
    title: 'Dorffest',
    subtitle: 'Jonas & the brass band · bass',
    art: 'assets/venues/bavaria.png',
    highway: 'bavaria',
    meter: 'Stimmung',
    star: 'Prost!',
    travel: 'train',
    back: 'Back to the café',
    lights: 'none',
    confetti: ['#2F6DB5', '#F4F4F4', '#F6C945', '#E0475B', '#3E8A3A'],
    palette: { ink: '#F2EDE4', accent: '#2F6DB5', panel: '#1F2A26' },
    character: 'jonas',
  },
  'neon-china': {
    id: 'neon-china',
    title: '电音节',
    subtitle: 'Joel · electronic music festival',
    art: 'assets/venues/neon-china.png',
    highway: 'neon-china',
    meter: 'Crowd energy',
    star: 'DROP',
    travel: 'plane',
    back: 'Fly back to the café',
    lights: 'neon',
    confetti: ['#FF6FD8', '#56B4E9', '#7C5CFF', '#3DDC97', '#F0E442', '#FF8A5B'],
    palette: { ink: '#F2EDE4', accent: '#FF6FD8', panel: '#0B0B1E' },
    character: 'joel',
  },
};
