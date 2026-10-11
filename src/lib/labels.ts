/** Human labels for engine enums (goals, offers, groups). Used in logs, diffs and Ray text. */
import { fixtureGroupStats, OFFER_BY_ID } from '../data/fixtures';
import type { Goal, GroupId, OfferId } from '../data/types';

export const GOAL_LABEL: Record<Goal, string> = { most_profit: 'Most profit', new_customers: 'Most new customers', orders_steady: 'Keep orders steady' };

const shorten = (label: string): string => label.replace('from Instagram/Meta ads', 'ads').replace('from a creator link (no code typed)', 'creator link').replace('ordered in the last 120 days', '≤120 days').replace('last order 120+ days ago', '120+ days').replace('cart ', '');
const GROUP_LABELS = Object.fromEntries(fixtureGroupStats().map((g) => [g.id, shorten(g.label)])) as Record<GroupId, string>;

export const groupLabel = (g: GroupId): string => GROUP_LABELS[g] ?? g;
export const offerLabel = (o: OfferId): string => OFFER_BY_ID[o]?.label ?? o;

const TOKENS: [RegExp, string][] = [
  ...(Object.keys(GOAL_LABEL) as Goal[]).map((k) => [new RegExp(`\\b${k}\\b`, 'g'), GOAL_LABEL[k]] as [RegExp, string]),
  ...(Object.keys(GROUP_LABELS) as GroupId[]).map((k) => [new RegExp(`\\b${k}\\b`, 'g'), GROUP_LABELS[k]] as [RegExp, string]),
  ...(['free_shipping', 'flat_100', 'flat_200'] as OfferId[]).map((k) => [new RegExp(`\\b${k}\\b`, 'g'), OFFER_BY_ID[k].label] as [RegExp, string]),
];

/** Replace raw enums in free text ("orders_steady" -> "Keep orders steady", "free_shipping" -> "Free shipping"). */
export function humanise(text: string | undefined): string | undefined {
  if (!text) return text;
  if (text === 'none') return OFFER_BY_ID.none.label;
  let out = text;
  for (const [re, label] of TOKENS) out = out.replace(re, label);
  return out.replace(/(Free shipping|₹\d+ off|No offer)\/(?=Free shipping|₹\d+ off|No offer)/g, '$1, ');
}
