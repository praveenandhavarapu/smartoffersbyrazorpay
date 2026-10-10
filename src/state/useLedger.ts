import { useMemo } from 'react';
import { ledgerView } from '../data/ledgerQueries';
import { useStore } from './store';

/** The six-month ledger as of the demo date (plus any instant settlements the merchant made). */
export function useLedger() {
  const moment = useStore((s) => s.moment);
  const instant = useStore((s) => s.instantSettlements);
  return useMemo(() => ledgerView(moment, instant), [moment, instant]);
}
