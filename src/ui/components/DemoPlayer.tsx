import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../state/store';
import { useChat } from '../../ray/chatStore';
import { useRay } from '../../ray/useRay';
import { useDemo } from './demoStore';
import { Pause, Play } from './Icons';
import { DEFAULT_KEEP_PER_1000 } from '../../engine/net';

type Step = { route: string; caption: string; run?: () => void | Promise<void> };
const STEP_MS = 5800; // 15 steps ≈ 87 s
const scrollTo = (sel: string) => setTimeout(() => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);

/**
 * Scripted ~90 s walkthrough of the dashboard for the video. Ray uses scripted (Demo) answers while it
 * plays so the video is repeatable; the merchant's own Live/Demo choice is restored on close.
 * Back replays state from the start so every step is consistent.
 */
export function DemoPlayer() {
  const nav = useNavigate();
  const ask = useRay();
  const { open, playing, step, setStep, setPlaying, close, setShopper, closeOverride } = useDemo();
  const savedMode = useRef<'live' | 'demo' | null>(null);

  const steps: Step[] = useMemo(() => [
    { route: '/', caption: 'The payments dashboard. Ray has spotted something: see the insight and the bell' },
    { route: '/ray', caption: 'Ask Ray "Anything I should fix?": the signals behind it, each against a threshold', run: () => { useChat.getState().clear(); return ask('Anything I should fix?'); } },
    { route: '/ray', caption: 'Why AI, not a rule: same shoppers, three options, and what a rule can\'t do', run: () => ask('Why AI, not a simple rule?') },
    { route: '/ray', caption: 'Set up Smart Offers: four quick questions', run: () => ask('Set up Smart Offers') },
    { route: '/ray', caption: 'Monthly budget, and what the merchant keeps from a ₹1,000 sale', run: async () => { await ask('₹1,00,000'); await ask(`₹${DEFAULT_KEEP_PER_1000}`); } },
    { route: '/ray', caption: 'Goal and rules → the plan: an offer or none per group, chosen for profit; the holdout\'s cost shown up front', run: async () => { await ask('Most profit'); await ask('Yes'); scrollTo('#plan-card'); } },
    { route: '/ray', caption: 'Approve & go live: only a human click spends money', run: () => { useStore.getState().approve(); scrollTo('.ok-card'); } },
    { route: '/offers/smart?tab=checkout', caption: '20 days later. Priya, new from an Instagram ad, sees her group\'s offer', run: () => { useStore.getState().jump20(); setShopper('priya'); } },
    { route: '/offers/smart?tab=checkout', caption: 'Neha, a returning buyer, sees no offer: she buys anyway', run: () => setShopper('neha') },
    { route: '/offers/smart', caption: 'Proof against the 10% holdout, and the estimates made before launch vs what was measured', run: () => scrollTo('.dtable.compact') },
    { route: '/studio/smart-offers?tab=reviews', caption: 'Every Monday, a review: what\'s proven, what\'s still learning, what to change' },
    { route: '/studio/smart-offers?tab=reviews', caption: 'The merchant approves the creator-code fix in one tap. Logged.', run: () => { useStore.getState().setCreatorFix('limited'); useStore.getState().decideReview('w2-creator', 'approved', 'MEERA15: limit to first orders'); } },
    { route: '/offers/smart', caption: 'Day 30: the pilot ends. Proven results and the fee, then the merchant decides', run: () => { useStore.getState().jump30(); scrollTo('.decision'); } },
    { route: '/offers/smart', caption: 'Keep Smart Offers: billed 1% of proven extra sales only', run: () => { const p = useStore.getState(); p.decidePilot('keep', 'Kept Smart Offers after the pilot'); scrollTo('.decision'); } },
    { route: '/studio/smart-offers?tab=impact', caption: 'Impact: one north-star metric, the outcomes behind it, and the guardrails that must not get worse' },
  ], [ask, setShopper]);

  const goTo = useCallback(async (target: number, replay: boolean) => {
    const t = Math.max(0, Math.min(steps.length - 1, target));
    if (replay) {
      useStore.getState().reset();
      useStore.getState().setRayMode('demo');
      useChat.getState().clear();
      closeOverride();
      for (let i = 0; i < t; i++) { nav(steps[i].route); await steps[i].run?.(); }
    }
    nav(steps[t].route);
    setStep(t);
    await steps[t].run?.();
  }, [steps, nav, setStep, closeOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && step === 0) {
      savedMode.current = useStore.getState().rayMode;
      void goTo(0, true);
    }
    if (!open && savedMode.current) { useStore.getState().setRayMode(savedMode.current); savedMode.current = null; }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
