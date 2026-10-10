import { fixtureGroupStats } from '../../data/fixtures';
import { GROUP_IDS } from '../../data/types';
import { buildPlan, offerMap } from '../plan';
import { countsFromFormula, measure } from '../measure';
import { PILOT_TRUTH } from '../../data/fixtures';
import {
  capDiscount, DAILY_SPEND_CAP, inNoOfferWindow, killSwitch, nearBreakEven, resolveOrderOffer, rulesUseBannedSignals,
  spendGate, stepDown, withCheckoutBudget,
} from '../guardrails';
import { buildCheckoutTable, classify, decide, SAMPLE_SHOPPERS } from '../checkoutTable';

const groups = fixtureGroupStats();
const plan = buildPlan(groups);
const table = buildCheckoutTable(offerMap(plan));

describe('guardrails', () => {
  it('one offer per order: a typed code replaces the Smart Offer', () => {
    expect(resolveOrderOffer('free_shipping', 'MEERA15')).toEqual({ applied: 'typed', offer: 'none', code: 'MEERA15' });
    expect(resolveOrderOffer('flat_100').offer).toBe('flat_100');
    const priya = { ...SAMPLE_SHOPPERS[0], typedCode: 'MEERA15' };
    expect(decide(table, priya).offer).toBe('none');
  });
  it('caps discount at ₹250, daily cap and monthly budget are hard stops', () => {
    expect(capDiscount(400)).toBe(250);
    expect(spendGate('flat_200', DAILY_SPEND_CAP - 100, 0, 100000)).toBe('none');
    expect(spendGate('flat_200', 0, 99900, 100000)).toBe('none');
    expect(spendGate('flat_200', 0, 0, 100000)).toBe('flat_200');
  });
  it('steps down after 7 days below break-even, unless learning on the upside', () => {
    const low = Array(7).fill(2.1);
    expect(stepDown('flat_200', ['flat_100', 'flat_200'], low, 2.5, false).offer).toBe('flat_100');
    expect(stepDown('free_shipping', ['free_shipping'], low, 2.5, false).offer).toBe('none');
    expect(stepDown('flat_200', ['flat_100'], low, 2.5, true).offer).toBe('flat_200');
    expect(stepDown('flat_200', ['flat_100'], [...Array(6).fill(2.1), 2.6], 2.5, false).offer).toBe('flat_200');
  });
  it('near break-even watch flags New · organic at 2.57x on day 20', () => {
    const offers = offerMap(plan);
    const d20 = measure(groups, offers, countsFromFormula(groups, offers, PILOT_TRUTH.actualLiftPp, 20), 20);
    const hits = nearBreakEven(d20.rows, 2.5);
    expect(hits.map((h) => h.group)).toEqual(['new_organic']);
  });
  it('kill switch sets every group to none', () => {
    expect(Object.values(killSwitch(GROUP_IDS)).every((o) => o === 'none')).toBe(true);
    expect(decide(buildCheckoutTable(offerMap(plan), true), SAMPLE_SHOPPERS[0]).offer).toBe('none');
  });
  it('festive drop window: 16 Oct 2026 for 7 days', () => {
    expect(inNoOfferWindow('2026-10-16', true)).toBe(true);
    expect(inNoOfferWindow('2026-10-22', true)).toBe(true);
    expect(inNoOfferWindow('2026-10-23', true)).toBe(false);
    expect(inNoOfferWindow('2026-10-16', false)).toBe(false);
  });
  it('group rules use no banned signals', () => {
    expect(rulesUseBannedSignals(groups.map((g) => g.rule))).toEqual([]);
    expect(rulesUseBannedSignals(['device = iPhone AND cart_value > 1000'])).not.toEqual([]);
    expect(classify.toString()).not.toMatch(/device|gender|income|location|os\b/i);
  });
  it('checkout fail-safe: timeout or error -> store default', async () => {
    const slow = await withCheckoutBudget(() => new Promise<string>((r) => setTimeout(() => r('flat_100'), 80)), 'none', 50);
    expect(slow).toEqual({ value: 'none', failSafe: true });
    const err = await withCheckoutBudget<string>(() => { throw new Error('x'); }, 'none');
    expect(err.failSafe).toBe(true);
    const ok = await withCheckoutBudget(() => 'flat_100', 'none');
    expect(ok).toEqual({ value: 'flat_100', failSafe: false });
  });
});

describe('checkout table: sample shoppers', () => {
  const d = (id: string) => decide(table, SAMPLE_SHOPPERS.find((s) => s.id === id)!);
  it('gives each sample shopper the expected outcome', () => {
    expect(d('priya')).toMatchObject({ group: 'new_ads_small', offer: 'free_shipping', savingInr: 79 });
    expect(d('rohan')).toMatchObject({ group: 'new_ads_big', offer: 'flat_200', savingInr: 200 });
    expect(d('aisha')).toMatchObject({ group: 'new_creator', offer: 'none' });
    expect(d('kavya')).toMatchObject({ group: 'new_organic', offer: 'free_shipping' });
    expect(d('neha')).toMatchObject({ group: 'returning', offer: 'none' });
    expect(d('vikram')).toMatchObject({ group: 'lapsed', offer: 'flat_100', savingInr: 100 });
    expect(d('sameer')).toMatchObject({ group: 'new_ads_small', offer: 'none', holdout: true });
  });
});
