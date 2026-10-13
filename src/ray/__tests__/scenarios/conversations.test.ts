/**
 * v3 QA: 250 merchant conversations × 6 store states through Ray's conversation core.
 * Fails on any invariant break: generic-help fallthrough, "I couldn't…", a card that disagrees with the
 * text, a chip or "yes" that leads nowhere, a preset number the merchant never gave, a wrong refusal.
 */
import { loadModel } from '../../../state/model';
import type { Model } from '../../../state/model';
import { SCENARIOS, WANDERERS } from './corpus';
import { checkConversation, runConversation, STATES } from './harness';

let model: Model;
beforeAll(async () => { model = await loadModel(); });

describe('Ray conversations (demo mode, all store states)', () => {
  it(`has at least 200 scenarios`, () => expect(SCENARIOS.length).toBeGreaterThanOrEqual(200));
  for (const st of STATES) {
    it(`state ${st}: every conversation passes`, () => {
      const issues = SCENARIOS.flatMap((sc) => checkConversation(model, sc, st)).filter((i) => !i.reportOnly);
      expect(issues.map((i) => `${i.scenario} t${i.turn} "${i.text}": ${i.problem}`)).toEqual([]);
    }, 60000);
  }
});

describe('side questions in the middle of setup (wanderers)', () => {
  for (const st of ['fresh', 'live20'] as const) {
    it(`state ${st}: every wanderer passes, and setup carries on afterwards`, () => {
      const issues = WANDERERS.flatMap((sc) => checkConversation(model, sc, st));
      expect(issues.map((i) => `${i.scenario} t${i.turn} "${i.text}": ${i.problem} → ${i.reply}`)).toEqual([]);
      for (const sc of WANDERERS.filter((w) => !w.expect?.refused)) {
        const ex = runConversation(model, sc, st);
        const after = ex[ex.length - 1];
        // The answer after the side question is saved (or "Resume setup" returns to the question).
        expect([sc.id, after.patches.length > 0 || (after.user === 'Resume setup' && after.setup !== null)]).toEqual([sc.id, true]);
      }
    }, 60000);
  }
});
