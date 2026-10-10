import { Home } from './ui/screens/Home';
import { RayPlan } from './ui/screens/RayPlan';
import { Checkout } from './ui/screens/Checkout';
import { Results } from './ui/screens/Results';
import { Studio } from './ui/screens/Studio';
import { Settings } from './ui/screens/Settings';

export const ROUTES = [
  { path: '/', element: <Home /> },
  { path: '/ray', element: <RayPlan /> },
  { path: '/checkout', element: <Checkout /> },
  { path: '/results', element: <Results /> },
  { path: '/studio', element: <Studio /> },
  { path: '/settings', element: <Settings /> },
];
