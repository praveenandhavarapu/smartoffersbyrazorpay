/**
 * Guided Smart Offers setup inside the chat (same in Live and Demo mode; the answers are form inputs).
 * v3: nothing is assumed. Each question shows what stores this size typically use (privacy-guarded
 * benchmark) and the merchant answers with their own number, accepts the typical one, or says
 * "use typical for the rest". Growth goals also ask how much profit to give up.
 */
import type { Goal, OfferId } from '../data/types';
import type { InputKey, InputSource, Settings } from '../state/store';
import type { QuickReply } from './demoRouter';
import type { SetupStep } from './chatStore';
import type { RayCtx } from './tools';
import { offersIn, parseAmount } from './parse';
import { KEEP_GUIDANCE } from './templates';
import { DEFAULT_KEEP_PER_1000 } from '../engine/net';
import { MAX_DISCOUNT_PER_ORDER } from '../engine/guardrails';
import { typicalPatch } from '../state/inputs';
import { exploreBudget, growthFrontier, pointWithin } from '../engine/tradeoffs';
import { recommendOffers } from '../engine/recommend';
import { buildPlan } from '../engine/plan';
import { offerLabel } from '../lib/labels';
import { inr, num, xr } from '../lib/format';

export const SETUP_ORDER: SetupStep[] = ['budget', 'margin', 'goal', 'growth', 'offers', 'floor', 'rules'];
const KEY: Record<SetupStep, InputKey> = { budget: 'budget', margin: 'keepPer1000', goal: 'goal', growth: 'goal', offers: 'offers', floor: 'minReturn', rules: 'festiveWindow' };

/** Steps that apply to these settings (the growth step only for growth goals). */
export const stepsFor = (s: Settings): SetupStep[] => SETUP_ORDER.filter((x) => x !== 'growth' || s.goal !== 'most_profit');
export const nextStep = (step: SetupStep, s: Settings): SetupStep | null => { const order = stepsFor(s); const i = order.indexOf(step); return i >= 0 ? order[i + 1] ?? null : order[0]; };

export type QCtx = { ctx: RayCtx; settings: Settings };
const REST: QuickReply = { label: 'Use typical for the rest', message: 'Use typical for the rest' };
const be = (s: Settings) => 1000 / s.keepPer1000;

function frontierFor(q: QCtx) {
  const metric = q.settings.goal === 'orders_steady' ? 'orders' as const : 'new_customers' as const;
  return { metric, f: growthFrontier(q.ctx.derived.planGroups, q.ctx.derived.planSettingsFor({ ...q.settings, growth: null }), metric, exploreBudget(q.settings.budget)) };
}

export function question(step: SetupStep, q: QCtx): { text: string; quick: QuickReply[] } {
  const out = questionBase(step, q);
  if (!q.ctx.approved) return out;
  // Live store: show the approved value and offer to keep it (changes become a draft).
  const s = q.ctx.derived.liveSettings;
  const cur = step === 'budget' ? inr(s.budget) : step === 'margin' ? `${inr(s.keepPer1000)} of ₹1,000` : step === 'goal' ? (s.goal === 'most_profit' ? 'Most profit' : s.goal === 'new_customers' ? 'Most new customers' : 'Keep orders steady') : step === 'floor' ? (s.minReturn ? xr(s.minReturn) : 'break-even') : step === 'rules' ? (s.festiveWindow ? 'no offers on the drop' : 'no rule') : step === 'offers' ? s.allowedOffers.map(offerLabel).join(', ') : null;
  if (!cur) return out;
  return { text: out.text.replace(/^(Q\d+ · )/, `$1Now: **${cur}**. `), quick: [{ label: `Keep ${cur}`, message: 'keep it' }, ...out.quick.filter((x) => x.message !== 'keep these')] };
}

