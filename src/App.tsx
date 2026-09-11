// ============================================================
// ZHINO — application shell + routes
//
// Two areas, one app:
//   - /admin/*  — the admin panel: its own shell (sidebar, no
//     storefront header/footer/sounds) behind AdminGate.
//   - everything else — the existing storefront, unchanged:
//     same Layout, same routes, same guards.
//
// GitHub Pages: the router basename is resolved from the actual
// mount point at runtime ("/" on the custom domain, "/zheno-website"
// on the repository URL — see main.tsx / utils/siteBase.ts), and the
// built 404.html fallback (vite.config.ts) keeps deep links +
// refresh working for /admin/* exactly like every other route.
// ============================================================

import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import RecipesPage from './pages/RecipesPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import NotFoundPage from './pages/NotFoundPage';
import { AdminAuthProvider } from './admin/auth/AuthContext';
import AdminGate from './admin/AdminGate';
import AdminLoginPage from './admin/pages/AdminLoginPage';
import AdminDashboardPage from './admin/pages/AdminDashboardPage';
import AdminProductsPage from './admin/pages/AdminProductsPage';
import AdminOrdersPage from './admin/pages/AdminOrdersPage';
import AdminInventoryPage from './admin/pages/AdminInventoryPage';
import AdminRecipesPage from './admin/pages/AdminRecipesPage';
import AdminSiteContentPage from './admin/pages/AdminSiteContentPage';
import AdminSettingsPage from './admin/pages/AdminSettingsPage';

/** Storefront — the existing shell and routes, kept intact. */
function Storefront() {
  return (
    <Layout>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        {/* admin — login is public, everything else sits behind the gate */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminGate />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="inventory" element={<AdminInventoryPage />} />
          <Route path="recipes" element={<AdminRecipesPage />} />
          <Route path="site-content" element={<AdminSiteContentPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Route>

        {/* storefront — every existing route, unchanged */}
        <Route path="*" element={<Storefront />} />
      </Routes>
    </AdminAuthProvider>
  );
}
