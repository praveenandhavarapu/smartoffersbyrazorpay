/** Ephemeral UI state shared by screens and the Play demo stepper (not persisted). */
import { create } from 'zustand';
import type { GroupId, OfferId } from '../../data/types';

type DemoState = {
  playing: boolean;
  open: boolean;
  step: number;
  shopperId: string;
  overrideDraft: { group: GroupId; offer: OfferId } | null;
  start: () => void;
  close: () => void;
  setStep: (n: number) => void;
  setPlaying: (p: boolean) => void;
  setShopper: (id: string) => void;
  openOverride: (group: GroupId, offer: OfferId) => void;
  closeOverride: () => void;
};

export const useDemo = create<DemoState>((set) => ({
  playing: false, open: false, step: 0, shopperId: 'priya', overrideDraft: null,
  start: () => set({ open: true, playing: true, step: 0 }),
  close: () => set({ open: false, playing: false }),
  setStep: (step) => set({ step }),
  setPlaying: (playing) => set({ playing }),
  setShopper: (shopperId) => set({ shopperId }),
  openOverride: (group, offer) => set({ overrideDraft: { group, offer } }),
  closeOverride: () => set({ overrideDraft: null }),
}));
