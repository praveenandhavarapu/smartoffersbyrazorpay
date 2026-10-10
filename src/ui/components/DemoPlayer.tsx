import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../state/store';
import { useChat } from '../../ray/chatStore';
import { useRay } from '../../ray/useRay';
import { MERCHANT_SENTENCE } from '../screens/RayPlan';
import { useDemo } from './demoStore';
import { Pause, Play } from './Icons';

type Step = { route: string; caption: string; run?: () => void | Promise<void> };
const STEP_MS = 6000;
const scrollTo = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);

/** Scripted ~80 s walkthrough for the video. Back/Next replay state from the start so every step is consistent. */
export function DemoPlayer() {
  const nav = useNavigate();
  const ask = useRay();
  const { open, playing, step, setStep, setPlaying, close, setShopper, openOverride, closeOverride } = useDemo();

  const steps: Step[] = useMemo(() => [
    { route: '/', caption: "Ray's home: the insight card shows what last month's welcome code really cost" },
    { route: '/ray', caption: 'Fix with Smart Offers', run: () => useChat.getState().clear() },
    { route: '/ray', caption: "The merchant tells Ray the budget, what they keep from a sale, the goal and a rule", run: () => ask(MERCHANT_SENTENCE) },
    { route: '/ray', caption: 'The setup card holds those answers; change any field and the plan recalculates', run: () => scrollTo('setup-card') },
    { route: '/ray', caption: 'The plan card: an offer, or none, per shopper group, chosen for profit within budget', run: () => scrollTo('plan-card') },
    { route: '/ray', caption: 'Approve & go live: only a human click spends money', run: () => { useStore.getState().approve(); scrollTo('plan-card'); } },
    { route: '/checkout', caption: '20 days later. Priya, new from an Instagram ad, sees her group\'s offer', run: () => { useStore.getState().jump20(); setShopper('priya'); } },
    { route: '/checkout', caption: 'Neha, a returning buyer, sees no offer: she buys anyway', run: () => setShopper('neha') },
    { route: '/results', caption: 'Results: measured against the 10% holdout, with honest ranges and "still learning"' },
    { route: '/results', caption: 'Override: give returning buyers ₹100 off. The drawer shows the cost first', run: () => openOverride('returning', 'flat_100') },
    { route: '/results', caption: 'Cancel. Ray states the cost once and never nags', run: () => closeOverride() },
    { route: '/results', caption: 'Kill switch: every group to no offer, instantly, logged', run: () => useStore.getState().kill() },
    { route: '/results', caption: 'Resume. Every action is in the audit log', run: () => useStore.getState().resume() },
  ], [ask, setShopper, openOverride, closeOverride]);

  const goTo = useCallback(async (target: number, replay: boolean) => {
    const t = Math.max(0, Math.min(steps.length - 1, target));
    if (replay) {
      useStore.getState().reset();
      useChat.getState().clear();
      closeOverride();
      for (let i = 0; i < t; i++) await steps[i].run?.();
    }
    nav(steps[t].route);
    setStep(t);
    await steps[t].run?.();
  }, [steps, nav, setStep, closeOverride]);

  // Start from a clean slate.
  useEffect(() => { if (open && step === 0) void goTo(0, true); /* eslint-disable-line */ }, [open]);

  useEffect(() => {
    if (!open || !playing) return;
    const id = setTimeout(() => {
      if (step >= steps.length - 1) setPlaying(false);
      else void goTo(step + 1, false);
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [open, playing, step, steps.length, goTo, setPlaying]);

  if (!open) return null;
  return (
    <div className="demo-bar" role="region" aria-label="Demo player">
      <div className="demo-cap"><span className="mono-tag">Step {step + 1} / {steps.length}</span> {steps[step].caption}</div>
      <div className="demo-ctl">
        <button className="btn secondary sm" onClick={() => void goTo(step - 1, true)} disabled={step === 0}>Back</button>
        <button className="btn secondary sm" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause width={14} /> : <Play width={14} />}{playing ? 'Pause' : 'Play'}</button>
        <button className="btn primary sm" onClick={() => void goTo(step + 1, false)} disabled={step === steps.length - 1}>Next</button>
        <button className="btn ghost sm" onClick={close}>Close</button>
      </div>
      <div className="demo-prog"><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
    </div>
  );
}