function questionBase(step: SetupStep, q: QCtx): { text: string; quick: QuickReply[] } {
  const s = q.settings;
  const steps = stepsFor(s);
  // No "n of total": the growth question only appears for growth goals, so the total isn't known up front.
  const n = `Q${steps.indexOf(step) + 1}`;
  const b = q.ctx.derived.benchmark;
  const peers = b.ok ? `${b.peerLabel.toLowerCase()} (${num(b.stores)} stores)` : '';
  if (step === 'budget') {
    if (!b.ok) return { text: `${n} · How much can you spend on checkout offers each month? (₹5,000 to ₹10,00,000)`, quick: [REST] };
    return { text: `${n} · How much can you spend on checkout offers each month? I won't assume it. For ${peers}, the typical budget at your sales is **${inr(b.budgetInr.p25)}–${inr(b.budgetInr.p75)}** (median ${inr(b.budgetInr.median)}, ${num(b.offerSpendPct.median, 1)}% of sales). Type yours (₹5,000 to ₹10,00,000) or pick one.`,
      quick: [{ label: `${inr(b.budgetInr.median)} (typical)`, message: 'typical' }, { label: `${inr(b.budgetInr.p25)} (lower)`, message: inr(b.budgetInr.p25) }, { label: `${inr(b.budgetInr.p75)} (higher)`, message: inr(b.budgetInr.p75) }, REST] };
  }
  if (step === 'margin') {
    const t = `${n} · What do you keep from a ₹1,000 sale after product, shipping, packaging and payment costs? It decides which offers pay back, so your own number matters most.`;
    if (!b.ok) return { text: `${t} ${KEEP_GUIDANCE.text}.`, quick: [DEFAULT_KEEP_PER_1000 - 100, DEFAULT_KEEP_PER_1000, DEFAULT_KEEP_PER_1000 + 100].map((v) => ({ label: `₹${v}`, message: `₹${v}` })) };
    return { text: `${t} Stores your size keep **${inr(b.keepPer1000.p25)}–${inr(b.keepPer1000.p75)}** (median ${inr(b.keepPer1000.median)}).`,
      quick: [{ label: `${inr(b.keepPer1000.median)} (typical)`, message: 'typical' }, { label: inr(b.keepPer1000.p25), message: inr(b.keepPer1000.p25) }, { label: inr(b.keepPer1000.p75), message: inr(b.keepPer1000.p75) }, { label: 'I don\'t know', message: 'I don\'t know' }] };
  }
  if (step === 'goal') {
    return { text: `${n} · What matters most?${b.ok ? ` Stores your size choose Most profit (${b.goalMixPct.most_profit}%), Most new customers (${b.goalMixPct.new_customers}%) or Keep orders steady (${b.goalMixPct.orders_steady}%).` : ''}`,
      quick: [{ label: 'Most profit', message: 'Most profit' }, { label: 'Most new customers', message: 'Most new customers' }, { label: 'Keep orders steady', message: 'Keep orders steady' }, REST] };
  }
  if (step === 'growth') {
    const { metric, f } = frontierFor(q);
    const unit = metric === 'orders' ? 'orders' : 'new customers';
    if (f.length < 2) return { text: `${n} · At your numbers no offer adds ${unit} beyond the most-profit plan, so there's nothing to trade. Reply "ok" to continue.`, quick: [{ label: 'OK', message: 'none' }] };
    const opt = f.slice(1, 4);
    const gain = (p: (typeof f)[number]) => num(metric === 'orders' ? p.extraOrders : p.extraNewCustomers);
    // A bigger budget can add customers AND profit (the plan was budget-bound): say so, don't call it "give up ₹0".
    const line = (p: (typeof f)[number]) => (p.giveUp <= 0
      ? `- A **${inr(p.budget)} budget**: **+${gain(p)}** ${unit} and ${inr(-p.giveUp)} more profit`
      : `- Give up **${inr(p.giveUp)}**: **+${gain(p)}**${p.budget > s.budget ? ` (needs a ${inr(p.budget)} budget)` : ''}`);
    const chip = (p: (typeof f)[number]) => (p.giveUp <= 0 ? { label: `${inr(p.budget)} budget: +${gain(p)}`, message: `raise budget to ${inr(p.budget)}` } : { label: p.giveUp < 100 ? `Almost free: +${gain(p)}` : `${inr(p.giveUp)}: +${gain(p)}`, message: `give up ${inr(Math.ceil(p.giveUp))}` });
    return { text: `${n} · More ${unit} costs profit. How much a month will you give up? From your most-profit plan (${num(metric === 'orders' ? f[0].orders : f[0].newCustomers)} ${unit} a month):\n${opt.map(line).join('\n')}${b.ok && b.growthGiveUpPct !== null ? `\nStores your size with a growth goal give up about ${b.growthGiveUpPct}% of planned profit.` : ''}`,
      quick: [...opt.map(chip), { label: 'None: most profit', message: 'none' }] };
  }
  if (step === 'offers') {
    const recs = recommendOffers(q.ctx.derived.planGroups, q.ctx.derived.planSettingsFor(s)).filter((r) => r.verdict === 'adds_profit');
    return { text: `${n} · Which offers may I use, and at most how much off per order? Your menu now: **${s.allowedOffers.map(offerLabel).join(', ')}**, max **${inr(s.maxDiscountInr)}**.${b.ok ? ` Stores your size allow free shipping (${b.menuPct.free_shipping}%), ₹100 off (${b.menuPct.flat_100}%), ₹200 off (${b.menuPct.flat_200}%); max discount median ${inr(b.maxDiscountInr.median)}.` : ''}${recs.length ? ` Worth adding at your numbers: ${recs.slice(0, 2).map((r) => `${r.label} (${r.profitDelta >= 0 ? '+' : ''}${inr(r.profitDelta)} a month)`).join(', ')}.` : ''}`,
      quick: [{ label: 'Keep this menu', message: 'keep these' }, ...(recs.length ? [{ label: 'Add the recommended offers', message: 'add recommended' }] : []), { label: 'Only free shipping', message: 'only free shipping' }, { label: 'Max ₹150 off', message: 'max ₹150' }, REST] };
  }
  if (step === 'floor') {
    const x = be(s);
    const hi = b.ok ? Math.round(b.floor.usualHigherMultiple * x * 100) / 100 : Math.round(x * 1.2 * 100) / 100;
    return { text: `${n} · Minimum return after returns for any offer? At your margin, break-even is **${xr(x)}** (below it an offer loses money).${b.ok ? ` ${b.floor.breakEvenPct}% of stores your size use break-even; ${b.floor.higherPct}% ask for more, usually ${b.floor.usualHigherMultiple}× (${xr(hi)}).` : ''} A higher bar keeps fewer offers.`,
      quick: [{ label: `Break-even (${xr(x)})`, message: 'break-even' }, { label: `${xr(hi)}`, message: `${hi}x` }, REST] };
  }
  const festive = q.ctx.model.profile.upcomingDrop.name;
  return { text: `${n} · Any rules? Should I keep offers off ${festive} styles for their first week at full price?${b.ok ? ` ${b.pausesOnDropsPct}% of stores your size pause offers on new drops.` : ''}`, quick: [{ label: 'Yes, no offers on the drop', message: 'Yes' }, { label: 'No rule', message: 'No' }] };
}

