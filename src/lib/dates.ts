/** Demo clock. Dates are fixed: the demo never reads the real clock. */
import profile from '../../fixtures/alpha_profile.json';

export type Moment = 'before' | 'day20' | 'day30' | 'day60';

export const DEMO_DATES: Record<Moment, string> = {
  before: profile.demo_clock.before_approval,
  day20: profile.demo_clock.results_day_20,
  day30: '2026-10-20', // pilot day 30: the pilot decision
  day60: profile.demo_clock.results_day_60,
};

/** Pilot day N falls on pilot start + N − 1 days (day 1 = Mon 21 Sep 2026). */
export const PILOT_START = profile.pilot.start;
export const pilotDayDate = (n: number): string => addDays(PILOT_START, n - 1);
export const PILOT_LENGTH = profile.pilot.length_days;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-21" -> "21 Sep 2026" */
export function fmtDate(iso: string, withYear = true): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

export const toUnix = (iso: string): number => Math.floor(Date.parse(iso + 'T00:00:00+05:30') / 1000);

export type DateRange = { from: string; to: string };

export const BASELINE: DateRange = { from: '2026-08-22', to: '2026-09-20' };
export const PILOT_DAY20: DateRange = { from: '2026-09-21', to: '2026-10-10' };

export function momentLabel(m: Moment): string {
  if (m === 'before') return `${fmtDate(DEMO_DATES.before)} · before approval`;
  if (m === 'day20') return `${fmtDate(DEMO_DATES.day20)} · pilot day 20`;
  if (m === 'day30') return `${fmtDate(DEMO_DATES.day30)} · pilot day 30`;
  return `${fmtDate(DEMO_DATES.day60)} · pilot day 60`;
}
