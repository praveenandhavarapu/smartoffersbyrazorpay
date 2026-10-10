import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../state/store';
import { useChat } from '../../ray/chatStore';
import { useRay } from '../../ray/useRay';
import { useDemo } from './demoStore';
import { Pause, Play } from './Icons';

type Step = { route: string; caption: string; run?: () => void | Promise<void> };
const STEP_MS = 6000;
const scrollTo = (sel: string) => setTimeout(() => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);

/**
 * Scripted ~90 s walkthrough of the dashboard for the video. Ray uses scripted (Demo) answers while it
 * plays so the video is repeatable; the merchant's own Live/Demo choice is restored on close.
 * Back replays state from the start so every step is consistent.
 */
export function DemoPlayer() {
  const nav = useNavigate();
  const ask = useRay();
  const { open, playing, step, setStep, setPlaying, close, setShopper, openOverride, closeOverride } = useDemo();
  const savedMode = useRef<'live' | 'demo' | null>(null);

  const steps: Step[] = useMemo(() => [
    { route: '/', caption: 'The payments dashboard: six months of collections, settlements, and a Ray insight about last month\'s coupon' },
    { route: '/ray', caption: 'Ask Ray: "How are my offers and coupons doing?"', run: () => { useChat.getState().clear(); return ask('How are my offers and coupons doing?'); } },
    { route: '/ray', caption: 'Ray offers to fix it. Setup is four quick questions', run: () => ask('Set up Smart Offers') },
    { route: '/ray', caption: 'Monthly offer budget', run: () => ask('₹1,00,000') },
    { route: '/ray', caption: 'What the merchant keeps from a ₹1,000 sale (sets the break-even)', run: () => ask('₹400') },
    { route: '/ray', caption: 'Goal and rules → the plan: an offer, or none, per shopper group, chosen for profit', run: async () => { await ask('Most profit'); await ask('Yes'); scrollTo('#plan-card'); } },
    { route: '/ray', caption: 'Approve & go live: only a human click spends money', run: () => { useStore.getState().approve(); scrollTo('.ok-card'); } },
    { route: '/offers/smart?tab=checkout', caption: '20 days later. Priya, new from an Instagram ad, sees her group\'s offer at checkout', run: () => { useStore.getState().jump20(); setShopper('priya'); } },
    { route: '/offers/smart?tab=checkout', caption: 'Neha, a returning buyer, sees no offer: she buys anyway', run: () => setShopper('neha') },
    { route: '/offers/smart', caption: 'Results against the 10% holdout, with honest ranges and "still learning"' },
    { route: '/offers/smart', caption: 'Override: give returning buyers ₹100 off. The cost shows before you apply', run: () => openOverride('returning', 'flat_100') },
    { route: '/offers/smart', caption: 'Cancel. Ray states the cost once and never nags', run: () => closeOverride() },
    { route: '/studio/smart-offers?tab=runs', caption: 'Agent Studio: the Smart Offers Agent runs every day at 06:00 within budget' },
    { route: '/studio/smart-offers?tab=transactions', caption: 'Every checkout it decided, with the group, holdout arm and offer' },
    { route: '/studio/smart-offers', caption: 'Kill switch: every group to no offer, instantly, logged', run: () => useStore.getState().kill() },
    { route: '/studio/smart-offers?tab=activity', caption: 'Resume. Every action is in the activity log', run: () => useStore.getState().resume() },
  ], [ask, setShopper, openOverride, closeOverride]);

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
  }, [steps, nav, setStep, closeOverride]);

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
