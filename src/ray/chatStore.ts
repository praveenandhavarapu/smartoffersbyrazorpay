import { create } from 'zustand';
import type { RayCard, QuickReply } from './demoRouter';
import type { Health, LiveMessage } from './liveClient';

export type ChatMsg = {
  id: number;
  role: 'user' | 'ray';
  text: string;
  cards?: RayCard[];
  quick?: QuickReply[];
  refused?: boolean;
  via?: 'demo' | 'live' | 'setup';
  note?: string; // e.g. why live mode was not used for this answer
};

export type SetupStep = 'budget' | 'margin' | 'goal' | 'rules';

type ChatState = {
  messages: ChatMsg[];
  liveHistory: LiveMessage[];
  health: Health | { state: 'checking' };
  busy: boolean;
  pending: string | null; // message queued from another screen
  setup: SetupStep | null;
  push: (m: Omit<ChatMsg, 'id'>) => void;
  setHealth: (h: ChatState['health']) => void;
  setBusy: (b: boolean) => void;
  setLiveHistory: (h: LiveMessage[]) => void;
  queue: (text: string | null) => void;
  setSetup: (s: SetupStep | null) => void;
  clear: () => void;
};

let nextId = 1;
export const useChat = create<ChatState>((set) => ({
  messages: [], liveHistory: [], health: { state: 'checking' }, busy: false, pending: null, setup: null,
  push: (m) => set((s) => ({ messages: [...s.messages, { ...m, id: nextId++ }] })),
  setHealth: (health) => set({ health }),
  setBusy: (busy) => set({ busy }),
  setLiveHistory: (liveHistory) => set({ liveHistory }),
  queue: (pending) => set({ pending }),
  setSetup: (setup) => set({ setup }),
  clear: () => set({ messages: [], liveHistory: [], pending: null, setup: null }),
}));
