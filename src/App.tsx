import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { ROUTES } from './routes';
import { PrototypeBar } from './ui/components/PrototypeBar';
import { RayNav } from './ui/components/RayNav';
import { DemoPlayer } from './ui/components/DemoPlayer';
import { CONCEPT_LABEL } from './ui/components/bits';
import { ModelProvider } from './state/ModelContext';

function NotFound() {
  return <div className="state-box"><b>Page not found.</b><Link to="/" className="btn secondary">Go to Ray home</Link></div>;
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { if (!/jsdom/.test(navigator.userAgent)) window.scrollTo(0, 0); }, [pathname]);
  const studio = pathname === '/studio';
  return (
    <>
      <PrototypeBar />
      <main>
        <div className={`frame ${studio ? 'dark' : ''}`}>
          {!studio && <RayNav />}
          <ModelProvider>
            <Routes>
              {ROUTES.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <DemoPlayer />
          </ModelProvider>
        </div>
      </main>
      <footer className="foot">{CONCEPT_LABEL} Razorpay, Ray, Magic Checkout and Agent Studio are mentioned only to describe the concept; no brand assets are used.</footer>
    </>
  );
}
