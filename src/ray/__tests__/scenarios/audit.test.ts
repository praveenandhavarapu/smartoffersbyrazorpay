/** Writes a report of every invariant failure across all scenarios and states (run with RAY_AUDIT=path). */
import { writeFileSync } from 'node:fs';
import { loadModel } from '../../../state/model';
import { SCENARIOS } from './corpus';
import { checkConversation, STATES, type Issue } from './harness';

const out = process.env.RAY_AUDIT;
describe.runIf(Boolean(out))('Ray scenario audit (report only)', () => {
  it('writes the report', async () => {
    const model = await loadModel();
    const issues: Issue[] = [];
    for (const sc of SCENARIOS) for (const st of STATES) issues.push(...checkConversation(model, sc, st));
    const byProblem: Record<string, number> = {};
    for (const i of issues) { const k = i.problem.replace(/".*"/, '"…"').replace(/₹[\d,−-]+/g, '₹X'); byProblem[k] = (byProblem[k] ?? 0) + 1; }
    const scenariosHit = new Set(issues.map((i) => i.scenario));
    writeFileSync(out!, JSON.stringify({ scenarios: SCENARIOS.length, states: STATES.length, conversations: SCENARIOS.length * STATES.length, issueCount: issues.length, scenariosWithIssues: scenariosHit.size, byProblem, issues }, null, 1));
  }, 120000);
});
