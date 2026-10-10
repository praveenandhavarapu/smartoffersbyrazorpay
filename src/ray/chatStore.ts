import { create } from 'zustand';
import type { RayCard, QuickReply } from './demoRouter';
import type { LiveMessage } from './liveClient';

export type ChatMsg = { id: number; role: 'user' | 'ray'; text: string; card?: RayCard; quick?: QuickReply[]; refused?: boolean; via?: 'demo' | 'live' };

type ChatState = {
  messages: ChatMsg[];
  liveHistory: LiveMessage[];
  mode: 'demo' | 'live' | 'unknown';
  busy: boolean;
  pending: string | null; // message queued from another screen (Home composer)
  push: (m: Omit<ChatMsg, 'id'>) => void;
  setMode: (m: 'demo' | 'live') => void;
  setBusy: (b: boolean) => void;
  setLiveHistory: (h: LiveMessage[]) => void;
  queue: (text: string | null) => void;
  clear: () => void;
};

let nextId = 1;
export const useChat = create<ChatState>((set) => ({
  messages: [], liveHistory: [], mode: 'unknown', busy: false, pending: null,
  push: (m) => set((s) => ({ messages: [...s.messages, { ...m, id: nextId++ }] })),
  setMode: (mode) => set({ mode }),
  setBusy: (busy) => set({ busy }),
  setLiveHistory: (liveHistory) => set({ liveHistory }),
  queue: (pending) => set({ pending }),
  clear: () => set({ messages: [], liveHistory: [], pending: null }),
}));
