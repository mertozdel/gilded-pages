import type { StateCreator } from 'zustand';
import { DEFAULT_CHARACTER, type CharacterId } from '../content/characters';
import type { Profiles } from '../db/profiles';
import { emptyProfile, type ProfileRow } from '../db/schema';
import type { AppState } from './index';
import { initialCharacter } from './routeSlice';

export interface CharacterSlice {
  /** Who the player is (the café's `?c=`); Roxy's own screens imply her. */
  character: CharacterId;
  setCharacter: (id: CharacterId) => void;
  profiles: Profiles;
  setProfiles: (p: Profiles) => void;
  setProfile: (p: ProfileRow) => void;
}

export const createCharacterSlice: StateCreator<AppState, [], [], CharacterSlice> = (set) => ({
  character: initialCharacter ?? DEFAULT_CHARACTER,
  setCharacter: (character) => set({ character }),
  profiles: { roxy: emptyProfile('roxy'), jason: emptyProfile('jason'), joel: emptyProfile('joel'), jonas: emptyProfile('jonas') },
  setProfiles: (profiles) => set({ profiles }),
  setProfile: (p) => set((s) => ({ profiles: { ...s.profiles, [p.characterId]: p } })),
});
