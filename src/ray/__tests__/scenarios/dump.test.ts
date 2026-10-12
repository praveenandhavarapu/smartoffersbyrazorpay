/** Prints conversations for human review (run with RAY_DUMP=path [RAY_DUMP_STATES=fresh,live20]). */
import { writeFileSync } from 'node:fs';
import { loadModel } from '../../../state/model';
import { SCENARIOS } from './corpus';
import { runConversation, type StateId } from './harness';

const out = process.env.RAY_DUMP;
describe.runIf(Boolean(out))('Ray scenario dump', () => {
  it('writes transcripts', async () => {
    const model = await loadModel();
    const states = (process.env.RAY_DUMP_STATES ?? 'fresh,live20').split(',') as StateId[];
    const lines: string[] = [];
    for (const sc of SCENARIOS) for (const st of states) {
      lines.push(`=== ${sc.id} [${st}] (${sc.cat})`);
      for (const e of runConversation(model, sc, st)) {
        lines.push(`> ${e.user}   {${e.intent ?? ''}}`);
        for (const m of e.msgs) lines.push(`  ${m.text.replace(/\n/g, '\n  ')}${m.cards?.length ? `\n  [cards: ${m.cards.map((c) => c.kind + ('title' in c ? `:${c.title}` : '')).join(', ')}]` : ''}${m.quick?.length ? `\n  [chips: ${m.quick.map((q) => q.label).join(' | ')}]` : ''}`);
      }
    }
    writeFileSync(out!, lines.join('\n'));
  }, 120000);
});
