/**
 * v2 §13 — Play demo, 14 steps, every caption computed from the engine at the moment it shows.
 * Ends on an outcome. The v1 steps stay in DemoPlayer.tsx (flag tourV2 off brings them back).
 */
import { useStore } from '../../state/store';
import { useChat } from '../../ray/chatStore';
import type { Derived } from '../../state/derived';
import { pendingActions } from '../../state/derived';
import type { Model } from '../../state/model';
import { DEFAULT_KEEP_PER_1000 } from '../../engine/net';
import { KEYS, TRAFFIC_SHARE } from '../../engine/learning';
import { RECOVERY } from '../../data/generator/agentDecisions';
import { inr, inrSigned, num, pctOf } from '../../lib/format';
import { groupLabel, offerLabel } from '../../lib/labels';

export type TourStep = { route: string; caption: (d: Derived, m: Model) => string; run?: () => void | Promise<void> };

const later = (ms: number, fn: () => void) => setTimeout(fn, ms);
const scrollTo = (sel: string, ms = 250) => later(ms, () => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
const money = (x: number | null) => (x === null ? '—' : inr(x));
const pp = (x: number) => `${x >= 0 ? '+' : ''}${num(x, 1)} pp`;

export function tourV2Steps(deps: { ask: (q: string) => Promise<void>; setShopper: (id: string) => void }): TourStep[] {
  const { ask, setShopper } = deps;
  const st = () => useStore.getState();
  return [
    { route: '/', caption: (d) => `21 Sep. ALPHA10 paid ${money(d.a10CostPerOrder)} in discounts for every order it created; each order earns you ${inr(d.earnedPerOrder)} after returns` },
    { route: '/ray', caption: (d) => `Ray: "Anything I should fix?" → ${d.signals.filter((s) => s.breached).length} signals over their thresholds, and how Ray found them`, run: () => { useChat.getState().clear(); return ask('Anything I should fix?'); } },
    { route: '/ray', caption: (d) => `Why AI, not a simple rule: same shoppers, same ${inr(d.draftComparison.budget)} budget → ${d.draftComparison.rows.map((r) => inrSigned(r.profit)).join(' vs ')} a month`, run: () => ask('Why AI, not a simple rule?') },
    {
      route: '/ray', caption: (d, m) => `Setup asks for your numbers, never assumes them: typical values for ${d.benchmark.ok ? d.benchmark.peerLabel.toLowerCase() : 'stores your size'} are shown, you answer or accept. Why? shows the playbook (${num(m.pool.size)} stores like yours)`,
      run: async () => { await ask('Set up Smart Offers'); await ask('₹1,00,000'); await ask(`₹${DEFAULT_KEEP_PER_1000}`); await ask('Most profit'); await ask('Use typical for the rest'); later(350, () => (document.querySelector('#plan-card .whyl') as HTMLButtonElement | null)?.click()); scrollTo('.pb-side', 600); },
    },
    { route: '/ray', caption: () => `Approve the plan and the experiment space (tests on at most ${pctOf(TRAFFIC_SHARE, 0)} of a group). Only a human click spends money`, run: () => { st().approve(); scrollTo('.ok-card'); } },
    {
      route: '/offers/smart?tab=checkout', caption: (d) => `20 days later at checkout: Priya (new, Instagram ad) gets ${offerLabel(d.liveOffers.new_ads_small).toLowerCase()}; Neha (returning) gets no offer`,
      run: () => { st().jump20(); setShopper('priya'); later(3000, () => setShopper('neha')); },
    },
    {
      route: '/offers/smart', caption: (d) => { const s = d.snapshots.day20; return `Day 20 vs the holdout, after returns: ${inrSigned(s.profit)}; cost per extra order ${money(s.metrics.costPerExtraOrder)} vs ${inr(d.earnedPerOrder)} earned`; },
      run: () => { st().setSnapshot('day20'); scrollTo('.hero-metric'); },
    },
    { route: '/studio/smart-offers', caption: (d) => `Agent Studio: Now · Next · Waiting on you (${pendingActions(d.reviews, st().reviewDecisions).length}). The agent works nightly; you decide`, run: () => scrollTo('.now-strip') },
    { route: '/studio/smart-offers?tab=experiments', caption: () => `Experiments: ${offerLabel('flat_200')} vs ${offerLabel('flat_150')} on ${pctOf(TRAFFIC_SHARE, 0)} of big carts; a playbook test for organic waits on you`, run: () => scrollTo('.exp-table') },
    { route: '/studio/smart-offers', caption: () => `Decisions served to other agents: Cart Abandonment asks about Neha → no offer (returning buyers recover at ${pctOf(RECOVERY.returning.without, 0)} without one)`, run: () => scrollTo('.brain') },
    {
      route: '/studio/smart-offers?tab=reviews',
      caption: (d) => { const p = d.learning?.proposal; return p ? `Mon 12 Oct review: promote ${offerLabel('flat_150')} (${pp(p.champion.liftPp)} vs ${pp(p.challenger.liftPp)}, ${num(p.spendCutPct)}% less spend) → Approved, logged` : 'Weekly review: approve or keep each proposal'; },
      run: () => {
        st().jump30();
        const title = `Promote ${offerLabel('flat_150')} for ${groupLabel('new_ads_big')}`;
        st().decideLearning(KEYS.promoteBig, 'approved', title);
        st().decideReview(`w3-${KEYS.promoteBig}`, 'approved', title, true);
        later(400, () => {
          const card = [...document.querySelectorAll('.review')].find((e) => e.textContent?.includes('Week 3 review'));
          const head = card?.querySelector('.rv-h') as HTMLButtonElement | null;
          if (head && head.getAttribute('aria-expanded') === 'false') head.click();
          later(150, () => card?.querySelector('.rv-item.experiment')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        });
      },
    },
    {
      route: '/offers/smart', caption: (d) => `Day 30: keep Smart Offers? Expected ${inrSigned(d.pilot.expectedProfitMonth)} a month after returns; fee ${inr(d.pilot.fee.fee)} only on proven sales → Kept`,
      run: () => { st().decidePilot('keep', 'Kept Smart Offers after the pilot'); scrollTo('.decision'); },
    },
    {
      route: '/studio/smart-offers?tab=impact',
      caption: (d) => `Impact: cost per extra order ${money(d.a10CostPerOrder)} (ALPHA10) → ${money(d.snapshots.day20.metrics.costPerExtraOrder)} (day 20) → ${money(d.live.extraOrders ? d.live.spend / d.live.extraOrders : null)} (plan now); profit after returns is the north star`,
      run: () => scrollTo('.hero-metric'),
    },
    {
      route: '/studio/smart-offers', caption: (d) => `Kill switch: off instantly, logged, then Resume. Outcome: ALPHA10 lost ${inr(Math.abs(d.a10.profit))} a month; Smart Offers plans ${inrSigned(d.live.profit)} after returns`,
      run: () => { st().kill(); later(3000, () => st().resume()); },
    },
  ];
}
