/**
 * v3 QA: 225 merchant conversations × 6 store states through Ray's conversation core.
 * Fails on any invariant break: generic-help fallthrough, "I couldn't…", a card that disagrees with the
 * text, a chip or "yes" that leads nowhere, a preset number the merchant never gave, a wrong refusal.
 */
import { loadModel } from '../../../state/model';
import type { Model } from '../../../state/model';
import { SCENARIOS } from './corpus';
import { checkConversation, STATES } from './harness';

let model: Model;
beforeAll(async () => { model = await loadModel(); });

describe('Ray conversations (demo mode, all store states)', () => {
  it(`has at least 200 scenarios`, () => expect(SCENARIOS.length).toBeGreaterThanOrEqual(200));
  for (const st of STATES) {
    it(`state ${st}: every conversation passes`, () => {
      const issues = SCENARIOS.flatMap((sc) => checkConversation(model, sc, st));
      expect(issues.map((i) => `${i.scenario} t${i.turn} "${i.text}": ${i.problem}`)).toEqual([]);
    }, 60000);
  }
});
