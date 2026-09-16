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
import { startCatalogSync } from './services/catalogSync';
import './index.css';
import './admin/admin.css';

// Resolved from the actual mount point at runtime: "/" on the custom
// domain (and in dev), "/zheno-website" on the repository URL. A
// hardcoded basename here is what rendered a blank page wherever the
// mount point disagreed with it.
const basename = getSiteBase();

// Connect the catalog to Supabase when VITE_SUPABASE_URL +
// VITE_SUPABASE_PUBLISHABLE_KEY are set. Fire-and-forget: the app
// renders from the local/base data immediately and swaps in the
// database rows as soon as they arrive; with no configuration (or no
// network) nothing changes and the storefront keeps working.
try {
  startCatalogSync();
} catch (err) {
  console.warn('[zhino] catalog sync not started:', err);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <CartProvider>
          <App />
        </CartProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
