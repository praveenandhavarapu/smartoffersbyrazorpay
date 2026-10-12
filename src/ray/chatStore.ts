import { create } from 'zustand';
import type { RayCard, QuickReply, RayReply } from './demoRouter';
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

export type SetupStep = 'budget' | 'margin' | 'goal' | 'growth' | 'offers' | 'floor' | 'rules';
/** v3: what Ray's last reply offered and was about, so "yes", "what about 35%?" and "why?" work. */
export type LastTurn = { intent?: string; next?: QuickReply; about?: RayReply['about']; draft?: boolean; quick?: QuickReply[]; asked?: boolean };

type ChatState = {
  messages: ChatMsg[];
  liveHistory: LiveMessage[];
  health: Health | { state: 'checking' };
  busy: boolean;
  pending: string | null; // message queued from another screen
  setup: SetupStep | null;
  last: LastTurn | null;
  setLast: (l: LastTurn | null) => void;
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
  messages: [], liveHistory: [], health: { state: 'checking' }, busy: false, pending: null, setup: null, last: null,
  setLast: (last) => set({ last }),
  push: (m) => set((s) => ({ messages: [...s.messages, { ...m, id: nextId++ }] })),
  setHealth: (health) => set({ health }),
  setBusy: (busy) => set({ busy }),
  setLiveHistory: (liveHistory) => set({ liveHistory }),
  queue: (pending) => set({ pending }),
  setSetup: (setup) => set({ setup }),
  clear: () => set({ messages: [], liveHistory: [], pending: null, setup: null, last: null }),
}));
