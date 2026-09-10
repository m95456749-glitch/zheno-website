// ============================================================
// ZHINO — admin route guard
// No session → the login page (replace, so «back» doesn't loop).
// ============================================================

import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from './auth/AuthContext';
import AdminLayout from './AdminLayout';

export default function AdminGate() {
  const { session } = useAdminAuth();

  if (!session) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
