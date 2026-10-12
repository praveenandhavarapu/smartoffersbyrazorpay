/** Message parsing shared by demo-mode routing, follow-ups and guided setup (no numbers invented here). */
import type { GroupId, OfferId } from '../data/types';

/** Lower-case, collapse spaces, fix common typos and Hinglish so the same intent rules catch them. */
export function normalize(message: string): string {
  let t = message.toLowerCase().replace(/\s+/g, ' ').trim();
  const FIX: [RegExp, string][] = [
    [/\b(pymnts?|paymnts?|payemnts?|paymnet?s?)\b/g, 'payments'], [/\blst\b/g, 'last'], [/\b(setl+ements?|settelments?|setelments?)\b/g, 'settlements'],
    [/\brefnds?\b/g, 'refunds'], [/\b(cupons?|coupns?|cuopons?)\b/g, 'coupons'], [/\bmargn\b/g, 'margin'], [/\bbudgt\b/g, 'budget'],
    [/\s?\bper ?cent\b/g, '%'], [/\bkitna\b/g, 'how much'], [/\bcollect hua\b/g, 'collected'], [/\baaj\b/g, 'today'],
    [/\bkab (aayega|aaega|milega|aayegi|milegi)\b/g, 'when is my next'], [/\bthx\b|\bty\b/g, 'thanks'], [/\bpls\b|\bplz\b/g, 'please'],
  ];
  for (const [re, to] of FIX) t = t.replace(re, to);
  return t;
}

/** "last 5 days", "this week", "last month", "6 months" -> days (ending today). */
export function parseDays(t: string, today: Date): number | null {
  const n = t.match(/\b(?:last|past|previous)?\s*(\d{1,3})\s*days?\b/);
  if (n) return Number(n[1]);
  const m = t.match(/\b(\d{1,2}|six|three|two)\s*months?\b/);
  if (m) return Math.round((m[1] === 'six' ? 6 : m[1] === 'three' ? 3 : m[1] === 'two' ? 2 : Number(m[1])) * 30.5);
  if (/\btoday\b/.test(t)) return 1;
  if (/\byesterday\b/.test(t)) return 2;
  if (/\b(this|last|past) week\b/.test(t)) return 7;
  if (/\bthis month\b/.test(t)) return today.getUTCDate();
  if (/\b(last|past|previous) month\b|\b30 days\b/.test(t)) return 30;
  if (/\bquarter\b/.test(t)) return 91;
  if (/\b(half|six)[- ]year|\ball time\b/.test(t)) return 183;
  return null;
}

/** "₹50,000", "50k", "1 lakh", "1.5L" -> rupees */
export function parseAmount(t: string): number | null {
  const m = t.match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lac|lakhs)?\b/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  const u = (m[2] ?? '').toLowerCase();
  return u === 'k' || u === 'thousand' ? v * 1000 : u.startsWith('l') ? v * 100000 : v;
}

const GROUP_WORDS: [RegExp, GroupId][] = [
  [/\b(returning|repeat|loyal|existing)\b/, 'returning'],
  [/\blapsed\b|\bwin[- ]?back\b|\bdormant\b/, 'lapsed'],
  [/\borganic\b|\bdirect\b|\bsearch\b/, 'new_organic'],
  [/\bcreator\b|\binfluencer\b/, 'new_creator'],
  [/\bbig (cart|basket)s?\b|\b(1,?500|1\.5k)\+/, 'new_ads_big'],
  [/\b(ads?|instagram|meta|facebook|paid)\b/, 'new_ads_small'],
];

export function groupIn(t: string): GroupId | null {
  for (const [re, g] of GROUP_WORDS) if (re.test(t)) return g;
  return null;
}

/** Words a merchant would use for a group ("returning customers"). */
export const GROUP_WORD: Record<GroupId, string> = {
  returning: 'returning customers', lapsed: 'lapsed shoppers', new_organic: 'organic shoppers', new_creator: 'creator shoppers', new_ads_big: 'big carts', new_ads_small: 'small-cart ad shoppers',
};

/** First offer mentioned (playbook variants before their standard versions). */
export function offerIn(t: string): OfferId | null {
  return offersIn(t)[0] ?? (/\bno offer\b|\bnothing\b|\bstop offers? for\b/.test(t) ? 'none' : null);
}

/** Every offer mentioned, in a stable order. */
export function offersIn(t: string): OfferId[] {
  const out: OfferId[] = [];
  const prepaid = /\bprepaid\b/.test(t) && /free (shipping|delivery)|shipping/.test(t);
  const s999 = /\b999\b/.test(t) && /free (shipping|delivery)|shipping|999\+/.test(t);
  if (prepaid) out.push('free_shipping_prepaid');
  if (s999) out.push('free_shipping_999');
  if (!prepaid && !s999 && /free shipping|free delivery/.test(t)) out.push('free_shipping');
  if (/(₹|rs\.?\s?|inr\s?)\s?150\b|\b150( rupees)? off/.test(t)) out.push('flat_150');
  if (/(₹|rs\.?\s?|inr\s?)\s?200\b|\b200( rupees)? off/.test(t)) out.push('flat_200');
  if (/(₹|rs\.?\s?|inr\s?)\s?100\b|\b100( rupees)? off/.test(t)) out.push('flat_100');
  return out;
}

export const AFFIRM = /^(?:(?:ok|okay|yes|yeah|sure|great|fine|alright)[,!.]? )?(yes|yes please|yeah|yep|yup|sure|ok|okay|ok sure|go ahead|go ahead please|please go ahead|do it|please do|please|sounds good|let'?s do (it|that)|go with (it|that)|go for it|draft (it|that)|use (it|that)|apply (it|that)|set it|do that|ok do it|yes do it|show me|haan|ha|ji|haan ji)\b[.! ]*$/;
/** "approve it", "ok approve", "confirm": Ray can't approve; the merchant's click does. */
export const APPROVE_WORDS = /^(?:(?:ok|okay|yes|yeah|sure)[,!.]? )?(approve|confirm|go live|apply|make it live)( it| this| that| the draft| the plan| now)?[.! ]*$/;
export const NEGATE = /^(no|no thanks|no thank you|nope|not now|nah|leave it|skip|cancel that|never ?mind)\b[.! ]*$/;
