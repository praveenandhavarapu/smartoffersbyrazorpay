/** v2 §6: name the AI. Three models decide offline; Ray explains. Copy only; numbers come from the engine. */
import { useModel } from '../../state/ModelContext';
import { FEATURES } from '../../config/features';
import { num, pctOf } from '../../lib/format';

export const AI_NIGHTLY = 'AI re-decides every night. Checkout just reads the answer in under 1 ms.';
export const TABLE_NAME = FEATURES.heroMetric ? "tonight's decision table" : 'a precomputed table';

export function HowAIWorks({ compact }: { compact?: boolean }) {
  const { model, derived } = useModel();
  const snap = derived.today ? derived.snapshots[derived.today] : null;
  const offerRows = snap ? snap.rows.filter((r) => r.offer !== 'none') : [];
  const trust = offerRows.length ? offerRows.reduce((a, r) => a + r.trustWeight, 0) / offerRows.length : null;
  const items = [
    { name: 'Uplift model', body: 'Predicts the difference an offer makes for each shopper group, not who is likely to buy. Spends only where it changes the outcome.' },
    { name: 'Network playbook', body: `Starts from what worked in ${num(model.pool.size)} stores like yours, then leans on your own holdout as data grows${trust !== null ? ` (trust ${pctOf(trust, 0)} by day ${snap!.days})` : ''}.` },
    { name: 'Experiment engine', body: 'Keeps testing challengers against today\'s offer and promotes winners each week, with your approval.' },
    { name: 'Ray', body: 'Finds the leak, explains it and drafts changes for your approval. Ray never computes numbers; the engine does.' },
  ];
  if (compact) {
    return <p className="small muted ai-names">{items.map((i) => <span key={i.name}><b>{i.name}</b>: {i.body} </span>)}</p>;
  }
  return (
    <div className="ai-how">
      <p className="ai-line"><b>{AI_NIGHTLY}</b> No AI model runs in the payment path: checkout reads {TABLE_NAME}, and falls back to the store default if it doesn't answer in time.</p>
      <div className="ai-grid">
        {items.map((i) => <div key={i.name} className="fcard"><h6>{i.name}</h6><p>{i.body}</p></div>)}
      </div>
    </div>
  );
}