export type SetupAnswer =
  | { ok: true; patch: Partial<Settings>; source: InputSource; note?: string; rest?: boolean; again?: boolean }
  | { ok: false; hint: string };

const TYPICAL = /\b(typical|usual|standard|median|benchmark|default)\b|\bdon'?t know\b|\bnot sure\b|\bno idea\b|\bwhatever (is|you) (normal|suggest)/;
const REST_RE = /\btypical (values )?for (the )?(rest|everything|all)\b|\brest (as )?typical\b|\buse typical values\b|\ball typical\b/;

export function parseAnswer(step: SetupStep, text: string, q?: QCtx): SetupAnswer {
  const t = text.toLowerCase().trim();
  const b = q?.ctx.derived.benchmark;
  const s = q?.settings;
  if (q && s && /^(keep( it| the same| as is)?|same|no change|unchanged)$/.test(t) && step !== 'growth') {
    const keepPatch: Partial<Settings> = step === 'budget' ? { budget: s.budget } : step === 'margin' ? { keepPer1000: s.keepPer1000 } : step === 'goal' ? { goal: s.goal } : step === 'offers' ? { allowedOffers: s.allowedOffers, maxDiscountInr: s.maxDiscountInr } : step === 'floor' ? { minReturn: s.minReturn ?? null } : { festiveWindow: s.festiveWindow };
    return { ok: true, patch: keepPatch, source: 'merchant' };
  }
  if (q && b && s && REST_RE.test(t)) {
    const remaining = [...new Set(stepsFor(s).slice(stepsFor(s).indexOf(step)).map((x) => KEY[x]))];
    return { ok: true, patch: { ...typicalPatch(b, remaining, be(s)), ...(remaining.includes('goal') && step !== 'growth' ? {} : {}) }, source: 'typical', rest: true, note: b.ok ? `Using typical values for ${b.peerLabel.toLowerCase()} for the rest. They're marked "typical, accepted" and you can change any of them on the plan.` : undefined };
  }
  if (q && b && s && TYPICAL.test(t) && step !== 'growth' && step !== 'rules') {
    if (!b.ok) return { ok: false, hint: 'I can\'t share a typical value for stores your size. Please give your own number.' };
    const patch = typicalPatch(b, [KEY[step]], be(s));
    const note = step === 'margin' && /don'?t know|not sure|no idea/.test(t) ? `I'll use the typical ${inr(b.keepPer1000.median)} and mark it as typical, not yours. Check it with your accounts: a wrong margin flips which offers pay back.` : undefined;
    return { ok: true, patch, source: 'typical', note };
  }
  if (step === 'budget') {
    const a = parseAmount(t);
    if (!a || a < 5000 || a > 1000000) return { ok: false, hint: 'Please give a monthly amount between ₹5,000 and ₹10,00,000, like ₹1,00,000 or 1 lakh, or say "typical".' };
    return { ok: true, patch: { budget: Math.round(a) }, source: 'merchant' };
  }
  if (step === 'margin') {
    const pct = t.match(/(\d+(?:\.\d+)?)\s?%/);
    const amt = parseAmount(t.replace(/\d+(\.\d+)?\s?%/, ''));
    const keep = pct ? Math.round(parseFloat(pct[1]) * 10) : amt && amt < 1000 ? Math.round(amt) : null;
    if (!keep || keep < 50 || keep > 950) return { ok: false, hint: `Tell me what you keep from a ₹1,000 sale, like ₹${DEFAULT_KEEP_PER_1000} (or ${DEFAULT_KEEP_PER_1000 / 10}%), or say "I don't know" to use the typical value.` };
    const typ = b?.ok ? `stores your size keep ${inr(b.keepPer1000.p25)}–${inr(b.keepPer1000.p75)}` : KEEP_GUIDANCE.text.replace(/^Typical/, 'typical').replace(/^Most/, 'most');
    let note = keep < 200 || keep > 650 ? `₹${keep} of ₹1,000 is unusual (${typ}). I'll use it, but please double-check: a wrong margin flips which offers pay back.` : undefined;
    if (q) {
      const plan = q.ctx.derived.planSettingsFor({ ...q.settings, keepPer1000: keep });
      const none = buildPlan(q.ctx.derived.planGroups, plan).rows.every((r) => r.offer === 'none');
      if (none) note = `${note ? `${note} ` : ''}At ₹${keep} of ₹1,000 break-even is ${xr(1000 / keep)}: none of the offers on your menu pays back, so the most-profit plan is no offers. Cheaper offers (I'll show them) or giving up profit for growth can change that.`;
    }
    return { ok: true, patch: { keepPer1000: keep }, source: 'merchant', note };
  }
  if (step === 'goal') {
    // A corrected margin typed right after the margin question ("₹400", "40%") is a margin answer.
    if (/^(₹|rs\.?\s?)?\s?\d{2,3}\s?%?$/.test(t) || /^(i keep |keep )?₹\s?\d{2,3}$/.test(t)) {
      const m = parseAnswer('margin', t, q);
      if (m.ok) return { ...m, note: `Updated what you keep from ₹1,000 to ${inr(m.patch.keepPer1000 ?? 0)}.${m.note ? ` ${m.note}` : ''}`, again: true };
    }
    const goal: Goal | null = /new/.test(t) ? 'new_customers' : /steady|orders|volume/.test(t) ? 'orders_steady' : /profit|money|margin/.test(t) ? 'most_profit' : null;
    if (!goal) return { ok: false, hint: 'Pick one: Most profit, Most new customers, or Keep orders steady.' };
    return { ok: true, patch: { goal, ...(goal === 'most_profit' ? { growth: null } : {}) }, source: 'merchant' };
  }
  if (step === 'growth') {
    if (/\bbudget\b/.test(t)) {
      const b2 = parseAmount(t);
      if (b2 && b2 >= 5000 && b2 <= 1000000) return { ok: true, patch: { budget: Math.round(b2), growth: null }, source: 'merchant', note: `Budget set to ${inr(b2)}: more new customers and more profit, no trade-off needed.` };
    }
    if (/^(none|no|0|zero|nothing|most profit|ok|okay|skip)\b/.test(t) || /\bnone\b/.test(t)) return { ok: true, patch: { growth: null }, source: 'merchant' };
    const a = parseAmount(t);
    if (a === null || !q) return { ok: false, hint: 'How much profit a month will you give up for growth? Say an amount like ₹5,000, or "none".' };
    const { metric, f } = frontierFor(q);
    const p = pointWithin(f, a);
    return { ok: true, patch: { growth: p.growth ? { ...p.growth, metric } : null, budget: p.budget }, source: 'merchant', note: p.growth ? `Set: give up up to ${inr(Math.max(0, p.giveUp))} a month for **+${num(metric === 'orders' ? p.extraOrders : p.extraNewCustomers)}** ${metric === 'orders' ? 'orders' : 'new customers'}${p.budget > (s?.budget ?? 0) ? `; budget raised to ${inr(p.budget)} to fund it` : ''}.` : `${inr(a)} doesn't reach the first growth step, so the plan stays most profit.` };
  }
  if (step === 'offers') {
    const cur: OfferId[] = s?.allowedOffers ?? ['free_shipping', 'flat_100', 'flat_200'];
    const max = t.match(/\bmax(imum)?\D{0,12}(\d+)/);
    const maxPatch = max ? { maxDiscountInr: Math.min(MAX_DISCOUNT_PER_ORDER, Number(max[2])) } : {};
    if (max && Number(max[2]) > MAX_DISCOUNT_PER_ORDER) return { ok: false, hint: `The max discount per order can't go above ${inr(MAX_DISCOUNT_PER_ORDER)} (guardrail). Pick ${inr(MAX_DISCOUNT_PER_ORDER)} or less.` };
    if (/\badd (the )?recommended\b/.test(t) && q) {
      const recs = recommendOffers(q.ctx.derived.planGroups, q.ctx.derived.planSettingsFor(q.settings)).filter((r) => r.verdict === 'adds_profit' && r.offer !== 'early_access').map((r) => r.offer as OfferId);
      return { ok: true, patch: { allowedOffers: [...cur, ...recs.filter((o) => !cur.includes(o))], ...maxPatch }, source: 'merchant' };
    }
    const offs: OfferId[] = offersIn(t).filter((o) => o !== 'none');
    if (/\b(keep|same|fine|as is|these|ok|okay|yes)\b/.test(t) && !offs.length) return { ok: true, patch: { allowedOffers: cur, ...maxPatch }, source: 'merchant' };
    if (offs.length) {
      const remove = /\b(no|not|without|remove|drop|except)\b/.test(t) && !/\bonly\b/.test(t);
      return { ok: true, patch: { allowedOffers: remove ? cur.filter((o) => !offs.includes(o)) : /\bonly\b/.test(t) ? offs : [...new Set([...cur, ...offs])], ...maxPatch }, source: 'merchant' };
    }
    if (max) return { ok: true, patch: { allowedOffers: cur, ...maxPatch }, source: 'merchant' };
    return { ok: false, hint: 'Say "keep these", name the offers (for example "only free shipping" or "no ₹200 off"), or set a max like "max ₹150".' };
  }
  if (step === 'floor') {
    if (/break[- ]?even/.test(t)) return { ok: true, patch: { minReturn: null }, source: 'merchant' };
    const x = t.match(/(\d+(?:\.\d+)?)\s?x\b/) ?? t.match(/^(\d+(?:\.\d+)?)$/);
    if (!x) return { ok: false, hint: 'Say "break-even" or a number like 2.5x.' };
    const v = parseFloat(x[1]);
    if (v <= 0 || v > 20) return { ok: false, hint: 'Pick a minimum return between break-even and 20x.' };
    return { ok: true, patch: { minReturn: Math.round(v * 100) / 100 }, source: 'merchant', note: s && v > be(s) * 1.6 ? `${xr(v)} is well above break-even (${xr(be(s))}); expect few or no offers. You can lower it on the plan.` : undefined };
  }
  if (/^(y|yes|yeah|yep|sure|ok|okay)\b|no offers on|keep (them )?off/.test(t)) return { ok: true, patch: { festiveWindow: true }, source: 'merchant' };
  if (/^(n|no|nope|none)\b|no rule|skip/.test(t)) return { ok: true, patch: { festiveWindow: false }, source: 'merchant' };
  return { ok: false, hint: 'Yes or no: keep offers off the festive drop for its first week?' };
}
