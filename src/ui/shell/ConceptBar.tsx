import { Link } from 'react-router-dom';
import { useStore } from '../../state/store';
import { useDemo } from '../components/demoStore';
import { momentLabel } from '../../lib/dates';
import { CONCEPT_LABEL } from '../components/bits';

export function ConceptBar() {
  const moment = useStore((s) => s.moment);
  const reset = useStore((s) => s.reset);
  const start = useDemo((s) => s.start);
  const open = useDemo((s) => s.open);
  return (
    <footer className="concept-bar">
      <span className="cb-label">{CONCEPT_LABEL}</span>
      <Link to="/about" className="cb-btn">About this concept</Link>
      <span className="cb-clock" title="The demo runs on fixed dates">Demo date: {momentLabel(moment)}</span>
      {!open && <button className="cb-btn primary" onClick={start}>▶ Play demo</button>}
      <button className="cb-btn" onClick={() => { if (confirm('Reset the demo? This clears approvals, overrides, settings and the audit log.')) reset(); }}>Reset</button>
    </footer>
  );
}
