/**
 * v3.1: setup is a form the merchant can step out of. A question is never an answer, every message gets a
 * real reply, and Ray never sends the same text twice in a row (bug from a tester stuck at the offers question).
 */
import { loadModel, type Model } from '../../state/model';
import { converse, type ConvState } from '../converse';
import { classifySetupTurn, parseAnswer, question, SETUP_ORDER, type QCtx } from '../setupFlow';
import { ctxFor, initialState, runConversation, type StateId } from './scenarios/harness';
import type { SetupStep } from '../chatStore';
import { DEFAULT_USER_SETTINGS } from '../../state/store';

let model: Model;
beforeAll(async () => { model = await loadModel(); });

const TO_OFFERS = ['Set up Smart Offers', '₹1,00,000', '₹500', 'Most profit'];
const TESTER = ['are there other possible options you can come up with?', 'no, you tell me other ideas for offers', 'no, look at my competitors. what discounts are they using?'];
const run = (turns: string[], st: StateId = 'fresh') => runConversation(model, { id: 't', cat: 't', turns }, st);
const textOf = (e: ReturnType<typeof run>[number]) => e.msgs.map((m) => m.text).join('\n');

describe('the tester transcript (offers step)', () => {
  for (const st of ['fresh', 'live20'] as const) {
    it(`${st}: three different, useful replies; setup stays at offers; nothing saved`, () => {
      const ex = run([...TO_OFFERS, ...TESTER], st);
      const before = ex[TO_OFFERS.length - 1];
      expect(before.setup).toBe('offers');
      const side = ex.slice(TO_OFFERS.length);
      const texts = side.map(textOf);
      expect(new Set([textOf(before), ...texts]).size).toBe(4);
      for (const t of texts.slice(0, 2)) expect(t).toMatch(/prepaid only|₹150 off|₹999\+/);
      expect(texts[2]).toMatch(/can't share information about other businesses/);
      expect(texts[2]).toMatch(/pooled|similar fashion stores|stores your size/);
      for (const e of side) {
        expect(e.patches).toEqual([]);
        expect(e.setup === 'offers' || (e.paused === 'offers' && e.msgs.some((m) => m.quick?.some((q) => /^Resume setup/.test(q.message))))).toBe(true);
        expect(e.settings).toEqual(before.settings);
      }
      expect(texts.every((t) => /Back to Q4:/.test(t))).toBe(true);
    });
  }
});

function q(st: StateId, settings = initialState(st).settings): QCtx {
  const ctx = ctxFor(model, { ...initialState(st), settings });
  return { ctx, settings };
}
const turnAt = (step: SetupStep, text: string, qc: QCtx, extra: Partial<ConvState> = {}) => converse(text, qc.ctx, { setup: step, last: null, ...extra });

describe('a question is never an answer', () => {
  const NOT_ANSWERS: [SetupStep, string][] = [
    ['budget', 'is ₹50,000 too little?'],
    ['margin', 'is 40% normal for fashion?'],
    ['goal', 'what is the difference between most profit and new customers?'],
    ['offers', 'what happens if I remove ₹200 off?'],
    ['offers', 'what does free shipping actually do for me?'],
    ['rules', 'no idea what the festive drop is, explain?'],
    ['margin', 'what happens if I remove ₹200 off?'],
    ['margin', 'can I do 15% off instead?'],
    ['margin', 'what if I spend 2 lakh?'],
  ];
  for (const [step, text] of NOT_ANSWERS) {
    it(`${step}: "${text}" is not saved`, () => {
      const qc = q('fresh');
      expect(['question', 'what_if']).toContain(classifySetupTurn(step, text, qc));
      const t = turnAt(step, text, qc);
      expect(t.patches ?? []).toEqual([]);
      expect(t.setup).toBe(step);
      expect(t.messages[t.messages.length - 1].text).toMatch(/Back to Q\d+:/);
    });
  }

  it('what-ifs show the scenario and a "Use <value>" chip that counts as the answer', () => {
    const qc = q('fresh');
    const t = turnAt('budget', 'is ₹50,000 too little?', qc);
    const m = t.messages[0];
    expect(m.cards?.[0]?.kind).toBe('sim');
    const isUse = (c: { label: string }) => /^Use[: ]/.test(c.label) && !/typical/.test(c.label);
    const use = m.quick?.find(isUse);
    expect(use).toBeTruthy();
    expect(classifySetupTurn('budget', use!.message, qc)).toBe('answer');
    expect(turnAt('budget', use!.message, qc).patches?.[0]?.patch).toEqual({ budget: 50000 });
    const r = turnAt('offers', 'what happens if I remove ₹200 off?', qc).messages[0];
    const useR = r.quick!.find(isUse)!;
    expect(turnAt('offers', useR.message, qc).patches?.[0]?.patch.allowedOffers).toEqual(['free_shipping', 'flat_100']);
  });

  it('a value for another question shows that scenario, never a margin or a draft', () => {
    const qc = q('fresh');
    const rm = turnAt('margin', 'what happens if I remove ₹200 off?', qc);
    expect(rm.reply?.toolCalls[0]?.args).toEqual({ remove_offers: ['flat_200'] });
    expect(rm.messages[0].cards?.map((c) => c.kind)).toEqual(['sim']);
    const spend = turnAt('margin', 'what if I spend 2 lakh?', qc);
    expect(spend.reply?.toolCalls[0]?.args).toEqual({ budget: 200000 });
    expect(spend.messages[0].quick?.[0]).toEqual({ label: 'Change my budget', message: 'change my budget' });
    expect(turnAt('offers', 'is 40% normal?', qc).reply?.toolCalls[0]?.args).toEqual({ keep_per_1000: 400 });
    expect(turnAt('offers', 'is ₹50,000 too little?', qc).reply?.toolCalls[0]?.args).toEqual({ budget: 50000 });
    expect(turnAt('offers', 'free shipping over ₹5,000?', qc).reply?.toolCalls[0]?.args).not.toEqual({ budget: 5000 });
  });
});

describe('answers are saved exactly as before', () => {
  const growthSettings = { ...DEFAULT_USER_SETTINGS, goal: 'new_customers' as const };
  for (const st of ['fresh', 'live20'] as const) {
    it(`${st}: every setup chip is an answer`, () => {
      for (const step of SETUP_ORDER) {
        const qc = q(st, step === 'growth' ? growthSettings : undefined);
        for (const chip of question(step, qc).quick) {
          expect([step, chip.message, classifySetupTurn(step, chip.message, qc)]).toEqual([step, chip.message, 'answer']);
          const want = parseAnswer(step, chip.message, qc);
          expect(want.ok).toBe(true);
          if (want.ok) expect(turnAt(step, chip.message, qc).patches).toEqual([{ patch: want.patch, source: want.source }]);
        }
      }
    });
  }
  const ANSWERS: [SetupStep, string][] = [
    ['budget', '₹1,00,000'], ['budget', '1L'], ['budget', '1 lakh'], ['budget', '50k'], ['budget', 'set budget to 1 lakh'], ['budget', 'typical'],
    ['margin', '40%'], ['margin', '₹400'], ['margin', 'my margin is 35%'], ['margin', 'I keep ₹450'], ['margin', "I don't know"],
    ['goal', 'Most new customers'], ['goal', '₹400'],
    ['offers', 'only free shipping'], ['offers', 'max ₹150'], ['offers', 'keep these'], ['offers', 'no ₹200 off'], ['offers', 'add recommended'],
    ['floor', '2.5x'], ['floor', 'break-even'], ['rules', 'yes'], ['rules', 'no'], ['rules', 'Yes'], ['rules', 'No rule'], ['margin', 'use typical for the rest'],
  ];
  for (const [step, text] of ANSWERS) {
    it(`${step}: "${text}" is saved`, () => {
      const qc = q('fresh');
      expect(classifySetupTurn(step, text, qc)).toBe('answer');
      const want = parseAnswer(step, text, qc);
      expect(want.ok).toBe(true);
      if (want.ok) expect(turnAt(step, text, qc).patches).toEqual([{ patch: want.patch, source: want.source }]);
    });
  }
});

describe('navigation and unclear turns', () => {
  it('unclear turns escalate: hint + plain words, then an example with typical, then setup pauses', () => {
    const ex = run(['Set up Smart Offers', '₹1,00,000', 'blah', 'blah', 'blah']);
    const [a, b, c] = ex.slice(2);
    expect(new Set([textOf(ex[1]), textOf(a), textOf(b), textOf(c)]).size).toBe(4);
    expect(textOf(a)).toMatch(/In plain words/);
    expect(b.msgs[0].quick?.map((x) => x.label)).toEqual(expect.arrayContaining(['Use typical for this one', 'Ask something else']));
    expect(c.setup).toBeNull();
    expect(c.paused).toBe('margin');
    expect(c.msgs[0].quick?.[0]).toEqual({ label: 'Resume setup at Q2', message: 'Resume setup' });
    for (const e of [a, b, c]) expect(e.patches).toEqual([]);
  });
  it('pause keeps answers and resumes at the same question', () => {
    const ex = run(['Set up Smart Offers', '₹80,000', 'pause', 'Show my payments for the last 7 days', 'Resume setup', '₹450']);
    expect(ex[2].setup).toBeNull();
    expect(ex[2].paused).toBe('margin');
    expect(ex[2].settings.budget).toBe(80000);
    expect(ex[3].intent).toBe('payments');
    expect(ex[3].msgs[0].quick?.[0]).toEqual({ label: 'Resume setup at Q2', message: 'Resume setup' });
    expect(ex[4].setup).toBe('margin');
    expect(ex[5].patches[0].patch).toEqual({ keepPer1000: 450 });
  });
  it('back, skip, change my budget, start over, and where are we', () => {
    const back = run(['Set up Smart Offers', '₹80,000', 'go back']);
    expect(back[2].setup).toBe('budget');
    expect(back[2].patches).toEqual([]);
    const skip = run(['Set up Smart Offers', '₹80,000', 'skip']);
    expect(skip[2].patches[0].source).toBe('typical');
    expect(skip[2].setup).toBe('goal');
    const jump = run([...TO_OFFERS, 'change my budget']);
    expect(jump[4].setup).toBe('budget');
    const over = run([...TO_OFFERS, 'start over', 'keep it']);
    expect(over[4].setup).toBe('budget');
    expect(textOf(over[4])).toMatch(/₹1,00,000/);
    expect(over[5].patches[0].patch).toEqual({ budget: 100000 });
    const where = run([...TO_OFFERS, 'what have I answered so far?']);
    expect(where[4].setup).toBe('offers');
    expect(textOf(where[4])).toMatch(/Monthly budget: ₹1,00,000 a month \(yours\)/);
    expect(textOf(where[4])).toMatch(/Q4/);
  });
  it('never sends the same text twice in a row', () => {
    const ex = run(['Show my payments for the last 7 days', 'Show my payments for the last 7 days']);
    expect(textOf(ex[0])).not.toBe(textOf(ex[1]));
  });
});
