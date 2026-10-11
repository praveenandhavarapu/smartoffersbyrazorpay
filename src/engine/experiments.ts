/** Proposed next experiments (expansion). Sizes come from the store's own numbers; the effects are hypotheses to test. */
export type Experiment = { id: string; title: string; why: string; design: string; metric: string; size: string };

export function proposeExperiments(opts: { ordersPerMonth: number; codShare: number; rtoRate: number; checkoutsPerMonth: number; creatorLeakCode: string | null }): Experiment[] {
  const cod = Math.round(opts.ordersPerMonth * opts.codShare);
  const rto = Math.round(cod * opts.rtoRate);
  const abandoned = Math.round(opts.checkoutsPerMonth - opts.ordersPerMonth);
  const out: Experiment[] = [
    { id: 'cod_prepaid', title: 'Nudge cash-on-delivery buyers to prepay', why: `About ${cod.toLocaleString('en-IN')} COD orders a month, of which about ${rto.toLocaleString('en-IN')} fail delivery.`, design: 'Small prepaid discount only for groups where COD failure is high; 10% holdout; 2 weeks.', metric: 'Failed deliveries avoided × cost per failed delivery − discount spend', size: `${rto.toLocaleString('en-IN')} failed deliveries a month` },
    { id: 'abandon_handoff', title: 'Use Smart Offers in cart-abandonment reminders', why: `About ${abandoned.toLocaleString('en-IN')} checkouts a month don't complete.`, design: 'Cart Abandonment agent sends the group\'s offer (or none) in its reminder; holdout gets the reminder without the offer.', metric: 'Recovered orders vs holdout, profit after discount', size: `${abandoned.toLocaleString('en-IN')} abandoned checkouts a month` },
    { id: 'freeship_threshold', title: 'Test a lower free-shipping threshold for small carts', why: 'Free shipping is the winning offer for small ad carts; a threshold might do the same job for less.', design: 'Threshold variant vs current free-shipping offer for new ad shoppers under ₹1,500; 2 weeks.', metric: 'Extra profit per checkout vs current offer', size: 'New ad shoppers with carts under ₹1,500' },
  ];
  if (opts.creatorLeakCode) out.push({ id: 'creator_first_order', title: `Creator codes for first orders only (starting with ${opts.creatorLeakCode})`, why: 'Most leakage is one code used by returning buyers.', design: 'Limit the code to first orders; watch creator-attributed new customers for 2 weeks.', metric: 'Discount saved − lost first orders', size: 'Creator-code orders by returning buyers' });
  return out;
}
