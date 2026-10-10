import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadModel, type Model } from './model';
import { derive, type Derived } from './derived';
import { useStore } from './store';

type Ctx = { model: Model; derived: Derived };
const ModelCtx = createContext<Ctx | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    loadModel().then((m) => alive && setModel(m)).catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [attempt]);
  const settings = useStore((s) => s.settings);
  const approved = useStore((s) => s.approved);
  const approvedSettings = useStore((s) => s.approvedSettings);
  const overrides = useStore((s) => s.overrides);
  const killed = useStore((s) => s.killed);
  const derived = useMemo(
    () => (model ? derive(model, { settings, approved, approvedSettings, overrides, killed }) : null),
    [model, settings, approved, approvedSettings, overrides, killed],
  );
  if (error) {
    return (
      <div className="state-box" role="alert">
        <b>Couldn't load the demo data.</b>
        <p className="muted small">{error}</p>
        <button className="btn secondary" onClick={() => { setError(null); setAttempt((a) => a + 1); }}>Try again</button>
      </div>
    );
  }
  if (!model || !derived) {
    return <div className="state-box" aria-busy="true"><span className="spinner" /> Loading Alpha Apparel's synthetic data…</div>;
  }
  return <ModelCtx.Provider value={{ model, derived }}>{children}</ModelCtx.Provider>;
}

export function useModel(): Ctx {
  const c = useContext(ModelCtx);
  if (!c) throw new Error('useModel outside ModelProvider');
  return c;
}
