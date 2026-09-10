// ============================================================
// ZHINO — entry point
// ============================================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CartProvider } from './context/CartContext';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import './admin/admin.css';

// BASE_URL is "/" in dev and "/zheno-website/" in the production build,
// so the router basename always matches the deployed sub-path.
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

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
