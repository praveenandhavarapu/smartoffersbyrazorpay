import { generateAlpha } from '../generator/alpha';
import { aggregate } from '../aggregate';
import { fixtureGroupStats, FIXTURE_LIFTS } from '../fixtures';
import { generateNetwork, isSimilarToAlpha, NETWORK_SIZE, SIMILAR_POOL_SIZE } from '../generator/network';
import { poolLifts } from '../network/peers';
import { CATALOG } from '../generator/catalog';
import { roundHalfUp } from '../../lib/format';
import { isHoldout } from '../../lib/rng';
import { SAMPLE_SHOPPERS } from '../../engine/checkoutTable';

const groups = fixtureGroupStats();

describe('Alpha generator', () => {
  const d = generateAlpha();
  const agg = aggregate(d.baseline);

  it('baseline aggregates reproduce the fixture per group', () => {
    for (const g of groups) {
      const a = agg[g.id].pre_pilot!;
      expect(a.checkouts).toBe(g.checkouts);
      // Baseline conversion includes today's code lifts; compare with the fixture-implied rate.
      const implied = g.today.reduce((t, u) => t + u.share * (g.baseConversion + u.liftPp / 100), 0) + (1 - g.today.reduce((t, u) => t + u.share, 0)) * g.baseConversion;
      expect(Math.abs(a.conversion / implied - 1)).toBeLessThan(0.005);
      expect(Math.abs(a.aovInr / g.aovInr - 1)).toBeLessThan(0.005);
      expect(Math.round(a.aovInr)).toBe(g.aovInr);
    }
  });

  it('pilot day 20 counts follow the exact formulas and the holdout hash', () => {
    const p = aggregate(d.pilot20);
    for (const g of groups) {
      const n = (g.checkouts * 20) / 30;
      expect(p[g.id].treated!.checkouts).toBe(roundHalfUp(n * 0.9));
      expect(p[g.id].holdout!.checkouts).toBe(roundHalfUp(n * 0.1));
    }
    for (const s of d.pilot20) expect(isHoldout(s.customer_id)).toBe(s.arm === 'holdout');
    expect(isHoldout(SAMPLE_SHOPPERS.find((s) => s.id === 'sameer')!.customerId)).toBe(true);
  });

  it('MEERA15 shows 140 uses with 90 by returning buyers', () => {
    const uses = d.baseline.filter((s) => s.converted && s.typed_code === 'MEERA15');
    expect(uses.length).toBe(140);
    expect(uses.filter((s) => !s.is_first_order).length).toBe(90);
  });

  it('carts respect group rules and line items add up', () => {
    for (const s of d.baseline.slice(0, 2000)) {
      const sum = s.cart.line_items.reduce((a, i) => a + i.price * i.qty, 0);
      expect(sum).toBe(s.cart.value);
      if (s.group_id === 'new_ads_small') expect(s.cart.value).toBeLessThan(150000);
      if (s.group_id === 'new_ads_big') expect(s.cart.value).toBeGreaterThanOrEqual(150000);
    }
  });

  it('is deterministic and never uses the hidden SKU in sessions', () => {
    const hidden = CATALOG.find((c) => c.hidden)!.sku;
    expect(d.baseline.some((s) => s.cart.line_items.some((i) => i.sku === hidden))).toBe(false);
    expect(d.baseline[0].id).toBe(generateAlpha().baseline[0].id);
  });
});

describe('network of synthetic merchants', () => {
  const net = generateNetwork();
  it('has 1,200 merchants and exactly 180 in the similar pool', () => {
    expect(net.length).toBe(NETWORK_SIZE);
    expect(net.filter(isSimilarToAlpha).length).toBe(SIMILAR_POOL_SIZE);
  });
  it('category mix is about 55% fashion', () => {
    const share = net.filter((m) => m.category === 'fashion_apparel').length / net.length;
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.6);
  });
  it('pooled weighted medians equal the fixture lifts after 0.5 pp rounding', () => {
    expect(poolLifts().median).toEqual(FIXTURE_LIFTS);
  });
});
