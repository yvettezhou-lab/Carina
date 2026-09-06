import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { ensureSeedData } from '@/services/seed';
import './styles.css';
import './quick-entry-fix.css';

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return <main className="fatal-error"><div className="fatal-mark">𝒞</div><h1>The ledger needs a moment.</h1><p>Please reload Carina. Your local data has not been deleted.</p><button onClick={() => location.reload()}>Reload</button></main>;
    return this.props.children;
  }
}

async function bootstrap() {
  try {
    await ensureSeedData();
  } catch (error) {
    console.error('Carina bootstrap failed', error);
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>
    </React.StrictMode>
  );
}

void bootstrap();
