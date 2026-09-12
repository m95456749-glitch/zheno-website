// ============================================================
// ZHINO — entry point
// ============================================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CartProvider } from './context/CartContext';
import ErrorBoundary from './components/ErrorBoundary';
import { getSiteBase } from './utils/siteBase';
import { SupabaseBootstrap } from './services/supabase/hydration';
import './index.css';
import './admin/admin.css';

// Resolved from the actual mount point at runtime: "/" on the custom
// domain (and in dev), "/zheno-website" on the repository URL. A
// hardcoded basename here is what rendered a blank page wherever the
// mount point disagreed with it.
const basename = getSiteBase();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <CartProvider>
          <SupabaseBootstrap>
            <App />
          </SupabaseBootstrap>
        </CartProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
