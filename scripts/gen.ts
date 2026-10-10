/** npm run gen: write the seeded synthetic data to generated/ for inspection (gitignored). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateAlpha } from '../src/data/generator/alpha';
import { generateNetwork } from '../src/data/generator/network';
import { aggregate } from '../src/data/aggregate';

mkdirSync('generated', { recursive: true });
const a = generateAlpha();
const w = (f: string, d: unknown) => writeFileSync(`generated/${f}`, JSON.stringify(d, null, 1));
w('alpha_baseline_sessions.json', a.baseline);
w('alpha_pilot_day20_sessions.json', a.pilot20);
w('alpha_orders.json', a.orders);
w('alpha_payments.json', a.payments);
w('aggregates.json', { baseline: aggregate(a.baseline), pilot20: aggregate(a.pilot20) });
w('network_merchants.json', generateNetwork());
console.log(`baseline ${a.baseline.length} sessions, pilot ${a.pilot20.length}, orders ${a.orders.length}, payments ${a.payments.length}, network ${generateNetwork().length}`);
