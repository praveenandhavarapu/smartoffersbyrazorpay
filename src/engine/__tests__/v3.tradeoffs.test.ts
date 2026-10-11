/** v3: store-size benchmarks, growth vs profit frontier, margin squeeze and recommended offers. */
import { testCtx } from '../../test/ctx';
import { getStoreBenchmark } from '../../data/network/peers';
import { storeEconomics } from '../../data/generator/network';
import { buildPlan } from '../plan';
import { exploreBudget, growthFrontier, marginSqueeze, newCustomers } from '../tradeoffs';
import { recommendOffers } from '../recommend';
import { toPlanSettings } from '../../state/derived';
import { DEFAULT_USER_SETTINGS, type Settings } from '../../state/store';
import { MAX_DISCOUNT_PER_ORDER } from '../guardrails';
import { OFFER_BY_ID } from '../../data/fixtures';
import type { RayCtx } from '../../ray/tools';

let ctx: RayCtx;
beforeAll(async () => { ctx = await testCtx(); });
const settings = (x: Partial<Settings> = {}) => ctx.derived.planSettingsFor({ ...DEFAULT_USER_SETTINGS, ...x });

describe('store-size benchmarks (aggregates only)', () => {
  it('uses at least 20 stores and no store above 25% of the band\'s sales', () => {
    const b = getStoreBenchmark(ctx.derived.store.gmv);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.stores).toBeGreaterThanOrEqual(20);
    const band = storeEconomics().filter((e) => e.category === 'fashion_apparel' && e.monthlySalesInr >= 2_000_000 && e.monthlySalesInr < 3_500_000);
    const total = band.reduce((a, e) => a + e.monthlySalesInr, 0);
    expect(Math.max(...band.map((e) => e.monthlySalesInr)) / total).toBeLessThanOrEqual(0.25);
  });
  it('typical values for a store of Alpha\'s size equal the demo\'s starting values (documented calibration)', () => {
    const b = ctx.derived.benchmark;
    if (!b.ok) throw new Error('no benchmark');
    expect(b.keepPer1000.median).toBe(DEFAULT_USER_SETTINGS.keepPer1000);
    expect(b.budgetInr.median).toBe(DEFAULT_USER_SETTINGS.budget);
    expect(b.keepPer1000.p25).toBeLessThan(b.keepPer1000.median);
    expect(b.budgetInr.p75).toBeGreaterThan(b.budgetInr.median);
    expect(b.goalMixPct.most_profit + b.goalMixPct.new_customers + b.goalMixPct.orders_steady).toBeGreaterThanOrEqual(99);
  });
  it('rounds values so no single store can be read back', () => {
    const b = ctx.derived.benchmark;
    if (!b.ok) throw new Error('no benchmark');
    expect(b.keepPer1000.median % 10).toBe(0);
    expect(b.budgetInr.median % 5000).toBe(0);
  });
});

describe('growth frontier', () => {
  it('starts at the plan without a trade-off and only adds customers as profit is given up', () => {
    const s = settings();
    const f = growthFrontier(ctx.derived.planGroups, s, 'new_customers', exploreBudget(s.budget!));
    expect(f[0].giveUp).toBeCloseTo(0, 6);
    expect(f[0].profit).toBeCloseTo(buildPlan(ctx.derived.planGroups, s).profit, 6);
    expect(f.length).toBeGreaterThan(2);
    for (let i = 1; i < f.length; i++) expect(f[i].newCustomers).toBeGreaterThan(f[i - 1].newCustomers);
  });
  it('every point is reproduced exactly by its own settings (what you pick is what you get)', () => {
    for (const keep of [500, 400, 300]) for (const budget of [100000, 50000]) {
      const s = settings({ keepPer1000: keep, budget });
      for (const m of ['new_customers', 'orders'] as const) for (const p of growthFrontier(ctx.derived.planGroups, s, m, exploreBudget(budget))) {
        const q = buildPlan(ctx.derived.planGroups, { ...s, budget: p.budget, growth: p.growth });
        expect(q.profit).toBeCloseTo(p.profit, 6);
        expect(q.spend).toBeLessThanOrEqual(p.budget + 1e-6);
      }
    }
  });
  it('never breaks the max discount, the menu or a merchant-set minimum return', () => {
    const s = settings({ minReturn: 2.5 });
    for (const p of growthFrontier(ctx.derived.planGroups, s, 'orders', exploreBudget(s.budget!))) {
      for (const r of p.plan.rows) {
        if (r.offer === 'none') continue;
        expect(OFFER_BY_ID[r.offer].costPerOrderInr).toBeLessThanOrEqual(MAX_DISCOUNT_PER_ORDER);
        expect(s.allowedOffers).toContain(r.offer);
        expect(r.ret).toBeGreaterThanOrEqual(2.5 - 1e-9);
      }
    }
  });
  it('no growth setting leaves the plan exactly as before', () => {
    expect(buildPlan(ctx.derived.planGroups, { ...settings(), growth: null }).profit).toBeCloseTo(ctx.derived.draft.profit, 6);
  });
});

describe('margin squeeze', () => {
  it('shows what a lower margin costs and what keeping today\'s new customers would cost', () => {
    const rows = marginSqueeze(ctx.derived.planGroups, settings(), 500);
    const cur = rows.find((r) => r.current)!;
    expect(cur.profit).toBeCloseTo(ctx.derived.draft.profit, 6);
    const low = rows.filter((r) => r.keepPer1000 < 500);
    expect(low.length).toBeGreaterThan(2);
    for (const r of low) {
      expect(r.offersOn).toBeLessThanOrEqual(cur.offersOn);
      expect(r.newCustomers).toBeLessThanOrEqual(cur.newCustomers + 1e-6);
      if (r.keepGrowthCost !== null) expect(r.keepGrowthCost).toBeGreaterThanOrEqual(0);
    }
    expect(newCustomers(ctx.derived.planGroups, cur.plan)).toBeCloseTo(cur.newCustomers, 6);
  });
});

describe('recommended offers beyond the menu', () => {
  it('scores off-menu offers with the plan engine and reproduces the profit change', () => {
    const s = settings();
    const recs = recommendOffers(ctx.derived.planGroups, s);
    expect(recs.length).toBeGreaterThanOrEqual(3);
    for (const r of recs.filter((x) => x.offer !== 'early_access')) {
      expect(s.allowedOffers).not.toContain(r.offer);
      const p = buildPlan(ctx.derived.planGroups, { ...s, allowedOffers: [...s.allowedOffers!, r.offer as never] });
      expect(p.profit - buildPlan(ctx.derived.planGroups, s).profit).toBeCloseTo(r.profitDelta, 6);
    }
    const idea = recs.find((r) => r.offer === 'early_access')!;
    expect(idea.verdict).toBe('idea');
    expect(idea.profitDelta).toBe(0);
  });
  it('a standard offer the merchant removed comes back as one row naming the groups that would use it', () => {
    const recs = recommendOffers(ctx.derived.planGroups, settings({ allowedOffers: ['free_shipping', 'flat_100'] }));
    const r200 = recs.filter((r) => r.offer === 'flat_200' && r.kind === 'removed_from_menu');
    expect(r200.length).toBe(1);
    expect(r200[0].groups).toContain('new_ads_big');
  });
  it('playbook priors for off-menu offers never change today\'s plan', () => {
    const plain = buildPlan(ctx.derived.learning?.groupsV2 ?? ctx.model.groups, toPlanSettings(DEFAULT_USER_SETTINGS));
    expect(ctx.derived.draft.profit).toBeCloseTo(plain.profit, 6);
  });
});
