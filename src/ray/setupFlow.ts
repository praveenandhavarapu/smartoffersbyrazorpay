/** Guided Smart Offers setup inside the chat (same in Live and Demo mode; the answers are form inputs). */
import type { Goal } from '../data/types';
import type { Settings } from '../state/store';
import { parseAmount, type QuickReply } from './demoRouter';
import type { SetupStep } from './chatStore';
import { KEEP_GUIDANCE } from './templates';
import { DEFAULT_KEEP_PER_1000 } from '../engine/net';

export const SETUP_ORDER: SetupStep[] = ['budget', 'margin', 'goal', 'rules'];

export function question(step: SetupStep, festiveName: string): { text: string; quick: QuickReply[] } {
  const n = SETUP_ORDER.indexOf(step) + 1;
  if (step === 'budget') return { text: `${n}/4 · How much can you spend on checkout offers each month? (₹5,000 to ₹10,00,000)`, quick: ['₹50,000', '₹1,00,000', '₹2,00,000'].map((v) => ({ label: v, message: v })) };
  if (step === 'margin') return { text: `${n}/4 · What do you keep from a ₹1,000 sale after product, shipping, packaging and payment costs? ${KEEP_GUIDANCE.text}.`, quick: [DEFAULT_KEEP_PER_1000 - 100, DEFAULT_KEEP_PER_1000, DEFAULT_KEEP_PER_1000 + 100].map((v) => ({ label: `₹${v}`, message: `₹${v}` })) };
  if (step === 'goal') return { text: `${n}/4 · What matters most?`, quick: [{ label: 'Most profit', message: 'Most profit' }, { label: 'Most new customers', message: 'Most new customers' }, { label: 'Keep orders steady', message: 'Keep orders steady' }] };
  return { text: `${n}/4 · Any rules? Should I keep offers off ${festiveName} styles for their first week at full price?`, quick: [{ label: 'Yes, no offers on the drop', message: 'Yes' }, { label: 'No rule', message: 'No' }] };
}

export type SetupAnswer = { ok: true; patch: Partial<Settings>; note?: string } | { ok: false; hint: string };

export function parseAnswer(step: SetupStep, text: string): SetupAnswer {
  const t = text.toLowerCase();
  if (step === 'budget') {
    const a = parseAmount(t);
    if (!a || a < 5000 || a > 1000000) return { ok: false, hint: 'Please give a monthly amount between ₹5,000 and ₹10,00,000, like ₹1,00,000 or 1 lakh.' };
    return { ok: true, patch: { budget: Math.round(a) } };
  }
  if (step === 'margin') {
    const pct = t.match(/(\d+(?:\.\d+)?)\s?%/);
    const amt = parseAmount(t.replace(/\d+(\.\d+)?\s?%/, ''));
    const keep = pct ? Math.round(parseFloat(pct[1]) * 10) : amt && amt < 1000 ? Math.round(amt) : null;
    if (!keep || keep < 50 || keep > 950) return { ok: false, hint: `Tell me what you keep from a ₹1,000 sale, like ₹${DEFAULT_KEEP_PER_1000} (or ${DEFAULT_KEEP_PER_1000 / 10}%).` };
    const note = keep < 200 || keep > 650 ? `₹${keep} of ₹1,000 is unusual (${KEEP_GUIDANCE.text.replace(/^Typical/, 'typical').replace(/^Most/, 'most')}). I'll use it, but please double-check: a wrong margin flips which offers pay back.` : undefined;
    return { ok: true, patch: { keepPer1000: keep }, note };
  }
  if (step === 'goal') {
    const goal: Goal | null = /new/.test(t) ? 'new_customers' : /steady|orders|volume/.test(t) ? 'orders_steady' : /profit|money|margin/.test(t) ? 'most_profit' : null;
    if (!goal) return { ok: false, hint: 'Pick one: Most profit, Most new customers, or Keep orders steady.' };
    return { ok: true, patch: { goal } };
  }
  if (/^(y|yes|yeah|yep|sure|ok|okay)\b|no offers on|keep (them )?off/.test(t)) return { ok: true, patch: { festiveWindow: true } };
  if (/^(n|no|nope|none)\b|no rule|skip/.test(t)) return { ok: true, patch: { festiveWindow: false } };
  return { ok: false, hint: 'Yes or no: keep offers off the festive drop for its first week?' };
}
