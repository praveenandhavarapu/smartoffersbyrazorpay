import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ROUTES } from './routes';
import { TopBar } from './ui/shell/TopBar';
import { Sidebar } from './ui/shell/Sidebar';
import { ConceptBar } from './ui/shell/ConceptBar';
import { DemoPlayer } from './ui/components/DemoPlayer';
import { ModelProvider } from './state/ModelContext';
import { useChat } from './ray/chatStore';
import { checkHealth } from './ray/liveClient';

function NotFound() {
  return <div className="state-box"><b>Page not found.</b><Link to="/" className="btn secondary">Go to Home</Link></div>;
}

export default function App() {
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const setHealth = useChat((s) => s.setHealth);
  useEffect(() => { if (!/jsdom/.test(navigator.userAgent)) window.scrollTo(0, 0); setMenu(false); }, [pathname]);
  useEffect(() => { void checkHealth().then(setHealth); }, [setHealth]);
  const route = ROUTES.find((r) => (r.path.includes(':') ? pathname.startsWith(r.path.split(':')[0]) : r.path === pathname));
  const shell = route?.shell ?? 'payments';
  return (
    <div className={`app shell-${shell}`}>
      <TopBar onMenu={() => setMenu(!menu)} />
      <div className="app-body">
        {shell === 'payments' && <Sidebar open={menu} onClose={() => setMenu(false)} />}
        <main className="app-main">
          <ModelProvider>
            <Routes>
              {ROUTES.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <DemoPlayer />
          </ModelProvider>
        </main>
      </div>
      <ConceptBar />
    </div>
  );
}
