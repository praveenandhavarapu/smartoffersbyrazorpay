/** Tool schemas shared by the browser and the Netlify function. No imports on purpose. */
const GROUPS = ['new_ads_small', 'new_ads_big', 'new_creator', 'new_organic', 'returning', 'lapsed'];
const OFFERS = ['none', 'free_shipping', 'flat_100', 'flat_200'];

const DAYS = { type: 'number', description: 'Look-back window in days ending today (1 = today, 7 = last 7 days, up to 183 = six months). Default 7.' };

export const TOOL_SCHEMAS = [
  { name: 'get_payments_summary', description: 'Online payments collected in a window: captured count and amount, success rate, failed payments, refunds, fees + GST, method mix (UPI/card/netbanking/wallet). Amounts in rupees.', input_schema: { type: 'object', properties: { days: DAYS }, required: [] } },
  { name: 'get_daily_payments', description: 'Day-by-day (DoD) captured payments for the last N days: amount collected, payment count, failed payments and refunds per day. Use for daily trends or graphs; the UI draws the chart.', input_schema: { type: 'object', properties: { days: { type: 'number', description: 'Number of days ending today (2 to 60). Default 10.' } }, required: [] } },
  { name: 'list_payments', description: 'Most recent payments (max 10), optionally filtered by status or method. Contacts are masked.', input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['captured', 'failed', 'refunded'] }, method: { type: 'string', enum: ['upi', 'card', 'netbanking', 'wallet'] }, limit: { type: 'number' } }, required: [] } },
  { name: 'get_settlements', description: 'Settlements in a window (amount paid to the bank after fees, GST and refunds), the next scheduled settlement, the schedule (T+1 or instant) and any balance available for instant settlement.', input_schema: { type: 'object', properties: { days: DAYS }, required: [] } },
  { name: 'get_refunds_and_disputes', description: 'Refunds processed and disputes (open, under review, won, lost) in a window.', input_schema: { type: 'object', properties: { days: DAYS }, required: [] } },
  { name: 'get_store_summary', description: "Store KPIs for last month (22 Aug – 20 Sep 2026): checkouts, orders, sales, AOV, discounts.", input_schema: { type: 'object', properties: { period: { type: 'string', enum: ['last_month'] } }, required: [] } },
  { name: 'get_offer_waste', description: "Economics of today's coupon codes by shopper group (spend, extra sales, return, profit).", input_schema: { type: 'object', properties: { code: { type: 'string', description: 'ALPHA10 (default) or ALL' } }, required: [] } },
  { name: 'simulate_plan', description: 'Run the decision engine with these settings. Returns per-group offers, totals, orders change and deltas. Read-only.', input_schema: { type: 'object', properties: { budget: { type: 'number' }, margin_pct: { type: 'number' }, goal: { type: 'string', enum: ['most_profit', 'new_customers', 'orders_steady'] }, orders_floor_pct: { type: 'number' }, floor_return: { type: 'number' }, allowed_offers: { type: 'array', items: { type: 'string', enum: OFFERS } } }, required: [] } },
  { name: 'get_current_plan', description: 'The approved plan (or the draft if nothing is approved yet), with ranges.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'draft_plan_change', description: 'Draft a change (override a group\'s offer). Returns its monthly cost. Never applies it: the merchant must click Approve.', input_schema: { type: 'object', properties: { group_id: { type: 'string', enum: GROUPS }, offer_id: { type: 'string', enum: OFFERS } }, required: ['group_id', 'offer_id'] } },
  { name: 'explain_group', description: 'Engine explanation of why a group gets its offer.', input_schema: { type: 'object', properties: { group_id: { type: 'string', enum: GROUPS } }, required: ['group_id'] } },
  { name: 'explain_shopper', description: 'What a sample shopper sees at checkout and why.', input_schema: { type: 'object', properties: { example_id: { type: 'string', enum: ['priya', 'rohan', 'aisha', 'kavya', 'neha', 'vikram', 'sameer'] } }, required: ['example_id'] } },
  { name: 'get_results', description: 'Measured pilot results vs the 10% holdout, with 90% ranges.', input_schema: { type: 'object', properties: { snapshot: { type: 'string', enum: ['day20', 'day60'] } }, required: [] } },
  { name: 'get_creator_code_report', description: 'Creator codes: uses, returning-buyer share, leakage and suggested fix.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'get_peer_benchmark', description: 'Pooled aggregates from similar stores (pool size, median, 25th–75th percentile). Never single merchants.', input_schema: { type: 'object', properties: { group_id: { type: 'string', enum: GROUPS }, offer_id: { type: 'string', enum: OFFERS } }, required: ['group_id', 'offer_id'] } },
  { name: 'request_pause', description: 'Draft a pause (all offers or one group). The merchant must confirm in the UI.', input_schema: { type: 'object', properties: { scope: { type: 'string', description: "'all' or a group id" } }, required: ['scope'] } },
] as const;

export type ToolName = (typeof TOOL_SCHEMAS)[number]['name'];
export const MAX_TOOL_ROUNDS = 4;
export const MAX_OUTPUT_TOKENS = 1024;
