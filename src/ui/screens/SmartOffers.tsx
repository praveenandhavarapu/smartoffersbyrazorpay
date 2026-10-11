import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../state/store';
import { useChat } from '../../ray/chatStore';
import { Results } from './Results';
import { Checkout } from './Checkout';
import { PlanCard } from '../components/PlanCard';
import { SetupCard } from '../components/SetupCard';
import { ApprovedCard, WasteCard, CreatorsCard } from '../components/RayCards';
import { OpportunityPanel, StopButton, WhyAI } from '../components/lifecycle';
import { PageHeader, Tabs } from '../components/kit';
import { Clover } from '../components/Icons';
import { FEATURES } from '../../config/features';
import { PlaybookCard } from '../components/Playbook';
import { RecommendCard } from '../components/Recommend';
import { TradeoffCard } from '../components/Tradeoffs';

type Tab = 'overview' | 'plan' | 'checkout' | 'creators';

export function SmartOffers() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const approved = useStore((s) => s.approved);
  const queue = useChat((s) => s.queue);
  const tab = (sp.get('tab') as Tab) ?? (approved ? 'overview' : 'overview');
  const setTab = (t: Tab) => setSp({ tab: t });
  const askRay = (q: string) => { queue(q); nav('/ray'); };
  const focus = sp.get('focus');
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => document.getElementById(focus)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => clearTimeout(t);
  }, [focus, tab]);
  return (
    <div className="page wide">
      <PageHeader title="Smart Offers" sub="An offer, or none, for each shopper group, chosen for profit within your budget and proven against a 10% holdout." actions={
        <>
          <button className="btn secondary" onClick={() => askRay(approved ? 'How are the results so far?' : 'Set up Smart Offers')}><Clover width={14} style={{ color: 'var(--clover)' }} /> {approved ? 'Ask Ray' : 'Set up with Ray'}</button>
          <button className="btn secondary" onClick={() => nav('/studio/smart-offers?tab=reviews')}>Weekly reviews</button>
          <StopButton />
        </>
      } />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'overview', label: approved ? 'Results' : 'Overview' }, { id: 'plan', label: 'Setup & plan' }, { id: 'checkout', label: 'Checkout preview' }, { id: 'creators', label: 'Creator codes' }]} />
      {tab === 'overview' && (approved ? <Results /> : (
        <div className="narrow stack-gap">
          <WasteCard onFix={() => setTab('plan')} />
          <OpportunityPanel />
          <WhyAI />
          <div className="card pad hint-row"><span>Prefer a conversation? Ray asks four questions and builds the same plan.</span><button className="btn primary sm" onClick={() => askRay('Set up Smart Offers')}>Set up with Ray</button></div>
        </div>
      ))}
      {tab === 'plan' && <div className="narrow stack-gap"><SetupCard /><PlanCard onAsk={askRay} />{approved && <ApprovedCard />}<RecommendCard /><TradeoffCard />{FEATURES.playbook && <PlaybookCard />}<WhyAI /></div>}
      {tab === 'checkout' && <Checkout />}
      {tab === 'creators' && <div className="narrow"><CreatorsCard /></div>}
    </div>
  );
}
