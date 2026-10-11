import { useLocation } from 'react-router-dom';
import { Home } from './ui/screens/Home';
import { RayChat } from './ui/screens/RayChat';
import { Transactions } from './ui/screens/Transactions';
import { Settlements } from './ui/screens/Settlements';
import { Reports } from './ui/screens/Reports';
import { Offers } from './ui/screens/Offers';
import { SmartOffers } from './ui/screens/SmartOffers';
import { Studio } from './ui/screens/Studio';
import { StudioAgent } from './ui/screens/StudioAgent';
import { Settings } from './ui/screens/Settings';
import { Banking, Payroll, ProductPage } from './ui/screens/Simple';
import { About } from './ui/screens/About';

/** Remount on query change so deep links (search, ?tab=) reset the page state. */
function Keyed({ children }: { children: (k: string) => JSX.Element }) {
  const { search } = useLocation();
  return children(search);
}

export const ROUTES = [
  { path: '/', element: <Home />, shell: 'payments' },
  { path: '/transactions', element: <Keyed>{(k) => <Transactions key={k} />}</Keyed>, shell: 'payments' },
  { path: '/settlements', element: <Settlements />, shell: 'payments' },
  { path: '/reports', element: <Reports />, shell: 'payments' },
  { path: '/offers', element: <Offers />, shell: 'payments' },
  { path: '/offers/smart', element: <SmartOffers />, shell: 'payments' },
  { path: '/products/:slug', element: <ProductPage />, shell: 'payments' },
  { path: '/settings', element: <Settings />, shell: 'payments' },
  { path: '/ray', element: <RayChat />, shell: 'ray' },
  { path: '/studio', element: <Studio />, shell: 'studio' },
  { path: '/studio/smart-offers', element: <StudioAgent />, shell: 'studio' },
  { path: '/banking', element: <Banking />, shell: 'plain' },
  { path: '/payroll', element: <Payroll />, shell: 'plain' },
  { path: '/about', element: <About />, shell: 'plain' },
] as const;
