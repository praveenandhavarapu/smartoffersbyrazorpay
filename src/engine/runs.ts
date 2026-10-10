/**
 * Daily agent runs (06:00 IST). Each run reads the previous day's checkouts, checks budget pace and
 * the daily cap, and republishes the checkout table. Derived from the generated pilot sessions.
 */
import { OFFER_BY_ID } from '../data/fixtures';
import type { CheckoutSession, GroupId, OfferId } from '../data/types';
import { DAILY_SPEND_CAP } from './guardrails';

export type AgentRun = {
  date: string; // run date (ISO), 06:00 IST
  dataDay: string | null; // the day whose checkouts it read
  checkouts: number;
  offerOrders: number;
  holdoutCheckouts: number;
  spend: number; // rupees, previous day
  cumulativeSpend: number;
  pace: number; // budget × days elapsed / 30
  action: string;
  status: 'completed' | 'paused';
};

const iso = (t: number) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);

export function dailyRuns(sessions: CheckoutSession[], offers: Record<GroupId, OfferId>, budget: number, startIso: string, endIso: string, killedFrom?: string): AgentRun[] {
  const byDay = new Map<string, CheckoutSession[]>();
  for (const s of sessions) if (s.arm !== 'pre_pilot') (byDay.get(iso(s.created_at)) ?? byDay.set(iso(s.created_at), []).get(iso(s.created_at))!).push(s);
  const runs: AgentRun[] = [];
  let cum = 0;
  const start = Date.parse(startIso + 'T00:00:00Z');
  const end = Date.parse(endIso + 'T00:00:00Z');
  for (let t = start, i = 0; t <= end; t += 86400000, i++) {
    const date = new Date(t).toISOString().slice(0, 10);
    const prev = i === 0 ? null : new Date(t - 86400000).toISOString().slice(0, 10);
    const day = prev ? byDay.get(prev) ?? [] : [];
    const treated = day.filter((s) => s.arm === 'treated');
    const used = treated.filter((s) => s.converted && offers[s.group_id] !== 'none');
    const spend = used.reduce((a, s) => a + OFFER_BY_ID[offers[s.group_id]].costPerOrderInr, 0);
    cum += spend;
    const pace = (budget * i) / 30;
    const paused = killedFrom !== undefined && date >= killedFrom;
    const action = paused ? 'Kill switch on: every group set to no offer'
      : i === 0 ? `Published checkout table: ${Object.values(offers).filter((o) => o !== 'none').length} group offers, 10% holdout`
      : spend > DAILY_SPEND_CAP ? 'Daily cap reached: offers paused for the rest of the day'
      : cum > pace * 1.1 ? 'Ahead of budget pace: holding offers steady'
      : 'Plan kept (still learning); checkout table refreshed';
    runs.push({ date, dataDay: prev, checkouts: day.length, offerOrders: used.length, holdoutCheckouts: day.filter((s) => s.arm === 'holdout').length, spend, cumulativeSpend: cum, pace, action, status: paused ? 'paused' : 'completed' });
  }
  return runs;
}
