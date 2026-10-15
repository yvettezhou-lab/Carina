import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { ensureSeedData } from '@/services/seed';
import './styles.css';
import './quick-entry-fix.css';

// Centralized PWA update lifecycle: check on launch and reload when a new worker takes control.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  let registration: ServiceWorkerRegistration | undefined;
  let updateInFlight = false;
  const checkForUpdates = async () => {
    if (document.visibilityState === 'hidden' || updateInFlight) return;
    updateInFlight = true;
    try {
      registration ??= await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      await registration.update();
    } catch (error) {
      console.warn('Carina update check failed', error);
    } finally {
      updateInFlight = false;
    }
  };
  window.addEventListener('load', () => { void checkForUpdates(); }, { once: true });
  window.addEventListener('pageshow', () => { void checkForUpdates(); });
  window.addEventListener('focus', () => { void checkForUpdates(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdates();
  });
  window.setInterval(() => { void checkForUpdates(); }, 5 * 60 * 1000);
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return <main className="fatal-error"><div className="fatal-mark">𝒞</div><h1>The ledger needs a moment.</h1><p>Please reload Carina. Your local data has not been deleted.</p><button onClick={() => location.reload()}>Reload</button></main>;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  </React.StrictMode>
);

void ensureSeedData().catch((error) => {
  console.error('Carina bootstrap failed', error);
});
